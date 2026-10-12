import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { paymentBody, handle } from "@/lib/http";
const from = `G${"A".repeat(55)}`;
const request = (body: unknown) =>
  new Request("http://localhost/api/pay", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("PAIFLOW_MODE", "demo");
  vi.stubEnv("PAIFLOW_API_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each([
  null,
  [],
  {},
  { from, amount: 1 },
  { from, amount: "0" },
  { from, amount: "1.5" },
  { from: "secret", amount: "1" },
  { from, amount: (1n << 127n).toString() },
  { signedXdr: "" },
  { signedXdr: "signed", amount: "1" },
])("refuses malformed payment body %j", async (body) => {
  const response = await handle(() => paymentBody(request(body)));
  expect(response.status).toBe(422);
});
it("refuses malformed recipients and accepts documented payout bodies", async () => {
  await expect(
    paymentBody(request({ from, amount: "1", recipient: "S-secret" }), true),
  ).rejects.toThrow();
  expect(
    await paymentBody(
      request({ from, amount: "1", recipient: from, nodeId: "pay" }),
      true,
    ),
  ).toEqual({ from, amount: "1", recipient: from, nodeId: "pay" });
});
it("blocks demo payout and rejects invalid cursors before upstream calls", async () => {
  const { POST } = await import("@/app/api/payout/route");
  expect((await POST(request({ signedXdr: "signed" }))).status).toBe(422);
  const { GET } = await import("@/app/api/events/route");
  expect(
    (await GET(new Request("http://localhost/api/events?cursor="))).status,
  ).toBe(422);
  expect(
    (await GET(new Request("http://localhost/api/events?token=bad"))).status,
  ).toBe(422);
});

it.each([undefined, "prepare"])(
  "blocks direct events, payment and payout requests in mode %s with zero upstream requests",
  async (mode) => {
    vi.stubEnv("PAIFLOW_MODE", mode);
    vi.stubEnv("PAIFLOW_API_TOKEN", `pfk_${"a".repeat(64)}`);
    vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", "11111111-1111-4111-8111-111111111111");
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("@/app/api/events/route");
    const { POST: pay } = await import("@/app/api/pay/route");
    const { POST: payout } = await import("@/app/api/payout/route");
    const responses = [
      await GET(new Request("http://localhost/api/events")),
      await pay(request({ from, amount: "1" })),
      await pay(request({ signedXdr: "same-envelope" })),
      await payout(request({ from, amount: "1", recipient: from })),
      await payout(request({ signedXdr: "same-envelope" })),
      await pay(
        new Request("http://localhost/api/pay", {
          method: "POST",
          body: "invalid JSON",
        }),
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "PREPARATION_MODE",
          message:
            "Payments and the live feed are disabled in preparation mode.",
        },
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(["invalid", "team"])(
  "blocks invalid or incomplete %s configuration before any upstream request",
  async (mode) => {
    vi.stubEnv("PAIFLOW_MODE", mode);
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    const { GET } = await import("@/app/api/events/route");
    const { POST: pay } = await import("@/app/api/pay/route");
    const { POST: payout } = await import("@/app/api/payout/route");
    for (const response of [
      await GET(new Request("http://localhost/api/events")),
      await pay(request({ from, amount: "1" })),
      await payout(request({ signedXdr: "same-envelope" })),
    ]) {
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe("CONFIGURATION");
    }
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("allows team routes and preserves exact-envelope retries and upstream errors", async () => {
  vi.stubEnv("PAIFLOW_MODE", "team");
  vi.stubEnv("PAIFLOW_BASE_URL", "http://localhost:3000");
  vi.stubEnv("PAIFLOW_API_TOKEN", `pfk_${"a".repeat(64)}`);
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", "11111111-1111-4111-8111-111111111111");
  const fetch = vi.fn<typeof globalThis.fetch>();
  const ok = (data: unknown) => new Response(JSON.stringify({ data }));
  fetch
    .mockResolvedValueOnce(ok({ items: [], nextCursor: null, hasMore: false }))
    .mockResolvedValueOnce(ok({ network: "testnet" }))
    .mockResolvedValueOnce(ok({ txHash: "a".repeat(64), status: "PENDING" }))
    .mockResolvedValueOnce(ok({ network: "testnet" }))
    .mockResolvedValueOnce(ok({ txHash: "a".repeat(64), status: "SUCCESS" }))
    .mockResolvedValueOnce(ok({ network: "testnet" }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "CONFLICT", message: "Wait for finality" },
        }),
        {
          status: 409,
          headers: { "Retry-After": "12", "x-request-id": "request-123" },
        },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const { GET } = await import("@/app/api/events/route");
  const { POST: pay } = await import("@/app/api/pay/route");
  const { POST: payout } = await import("@/app/api/payout/route");
  const events = await GET(new Request("http://localhost/api/events"));
  expect(events.status).toBe(200);
  expect((await events.json()).data.mode).toBe("team");
  const pending = await pay(request({ signedXdr: "same-envelope" }));
  const confirmed = await pay(request({ signedXdr: "same-envelope" }));
  expect((await pending.json()).data.status).toBe("PENDING");
  expect((await confirmed.json()).data.status).toBe("SUCCESS");
  const submits = fetch.mock.calls.filter(([url]) =>
    String(url).includes("/execute/submit"),
  );
  expect(submits).toHaveLength(2);
  expect(submits[0]![1]!.body).toBe(submits[1]![1]!.body);
  const denied = await payout(request({ from, amount: "1", recipient: from }));
  expect(denied.status).toBe(403);
  const conflict = await pay(request({ from, amount: "1" }));
  expect(conflict.status).toBe(409);
  expect(conflict.headers.get("Retry-After")).toBe("12");
  expect(conflict.headers.get("x-request-id")).toBe("request-123");
});
