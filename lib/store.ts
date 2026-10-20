import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Allocation, PaymentAppStatus } from "@/lib/types";

/** Server-side campus payment ledger record. */
export type PaymentRecord = {
  id: string;
  studentAddress: string;
  feeIds: string[];
  allocations: Allocation[];
  totalCentavos: number;
  preparedXdr: string;
  preparationRequestId?: string;
  txHash: string;
  preparedExpiresAt: string;
  status: PaymentAppStatus;
  txStatus?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
};

export type StaffSession = {
  token: string;
  createdAt: string;
};

/** Staff-issued fee entry. Fees are append-only: existing entries, payments
 * and receipts are never modified or deleted to make a fee payable again. */
export type StoredFee = {
  id: string;
  group?: string;
  demo?: boolean;
  office: string;
  label: string;
  amountCentavos: number;
  createdAt: string;
};

type StoreFile = {
  payments: PaymentRecord[];
  sessions: StaffSession[];
  fees: StoredFee[];
};

function storePath(): string {
  const configured = process.env.CLEARPAY_STORE_PATH?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), ".clearpay", "store.json");
}

function empty(): StoreFile {
  return { payments: [], sessions: [], fees: [] };
}

function read(): StoreFile {
  const file = storePath();
  if (!existsSync(file)) return empty();
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as StoreFile).payments) ||
    !Array.isArray((parsed as StoreFile).sessions) ||
    ((parsed as StoreFile).fees !== undefined &&
      !Array.isArray((parsed as StoreFile).fees))
  )
    throw new Error("Payment ledger is unreadable. Keep the file for support.");
  const data = parsed as StoreFile;
  if (!data.fees) data.fees = [];
  return data;
}

/** Atomic write: temp file in the same directory, then rename over the target. */
function write(data: StoreFile) {
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2));
  renameSync(temp, file);
}

function mutate<T>(change: (data: StoreFile) => T): T {
  const data = read();
  const result = change(data);
  write(data);
  return result;
}

export function listPayments(): PaymentRecord[] {
  return read().payments;
}

/** Staff-issued fees. Entries are validated but never mutated here. */
export function listFees(): StoredFee[] {
  const fees = read().fees;
  for (const fee of fees) {
    if (
      !fee ||
      typeof fee.id !== "string" ||
      (fee.group !== undefined && typeof fee.group !== "string") ||
      (fee.demo !== undefined && typeof fee.demo !== "boolean") ||
      typeof fee.office !== "string" ||
      typeof fee.label !== "string" ||
      !Number.isSafeInteger(fee.amountCentavos) ||
      fee.amountCentavos <= 0 ||
      !Number.isFinite(Date.parse(fee.createdAt))
    )
      throw new Error("Fee catalog is unreadable. Keep the file for support.");
  }
  return fees;
}

/** Append new fee entries. Existing entries are left untouched. */
export function addFees(entries: StoredFee[]) {
  mutate((data) => {
    data.fees.push(...entries);
  });
}

/**
 * Remove demo records only. A payment is removed when every one of its fee
 * ids is in the demo set (mixed demo/real payments are kept). Fees in the
 * demo set are removed from the catalog. Everything else — real payments,
 * staff-issued non-demo fees, sessions — is left untouched.
 */
export function removeDemoRecords(demoFeeIds: string[]) {
  const demo = new Set(demoFeeIds);
  return mutate((data) => {
    const paymentsBefore = data.payments.length;
    data.payments = data.payments.filter(
      (p) => !(p.feeIds.length > 0 && p.feeIds.every((id) => demo.has(id))),
    );
    const feesBefore = data.fees.length;
    data.fees = data.fees.filter((f) => !demo.has(f.id));
    return {
      removedPayments: paymentsBefore - data.payments.length,
      removedFees: feesBefore - data.fees.length,
    };
  });
}

export function getPayment(id: string): PaymentRecord | undefined {
  return read().payments.find((p) => p.id === id);
}

export function findActivePayment(studentAddress: string): PaymentRecord | undefined {
  return read().payments.find(
    (p) =>
      p.studentAddress === studentAddress &&
      (p.status === "PREPARED" || p.status === "SUBMITTED"),
  );
}

export function putPayment(record: PaymentRecord) {
  mutate((data) => {
    const index = data.payments.findIndex((p) => p.id === record.id);
    if (index === -1) data.payments.push(record);
    else data.payments[index] = record;
  });
}

export function addSession(session: StaffSession) {
  mutate((data) => {
    data.sessions.push(session);
  });
}

export function getSession(token: string): StaffSession | undefined {
  return read().sessions.find((s) => s.token === token);
}

export function deleteSession(token: string) {
  mutate((data) => {
    data.sessions = data.sessions.filter((s) => s.token !== token);
  });
}
