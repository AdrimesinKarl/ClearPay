import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  addFees,
  addSession,
  deleteSession,
  findActivePayment,
  getPayment,
  getSession,
  listFees,
  listPayments,
  putPayment,
  removeDemoRecords,
} from "@/lib/store";
import type { PaymentRecord, StoredFee } from "@/lib/store";
vi.mock("server-only", () => ({}));
let dir: string;
let storeFile: string;
const record = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: "12345678-1234-1234-1234-123456789abc",
  studentAddress: "G".concat("A".repeat(55)),
  feeIds: ["thesis-partial-registrar"],
  allocations: [
    {
      feeId: "thesis-partial-registrar",
      office: "Registrar",
      label: "Transcript processing fee",
      amountCentavos: 6000,
    },
  ],
  totalCentavos: 6000,
  preparedXdr: "unsigned-xdr",
  preparationRequestId: "prep-1",
  txHash: "a".repeat(64),
  preparedExpiresAt: "2027-01-01T00:00:00Z",
  status: "PREPARED",
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
  ...overrides,
});
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "clearpay-store-"));
  storeFile = path.join(dir, "store.json");
  vi.stubEnv("CLEARPAY_STORE_PATH", storeFile);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("persists payments across separate read operations", () => {
  putPayment(record());
  expect(getPayment("12345678-1234-1234-1234-123456789abc")).toEqual(record());
  expect(listPayments()).toHaveLength(1);
  const onDisk = JSON.parse(readFileSync(storeFile, "utf8"));
  expect(onDisk.payments).toHaveLength(1);
});
it("updates an existing payment in place", () => {
  putPayment(record());
  putPayment(record({ status: "CONFIRMED", verifiedAt: "2026-10-20T01:00:00Z" }));
  expect(listPayments()).toHaveLength(1);
  expect(getPayment("12345678-1234-1234-1234-123456789abc")?.status).toBe(
    "CONFIRMED",
  );
});
it("finds the active payment per student and ignores final records", () => {
  putPayment(record());
  expect(
    findActivePayment("G".concat("A".repeat(55)))?.id,
  ).toBe("12345678-1234-1234-1234-123456789abc");
  putPayment(record({ status: "CONFIRMED" }));
  expect(findActivePayment("G".concat("A".repeat(55)))).toBeUndefined();
  expect(findActivePayment("G".concat("B".repeat(55)))).toBeUndefined();
});
it("manages staff sessions", () => {
  addSession({ token: "s".repeat(64), createdAt: new Date().toISOString() });
  expect(getSession("s".repeat(64))?.token).toBe("s".repeat(64));
  expect(getSession("x".repeat(64))).toBeUndefined();
  deleteSession("s".repeat(64));
  expect(getSession("s".repeat(64))).toBeUndefined();
});
it("treats a corrupt ledger as fatal rather than silently resetting", () => {
  const broken = path.join(dir, "broken.json");
  writeFileSync(broken, JSON.stringify({ payments: "no" }));
  vi.stubEnv("CLEARPAY_STORE_PATH", broken);
  expect(() => listPayments()).toThrow();
});
it("appends staff-issued fees without touching payments or existing fees", () => {
  putPayment(record());
  const first: StoredFee = {
    id: "pre-oral-defense-fee-registrar-abc12345",
    group: "Pre-Oral Defense Fee",
    office: "Registrar",
    label: "Pre-Oral Defense Fee",
    amountCentavos: 50000,
    createdAt: "2026-10-20T00:00:00Z",
  };
  const second: StoredFee = {
    id: "library-fee-def67890",
    office: "Library",
    label: "Library clearance fee",
    amountCentavos: 25000,
    createdAt: "2026-10-20T01:00:00Z",
  };
  addFees([first]);
  addFees([second]);
  expect(listFees()).toEqual([first, second]);
  expect(listPayments()).toHaveLength(1);
  expect(getPayment(record().id)).toEqual(record());
});
it("reads ledgers written before staff fees existed", () => {
  writeFileSync(
    storeFile,
    JSON.stringify({ payments: [record()], sessions: [] }),
  );
  expect(listFees()).toEqual([]);
  expect(listPayments()).toHaveLength(1);
  writeFileSync(
    storeFile,
    JSON.stringify({ payments: [], sessions: [], fees: "no" }),
  );
  expect(() => listPayments()).toThrow();
});
it("removes only demo payments and demo fees, keeping real records", () => {
  const demoFee: StoredFee = {
    id: "pre-oral-defense-registrar-aaaa1111",
    group: "Pre-Oral Defense",
    demo: true,
    office: "Registrar",
    label: "Pre-Oral Defense",
    amountCentavos: 50000,
    createdAt: "2026-10-20T00:00:00Z",
  };
  const realFee: StoredFee = {
    id: "library-fee-bbbb2222",
    office: "Library",
    label: "Library clearance fee",
    amountCentavos: 25000,
    createdAt: "2026-10-20T01:00:00Z",
  };
  addFees([demoFee, realFee]);
  putPayment(record()); // static-fee payment: real
  putPayment(
    record({
      id: "22222222-2222-2222-2222-222222222222",
      feeIds: [demoFee.id],
      status: "CONFIRMED",
      verifiedAt: "2026-10-20T02:00:00Z",
    }),
  );
  putPayment(
    record({
      id: "33333333-3333-3333-3333-333333333333",
      feeIds: [demoFee.id, "thesis-partial-registrar"], // mixed: kept
      status: "CONFIRMED",
    }),
  );
  const stats = removeDemoRecords([demoFee.id]);
  expect(stats).toEqual({ removedPayments: 1, removedFees: 1 });
  expect(listFees()).toEqual([realFee]);
  expect(listPayments().map((p) => p.id).sort()).toEqual([
    "12345678-1234-1234-1234-123456789abc",
    "33333333-3333-3333-3333-333333333333",
  ]);
  expect(getPayment("12345678-1234-1234-1234-123456789abc")).toEqual(record());
});
