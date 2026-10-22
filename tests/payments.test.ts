import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Account, Networks, Operation, TransactionBuilder, Keypair } from "@stellar/stellar-sdk";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fixtureAddress, fixturePrepared } from "./transaction-fixture";
import { envelopeHash } from "@/lib/transaction";
import {
  feesWithStatus,
  prepareFeePayment,
  publicPayment,
  refreshFeePayment,
  submitFeePayment,
} from "@/lib/payments";
import { getPayment } from "@/lib/store";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  prepare: vi.fn(),
  submit: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@paiflow/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paiflow/sdk")>();
  return {
    ...actual,
    Paiflow: class {
      constructor(_options: unknown) {}
      deployment() {
        return {
          capabilities: { get: mocks.get },
          execute: { prepare: mocks.prepare, submit: mocks.submit },
          transactions: { get: mocks.status },
        };
      }
    },
  };
});
const id = "12345678-1234-1234-1234-123456789abc";
const hash = envelopeHash(fixturePrepared.xdr);
const futurePrepared = {
  ...fixturePrepared,
  expiresAt: "2999-01-01T00:00:00Z",
};
let dir: string;
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(path.join(tmpdir(), "clearpay-payments-"));
  vi.stubEnv("CLEARPAY_STORE_PATH", path.join(dir, "store.json"));
  vi.stubEnv("PAIFLOW_BASE_URL", "https://beta.app.paiflow.xyz");
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", id);
  vi.stubEnv("PAIFLOW_API_TOKEN", "pfd_" + "a".repeat(64));
  mocks.get.mockResolvedValue({
    data: {
      network: "testnet",
      inputAsset: { kind: "native" },
      triggerType: "deposit",
      operations: { execute: { status: "supported" } },
    },
  });
  mocks.prepare.mockResolvedValue({
    data: futurePrepared,
    metadata: { historyRequestId: "preparation-evidence" },
  });
  mocks.submit.mockResolvedValue({ data: { txHash: hash, status: "PENDING" } });
  mocks.status.mockResolvedValue({
    data: { txHash: hash, status: "PENDING", network: "testnet" },
  });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("prepares a server-computed ₱560 allocation for both fees and persists a PREPARED record", async () => {
  const { payment, prepared } = await prepareFeePayment(fixtureAddress, [
    "registrar",
    "faculty-secretary",
  ]);
  expect(prepared.txHash).toBe(hash);
  expect(payment.totalCentavos).toBe(56000);
  expect(payment.totalDisplay).toBe("₱560");
  expect(payment.status).toBe("PREPARED");
  expect(payment.allocations.map((a) => a.office)).toEqual([
    "Faculty Secretary",
    "Registrar",
  ]);
  expect(mocks.prepare).toHaveBeenCalledWith({
    from: fixtureAddress,
    amount: "10000000",
  });
  const stored = getPayment(payment.id);
  expect(stored?.status).toBe("PREPARED");
  expect(stored?.preparationRequestId).toBe("preparation-evidence");
  expect(stored?.txHash).toBe(hash);
});
it("rejects unknown selections and refuses a second active payment for the same student", async () => {
  await expect(
    prepareFeePayment(fixtureAddress, ["faculty-secretary", "fake"]),
  ).rejects.toThrow("Unknown fee");
  expect(mocks.prepare).not.toHaveBeenCalled();
  await prepareFeePayment(fixtureAddress, ["registrar"]);
  await expect(
    prepareFeePayment(fixtureAddress, ["faculty-secretary"]),
  ).rejects.toThrow("still unresolved");
});
it("submit verifies the exact signed envelope before any upstream call", async () => {
  const { payment } = await prepareFeePayment(fixtureAddress, ["registrar"]);
  const changedEnvelope = new TransactionBuilder(
    new Account(fixtureAddress, "8"),
    { fee: "100", networkPassphrase: Networks.TESTNET },
  )
    .addOperation(Operation.manageData({ name: "changed", value: "body" }))
    .setTimeout(180)
    .build()
    .toXDR();
  await expect(
    submitFeePayment(payment.id, changedEnvelope),
  ).rejects.toThrow("changed");
  expect(mocks.submit).not.toHaveBeenCalled();
  expect(getPayment(payment.id)?.status).toBe("PREPARED");
});
it("submit marks the record SUBMITTED and reports the transaction status", async () => {
  const { payment } = await prepareFeePayment(fixtureAddress, ["registrar"]);
  const { payment: updated, result } = await submitFeePayment(
    payment.id,
    futurePrepared.xdr,
  );
  expect(result).toEqual({ txHash: hash, status: "PENDING", network: "testnet" });
  expect(updated.status).toBe("SUBMITTED");
  expect(mocks.submit).toHaveBeenCalledWith(
    { signedXdr: futurePrepared.xdr },
    { wait: false, preparationRequestId: "preparation-evidence" },
  );
});
it("only SUCCESS confirms the payment; PENDING keeps it unresolved", async () => {
  const { payment } = await prepareFeePayment(fixtureAddress, ["registrar"]);
  await submitFeePayment(payment.id, futurePrepared.xdr);
  const pending = await refreshFeePayment(payment.id);
  expect(pending.payment.status).toBe("SUBMITTED");
  expect(pending.payment.verifiedAt).toBeUndefined();
  mocks.status.mockResolvedValue({
    data: { txHash: hash, status: "SUCCESS", network: "testnet" },
  });
  const confirmed = await refreshFeePayment(payment.id);
  expect(confirmed.payment.status).toBe("CONFIRMED");
  expect(confirmed.payment.verifiedAt).toBeDefined();
  const stored = getPayment(payment.id);
  expect(stored?.status).toBe("CONFIRMED");
});
it("FAILED and REJECTED transactions become final ledger states", async () => {
  const { payment } = await prepareFeePayment(fixtureAddress, ["registrar"]);
  mocks.status.mockResolvedValue({
    data: { txHash: hash, status: "FAILED", network: "testnet" },
  });
  expect((await refreshFeePayment(payment.id)).payment.status).toBe("FAILED");
  mocks.status.mockResolvedValue({
    data: { txHash: hash, status: "REJECTED", network: "testnet" },
  });
  expect((await refreshFeePayment(payment.id)).payment.status).toBe("REJECTED");
});
it("marks fees paid only from CONFIRMED records for the same student", async () => {
  const before = feesWithStatus(fixtureAddress);
  expect(before.map((f) => f.paid)).toEqual([false, false]);
  const { payment } = await prepareFeePayment(fixtureAddress, [
    "faculty-secretary",
    "registrar",
  ]);
  mocks.status.mockResolvedValue({
    data: { txHash: hash, status: "SUCCESS", network: "testnet" },
  });
  await refreshFeePayment(payment.id);
  const after = feesWithStatus(fixtureAddress);
  expect(after.map((f) => f.paid)).toEqual([true, true]);
  const other = feesWithStatus(
    Keypair.fromRawEd25519Seed(Buffer.alloc(32, 8)).publicKey(),
  );
  expect(other.map((f) => f.paid)).toEqual([false, false]);
});
it("public view never exposes the prepared envelope", async () => {
  const { payment } = await prepareFeePayment(fixtureAddress, ["registrar"]);
  const stored = getPayment(payment.id);
  expect(stored).toBeDefined();
  const view = publicPayment(stored!);
  expect(JSON.stringify(view)).not.toContain("preparedXdr");
  expect(JSON.stringify(view)).not.toContain(stored!.preparedXdr);
  expect(view.txHash).toBe(hash);
});
