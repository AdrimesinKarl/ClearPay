import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mockFetch = vi.fn<typeof fetch>();
import { fixturePrepared, fixtureTransaction } from "./transaction-fixture";
const prepared = fixturePrepared;
const from = `G${"A".repeat(55)}`;
const token = `pfk_${"a".repeat(64)}`;
const deployment = "11111111-1111-4111-8111-111111111111";
const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("__paiflowDemoCache", undefined);
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("PAIFLOW_MODE", "team");
  vi.stubEnv("PAIFLOW_BASE_URL", "http://localhost:3000");
  vi.stubEnv("PAIFLOW_API_TOKEN", token);
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", deployment);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("typed Paiflow client (llms.md §4)", () => {
  it("prepares execute with bearer only in the upstream server request", async () => {
    mockFetch.mockResolvedValue(ok(prepared));
    const api = await import("@/lib/paiflow");
    expect(await api.prepareExecute({ from, amount: "10000000" })).toEqual({
      ...prepared,
      txHash: Buffer.from(fixtureTransaction.hash()).toString("hex"),
    });
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe(
      `http://localhost:3000/api/v1/deployments/${deployment}/execute`,
    );
    expect(options?.headers).toEqual({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(options!.body as string)).toEqual({
      from,
      amount: "10000000",
    });
    expect(JSON.stringify(api.publicConfig())).not.toContain(token);
  });
  it.each(["SUCCESS", "PENDING", "FAILED"] as const)(
    "preserves HTTP 200 %s submission",
    async (status) => {
      const submitted = {
        txHash: "a".repeat(64),
        status,
        ...(status === "FAILED"
          ? { error: { code: "txBadAuth", message: "Signature missing" } }
          : {}),
      };
      mockFetch.mockResolvedValue(ok(submitted));
      const api = await import("@/lib/paiflow");
      expect(
        await api.submitExecute({ signedXdr: "same-envelope" }, false),
      ).toEqual(submitted);
      expect(String(mockFetch.mock.calls[0]![0])).toContain(
        "execute/submit?wait=false",
      );
    },
  );
  it("uses cursor/limit/txHash unchanged; omits empty cursor", async () => {
    const page = {
      items: [
        {
          id: "1",
          eventId: "event-1",
          kind: "PAYOUT",
          topic: "swap",
          ledger: 1,
          txHash: "a".repeat(64),
          occurredAt: "2026-10-01T12:00:00Z",
          data: { amountIn: "10000000" },
        },
      ],
      nextCursor: "opaque+/=",
      hasMore: true,
    };
    mockFetch.mockImplementation(async () => ok(page));
    const api = await import("@/lib/paiflow");
    expect(
      await api.listEvents({
        cursor: "opaque+/=",
        limit: 50,
        txHash: "a".repeat(64),
      }),
    ).toEqual(page);
    expect(
      new URL(String(mockFetch.mock.calls[0]![0])).searchParams.get("cursor"),
    ).toBe("opaque+/=");
    await api.listEvents({ cursor: "" });
    expect(String(mockFetch.mock.calls[1]![0])).not.toContain("cursor=");
  });
  it("prepares payout with optional nodeId and submits the exact envelope", async () => {
    const payout = {
      ...prepared,
      nodeId: "pay",
      expiresAt: "2026-10-01T12:01:00Z",
    };
    mockFetch
      .mockResolvedValueOnce(ok(payout))
      .mockResolvedValueOnce(ok({ txHash: "b".repeat(64), status: "PENDING" }))
      .mockResolvedValueOnce(
        ok({ txHash: "b".repeat(64), status: "SUCCESS", ledger: 42 }),
      );
    const api = await import("@/lib/paiflow");
    expect(
      await api.preparePayout({
        from,
        amount: "10000000",
        recipient: from,
        nodeId: "pay",
      }),
    ).toEqual(payout);
    expect(JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)).toEqual({
      from,
      amount: "10000000",
      recipient: from,
      nodeId: "pay",
    });
    expect(String(mockFetch.mock.calls[0]![0])).toMatch(/\/payouts$/);
    expect((await api.submitPayout({ signedXdr: "same" })).status).toBe(
      "PENDING",
    );
    expect((await api.submitPayout({ signedXdr: "same" })).status).toBe(
      "SUCCESS",
    );
    expect(mockFetch.mock.calls[1]![1]!.body).toBe(
      mockFetch.mock.calls[2]![1]!.body,
    );
    expect(String(mockFetch.mock.calls[1]![0])).toMatch(
      /payouts\/submit\?wait=true$/,
    );
  });
  it("releaseEarly sends only the documented request", async () => {
    mockFetch.mockResolvedValue(
      ok({ nodeId: "deadline", txHash: "c".repeat(64) }),
    );
    const api = await import("@/lib/paiflow");
    await api.releaseEarly({ nodeId: "deadline" });
    expect(String(mockFetch.mock.calls[0]![0])).toMatch(/release-early$/);
    expect(mockFetch.mock.calls[0]![1]!.body).toBe('{"nodeId":"deadline"}');
  });
  it.each([409, 429, 502])(
    "retains HTTP %s, code, Retry-After and request id through the proxy",
    async (status) => {
      const error = {
        code:
          status === 429
            ? "RATE_LIMITED"
            : status === 409
              ? "CONFLICT"
              : "UPSTREAM_RPC",
        message: "Wait for finality",
      };
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error }), {
          status,
          headers: { "Retry-After": "12", "x-request-id": "request-123" },
        }),
      );
      const api = await import("@/lib/paiflow");
      const { handle } = await import("@/lib/http");
      const response = await handle(() =>
        api.preparePayout({ from, amount: "1", recipient: from }),
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("Retry-After")).toBe("12");
      expect(response.headers.get("x-request-id")).toBe("request-123");
      expect(await response.json()).toEqual({ error });
    },
  );
  it("redacts unexpected upstream response bodies", async () => {
    mockFetch.mockResolvedValue(
      new Response(`secret ${token}`, { status: 502 }),
    );
    const api = await import("@/lib/paiflow");
    const { handle } = await import("@/lib/http");
    const response = await handle(() => api.listEvents());
    expect(await response.text()).not.toContain(token);
  });
});
describe("demo cache", () => {
  beforeEach(() => {
    vi.stubEnv("PAIFLOW_MODE", "demo");
  });
  it("mints once across concurrent requests, reuses, refreshes two minutes before expiry", async () => {
    vi.stubEnv("PAIFLOW_API_TOKEN", "");
    vi.stubEnv("PAIFLOW_BASE_URL", "");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    let mints = 0;
    mockFetch.mockImplementation(async (url) => {
      if (String(url).endsWith("demo-token")) {
        mints++;
        return ok(
          {
            deploymentId: deployment,
            token,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          201,
        );
      }
      return ok({ items: [], nextCursor: null, hasMore: false });
    });
    const api = await import("@/lib/paiflow");
    await Promise.all([api.listEvents(), api.listEvents(), api.listEvents()]);
    expect(mints).toBe(1);
    expect(api.publicConfig()).toEqual({ mode: "demo", deploymentUrl: null });
    vi.advanceTimersByTime(57 * 60_000);
    await api.listEvents();
    expect(mints).toBe(1);
    vi.advanceTimersByTime(60_000);
    await api.listEvents();
    expect(mints).toBe(2);
    expect(String(mockFetch.mock.calls[0]![0])).toBe(
      "https://beta.app.paiflow.xyz/api/v1/demo-token",
    );
  });
  it("shares demo credentials across independently loaded route modules", async () => {
    vi.stubEnv("PAIFLOW_API_TOKEN", "");
    mockFetch
      .mockResolvedValueOnce(
        ok(
          {
            deploymentId: deployment,
            token,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        ok({ items: [], nextCursor: null, hasMore: false }),
      )
      .mockResolvedValueOnce(ok(prepared));
    const eventsModule = await import("@/lib/paiflow");
    await eventsModule.listEvents();
    vi.resetModules();
    const payModule = await import("@/lib/paiflow");
    await payModule.prepareExecute({ from, amount: "1" });
    expect(
      mockFetch.mock.calls.filter(([url]) =>
        String(url).endsWith("demo-token"),
      ),
    ).toHaveLength(1);
  });
  it("preserves disabled-demo and rate-limit errors, recovers after mint failure", async () => {
    vi.stubEnv("PAIFLOW_API_TOKEN", "");
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "FORBIDDEN", message: "Demo disabled" },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        ok(
          {
            deploymentId: deployment,
            token,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        ok({ items: [], nextCursor: null, hasMore: false }),
      );
    const api = await import("@/lib/paiflow");
    await expect(api.listEvents()).rejects.toMatchObject({
      status: 403,
      api: { code: "FORBIDDEN" },
    });
    await api.listEvents();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe("preparation and explicit integration modes", () => {
  it.each([undefined, "prepare"])(
    "blocks every upstream helper in mode %s even with team credentials present",
    async (mode) => {
      vi.stubEnv("PAIFLOW_MODE", mode);
      const api = await import("@/lib/paiflow");
      expect(api.publicConfig()).toEqual({
        mode: "prepare",
        deploymentUrl: null,
      });
      const calls = [
        () => api.prepareExecute({ from, amount: "1" }),
        () => api.submitExecute({ signedXdr: "same-envelope" }),
        () => api.listEvents(),
        () => api.preparePayout({ from, amount: "1", recipient: from }),
        () => api.submitPayout({ signedXdr: "same-envelope" }),
        () => api.releaseEarly(),
        () => api.getOpenApi("http://localhost:3000"),
        () => api.getDemoToken("http://localhost:3000"),
      ];
      for (const call of calls)
        await expect(call()).rejects.toMatchObject({
          status: 403,
          api: { code: "PREPARATION_MODE" },
        });
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each(["", "typo", "TEAM"])(
    "rejects invalid mode %j without fetching",
    async (mode) => {
      vi.stubEnv("PAIFLOW_MODE", mode);
      const api = await import("@/lib/paiflow");
      await expect(api.listEvents()).rejects.toMatchObject({
        status: 503,
        api: { code: "CONFIGURATION" },
      });
      expect(api.publicConfig()).toEqual({
        mode: "disabled",
        deploymentUrl: null,
        message: "Set PAIFLOW_MODE to prepare, demo or team.",
      });
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["", deployment],
    [token, ""],
    ["invalid-token", deployment],
    [token, "invalid-deployment"],
  ])(
    "refuses incomplete or malformed team configuration without demo fallback",
    async (teamToken, teamDeployment) => {
      vi.stubEnv("PAIFLOW_API_TOKEN", teamToken);
      vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", teamDeployment);
      const api = await import("@/lib/paiflow");
      await expect(api.listEvents()).rejects.toMatchObject({
        status: 503,
        api: { code: "CONFIGURATION" },
      });
      expect(api.publicConfig().mode).toBe("disabled");
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "invalid-origin",
    "https://private-user:private-password@example.com",
    "https://example.com/path",
  ])(
    "returns a configuration error without exposing an invalid origin",
    async (origin) => {
      vi.stubEnv("PAIFLOW_BASE_URL", origin);
      const api = await import("@/lib/paiflow");
      await expect(api.listEvents()).rejects.toMatchObject({
        status: 503,
        api: { code: "CONFIGURATION" },
      });
      expect(JSON.stringify(api.publicConfig())).not.toContain(origin);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it("exposes only non-secret configuration for an explicitly selected team", async () => {
    const api = await import("@/lib/paiflow");
    expect(api.publicConfig()).toEqual({
      mode: "team",
      deploymentUrl: `http://localhost:3000/deployments/${deployment}`,
    });
    expect(JSON.stringify(api.publicConfig())).not.toContain(token);
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(
      api.getDemoToken("http://localhost:3000"),
    ).rejects.toMatchObject({
      status: 403,
      api: { code: "FORBIDDEN" },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses explicit demo mode despite existing team credentials and blocks its cached token after returning to preparation", async () => {
    vi.stubEnv("PAIFLOW_MODE", "demo");
    mockFetch
      .mockResolvedValueOnce(
        ok(
          {
            deploymentId: deployment,
            token,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        ok({ items: [], nextCursor: null, hasMore: false }),
      );
    const api = await import("@/lib/paiflow");
    await api.listEvents();
    expect(String(mockFetch.mock.calls[0]![0])).toMatch(/\/demo-token$/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.stubEnv("PAIFLOW_MODE", "prepare");
    await expect(api.listEvents()).rejects.toMatchObject({
      api: { code: "PREPARATION_MODE" },
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
