import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fixturePrepared, fixtureTransaction } from "./transaction-fixture";
const fetchMock = vi.fn<typeof fetch>();
const id = "11111111-1111-4111-8111-111111111111";
const ok = (data: unknown) => new Response(JSON.stringify({ data }));
beforeEach(() => {
  vi.stubEnv("PAIFLOW_MODE", "team");
  vi.stubEnv("PAIFLOW_BASE_URL", "http://localhost:3000");
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", id);
  vi.stubEnv("PAIFLOW_API_TOKEN", `pfk_${"b".repeat(64)}`);
  vi.stubEnv("PAIFLOW_WEBHOOK_SECRET", "server-only-test-secret");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses exact published funding and Schedule/Subscription endpoint shapes", async () => {
  const api = await import("@/lib/paiflow");
  fetchMock.mockImplementation(async () => ok({ network: "testnet" }));
  await api.prepareFunding({
    fromAddress: `G${"A".repeat(55)}`,
    tokenContractAddress: `C${"B".repeat(55)}`,
    amountStroops: "1",
    nodeId: "pool",
  });
  await api.submitFunding({
    intent: id,
    signedXdr: "same",
    action: "schedule.fund",
  });
  await api.reconcileFunding({ intent: id, action: "schedule.fund" });
  await api.prepareSchedule("pause", {
    walletAddress: `G${"A".repeat(55)}`,
    nodeId: "stream",
  });
  await api.prepareSubscription("cancel", {
    walletAddress: `G${"A".repeat(55)}`,
  });
  expect(
    fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname),
  ).toEqual(
    [
      "funding",
      "funding/submit",
      "funding/reconcile",
      "schedule/pause",
      "subscription/cancel/prepare",
    ].map((p) => `/api/v1/deployments/${id}/${p}`),
  );
  expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({
    intent: id,
    signedXdr: "same",
    action: "schedule.fund",
  });
});
it("uses amountStroops query for selected-node quotes", async () => {
  fetchMock.mockResolvedValue(ok({}));
  const api = await import("@/lib/paiflow");
  await api.swapQuote({ amount: "1234567890123456789", nodeId: "swap 1" });
  const url = new URL(String(fetchMock.mock.calls[0]![0]));
  expect(url.searchParams.get("amountStroops")).toBe("1234567890123456789");
  expect(url.searchParams.get("nodeId")).toBe("swap 1");
  expect(url.searchParams.has("amount")).toBe(false);
});
it("normalizes public allowance network and transaction maxTime using live state", async () => {
  const intent =
    Buffer.from(JSON.stringify({ maxTime: "1790000000" })).toString(
      "base64url",
    ) + ".mac";
  fetchMock
    .mockResolvedValueOnce(ok({ network: "testnet" }))
    .mockResolvedValueOnce(
      ok({
        xdr: "unsigned",
        intent,
        txHash: "a".repeat(64),
        networkPassphrase: "Test SDF Network ; September 2015",
      }),
    );
  const api = await import("@/lib/paiflow");
  const p = await api.prepareAllowance({
    userAddress: `G${"A".repeat(55)}`,
    amount: "1",
  });
  expect(p.network).toBe("testnet");
  expect(p.expiresAt).toBe(new Date(1790000000000).toISOString());
  expect(new URL(String(fetchMock.mock.calls[1]![0])).pathname).toBe(
    `/api/deployments/${id}/subscription-allowance`,
  );
});
it("keeps execute preparation linkage for the same envelope submit", async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: fixturePrepared }), {
        headers: { "x-history-request-id": id },
      }),
    )
    .mockResolvedValueOnce(ok({ status: "PENDING" }));
  const api = await import("@/lib/paiflow");
  const p = await api.prepareExecute({
    from: `G${"A".repeat(55)}`,
    amount: "1",
  });
  expect(p.txHash).toBe(Buffer.from(fixtureTransaction.hash()).toString("hex"));
  expect(p.xdr).toBe(fixturePrepared.xdr);
  await api.submitExecute(
    { signedXdr: "original" },
    true,
    p.preparationRequestId,
  );
  expect(fetchMock.mock.calls[1]![1]!.headers).toMatchObject({
    "x-preparation-request-id": id,
  });
});
it("retries Webhook callback with identical stable payload/key and server secret", async () => {
  fetchMock.mockImplementation(async (url) =>
    String(url).includes("capabilities")
      ? ok({ network: "testnet" })
      : ok({ attemptId: id, status: "UNKNOWN" }),
  );
  const api = await import("@/lib/paiflow");
  const record = {
    key: "completed-task-42",
    payload: { escrow: true as const, amount: "10000000" },
  };
  await api.webhookReward(record);
  await api.webhookReward(record);
  const calls = fetchMock.mock.calls.filter(([url]) =>
    String(url).includes("/api/webhooks/"),
  );
  expect(calls).toHaveLength(2);
  expect(calls[0]![1]!.body).toBe(calls[1]![1]!.body);
  expect(calls[0]![1]!.headers).toMatchObject({
    "Idempotency-Key": "completed-task-42",
    "x-webhook-secret": "server-only-test-secret",
  });
});
it.each(["bad key", "x".repeat(129)])(
  "refuses invalid callback idempotency key %s before calling upstream",
  async (key) => {
    const api = await import("@/lib/paiflow");
    await expect(
      api.webhookReward({ key, payload: { escrow: true } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it("refuses mainnet Webhook before sending callback", async () => {
  fetchMock.mockResolvedValue(ok({ network: "mainnet" }));
  const api = await import("@/lib/paiflow");
  await expect(
    api.webhookReward({ key: "task-42", payload: { escrow: true } }),
  ).rejects.toThrow("Testnet");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("refuses fee-bump recovery envelopes and mismatched preparation networks", async () => {
  const { Keypair, Networks, TransactionBuilder } =
    await import("@stellar/stellar-sdk");
  const api = await import("@/lib/paiflow");
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)),
    "100",
    fixtureTransaction,
    Networks.TESTNET,
  );
  expect(() => api.executeHash(feeBump.toXDR())).toThrow(
    /retain recovery evidence/,
  );
  fetchMock.mockResolvedValueOnce(
    ok({ ...fixturePrepared, network: "mainnet" }),
  );
  await expect(
    api.prepareExecute({ from: fixtureTransaction.source, amount: "1" }),
  ).rejects.toMatchObject({ status: 422 });
  fetchMock.mockResolvedValueOnce(
    ok({ ...fixturePrepared, networkPassphrase: Networks.PUBLIC }),
  );
  await expect(
    api.prepareExecute({ from: fixtureTransaction.source, amount: "1" }),
  ).rejects.toMatchObject({ status: 422 });
});
