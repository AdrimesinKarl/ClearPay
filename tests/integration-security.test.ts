import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { GET, POST } from "@/app/api/integration/route";

const token = `pfk_${"a".repeat(64)}`;
const deploymentId = "11111111-1111-4111-8111-111111111111";
const address = `G${"A".repeat(55)}`;
const fetchMock = vi.fn<typeof fetch>();
function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/integration", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function upstream(data: unknown) {
  return new Response(JSON.stringify({ data }));
}
beforeEach(() => {
  vi.stubEnv("PAIFLOW_MODE", "team");
  vi.stubEnv("PAIFLOW_BASE_URL", "http://platform.test");
  vi.stubEnv("PAIFLOW_API_TOKEN", token);
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", deploymentId);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([undefined, "prepare"])(
  "prepare mode blocks all new integration routes (%s)",
  async (mode) => {
    vi.stubEnv("PAIFLOW_MODE", mode);
    const responses = [
      await GET(
        new Request("http://localhost/api/integration?read=capabilities"),
      ),
      await POST(
        request({
          operation: "funding",
          phase: "submit",
          input: { signedXdr: "saved" },
        }),
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("PREPARATION_MODE");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it.each(["https://attacker.test", "null", ""])(
  "rejects cross-origin mutation %s before contacting Paiflow",
  async (origin) => {
    const response = await POST(
      request({ operation: "funding", phase: "prepare", input: {} }, origin),
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it.each([
  "schedule.pause",
  "schedule.resume",
  "schedule.retrieve",
  "releaseEarly",
])("denies %s without application authorization", async (operation) => {
  fetchMock.mockResolvedValue(upstream({ network: "testnet" }));
  const response = await POST(
    request({ operation, phase: "prepare", input: { walletAddress: address } }),
  );
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0]![0])).toContain("/capabilities");
});

it("does not allow callers to select arbitrary upstream URLs or actions", async () => {
  const response = await POST(
    request({
      operation: "https://attacker.test",
      phase: "prepare",
      input: {},
    }),
  );
  expect(response.status).toBe(422);
  expect(fetchMock).not.toHaveBeenCalled();
  const read = await GET(
    new Request(
      "http://localhost/api/integration?read=capabilities&url=https://attacker.test",
    ),
  );
  expect(read.status).toBe(422);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses mainnet before preparing or submitting controls", async () => {
  fetchMock.mockResolvedValue(upstream({ network: "mainnet" }));
  const response = await POST(
    request({
      operation: "subscription.cancel",
      phase: "prepare",
      input: { walletAddress: address },
    }),
  );
  expect(response.status).toBe(422);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("preserves support and rate-limit evidence without exposing the server token", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { code: "RATE_LIMITED", message: "Wait before retrying" },
      }),
      {
        status: 429,
        headers: { "Retry-After": "17", "x-request-id": "support-id" },
      },
    ),
  );
  const response = await GET(
    new Request("http://localhost/api/integration?read=capabilities"),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("17");
  expect(response.headers.get("x-request-id")).toBe("support-id");
  expect(await response.text()).not.toContain(token);
});

it("projects public discovery fields without forwarding extra upstream credentials", async () => {
  fetchMock.mockResolvedValue(
    upstream({
      deploymentId,
      network: "testnet",
      triggerType: "deposit",
      configurationSource: "deployment_snapshot",
      inputAsset: { kind: "native" },
      token,
      webhookSecret: "private-webhook-value",
      operations: {
        execute: {
          status: "supported",
          authentication: "deployment_token",
          nodeIds: ["receive"],
          requirements: [],
          token,
        },
        extraProxy: { status: "supported", url: "https://attacker.test" },
      },
    }),
  );
  const response = await GET(
    new Request("http://localhost/api/integration?read=capabilities"),
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain(token);
  expect(text).not.toContain("private-webhook-value");
  expect(text).not.toContain("extraProxy");
  const { data } = JSON.parse(text);
  expect(data.operations.execute.status).toBe("supported");
  expect(data.operations.funding.status).toBe("unsupported");
  expect(data.applicationAuthorization.schedule).toEqual({
    pause: false,
    resume: false,
    retrieve: false,
  });
});

it("reports malformed JSON as local validation rather than an upstream failure", async () => {
  const response = await POST(
    new Request("http://localhost/api/integration", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: "{",
    }),
  );
  expect(response.status).toBe(422);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  { from: address, amount: "1" },
  { signedXdr: "already-signed-mainnet-envelope" },
])(
  "the existing payment route refuses mainnet independently of the browser",
  async (body) => {
    fetchMock.mockResolvedValue(upstream({ network: "mainnet" }));
    const { POST: pay } = await import("@/app/api/pay/route");
    const response = await pay(
      new Request("http://localhost/api/pay", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/capabilities");
  },
);

it("derives legacy original hashes server-side and preserves token/deployment-scoped UNKNOWN", async () => {
  const { fixturePrepared, fixtureTransaction } =
    await import("./transaction-fixture");
  fetchMock.mockResolvedValueOnce(upstream({ network: "testnet" }));
  const hashed = await POST(
    request({
      operation: "execute",
      phase: "prepare",
      input: { xdr: fixturePrepared.xdr },
    }),
  );
  const txHash = Buffer.from(fixtureTransaction.hash()).toString("hex");
  expect(await hashed.json()).toEqual({ data: { txHash } });
  fetchMock
    .mockResolvedValueOnce(upstream({ network: "testnet" }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: "Transaction not available for this deployment",
          },
        }),
        { status: 404 },
      ),
    );
  const reconciled = await POST(
    request({
      operation: "execute",
      phase: "reconcile",
      input: { xdr: fixturePrepared.xdr },
    }),
  );
  expect(await reconciled.json()).toEqual({
    data: { status: "UNKNOWN", txHash },
  });
  const [url, options] = fetchMock.mock.calls[2]!;
  expect(String(url)).toBe(
    `http://platform.test/api/v1/deployments/${deploymentId}/transactions/${txHash}`,
  );
  expect(options?.headers).toMatchObject({ Authorization: `Bearer ${token}` });
  expect(options?.body).toBeUndefined();
});
it("hash recovery rejects invalid envelopes and mainnet without arbitrary upstream access", async () => {
  fetchMock.mockResolvedValueOnce(upstream({ network: "testnet" }));
  const invalid = await POST(
    request({
      operation: "execute",
      phase: "prepare",
      input: { xdr: "invalid" },
    }),
  );
  expect(invalid.status).toBe(422);
  fetchMock.mockResolvedValueOnce(upstream({ network: "mainnet" }));
  const mainnet = await POST(
    request({
      operation: "execute",
      phase: "reconcile",
      input: { xdr: "invalid" },
    }),
  );
  expect(mainnet.status).toBe(422);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
