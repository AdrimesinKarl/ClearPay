import "server-only";
import { randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import {
  resolveAllocations,
  pesos,
  parsePesos,
  FEES,
  DEMO_FEE_GROUPS,
  LEGACY_DEMO_GROUPS,
} from "@/lib/fees";
import {
  paymentStatus,
  preparePayment,
  submitPayment,
} from "@/lib/paiflow";
import { assertOriginal } from "@/lib/transaction";
import {
  findActivePayment,
  getPayment,
  putPayment,
  listPayments,
  listFees,
  addFees,
  removeDemoRecords,
} from "@/lib/store";
import type { PaymentRecord, StoredFee } from "@/lib/store";
import type {
  Fee,
  FeeWithStatus,
  Prepared,
  PublicPayment,
  Result,
} from "@/lib/types";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Static campus catalog plus staff-issued fees, in display order. */
export function allFees(): Fee[] {
  return [
    ...FEES,
    ...listFees().map((f) => ({
      id: f.id,
      group: f.group,
      office: f.office,
      label: f.label,
      amountCentavos: f.amountCentavos,
    })),
  ];
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "fee"
  );
}

function toFee(f: StoredFee): Fee {
  return {
    id: f.id,
    group: f.group,
    office: f.office,
    label: f.label,
    amountCentavos: f.amountCentavos,
  };
}

/**
 * Staff-issued single fee. Appended to the catalog as unpaid; no existing
 * fee, payment or receipt is changed.
 */
export function addStaffFee(input: {
  label: unknown;
  office: unknown;
  amount: unknown;
}): Fee {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const office = typeof input.office === "string" ? input.office.trim() : "";
  if (!label || label.length > 120)
    throw new Error("Enter a fee description of 1–120 characters.");
  if (!office || office.length > 80)
    throw new Error("Enter a recipient office of 1–80 characters.");
  const amountCentavos = parsePesos(input.amount);
  const entry: StoredFee = {
    id: `${slug(label)}-${randomUUID().slice(0, 8)}`,
    office,
    label,
    amountCentavos,
    createdAt: new Date().toISOString(),
  };
  addFees([entry]);
  return toFee(entry);
}

/**
 * Issue the demo fee groups (Thesis Partial Payment, Pre-Oral Defense, Final
 * Defense). Each group is a separate payable bundle with its own Registrar
 * and Department allocations. Append-only: existing fees and payment records
 * are untouched. Entries are flagged as demo so the reset action can
 * distinguish them from real records.
 */
export function createDemoFees(): Fee[] {
  const now = new Date().toISOString();
  const entries: StoredFee[] = DEMO_FEE_GROUPS.flatMap((g) =>
    g.items.map((item) => ({
      id: `${slug(g.group)}-${slug(item.office)}-${randomUUID().slice(0, 8)}`,
      group: g.group,
      demo: true,
      office: item.office,
      label: g.group,
      amountCentavos: item.amountCentavos,
      createdAt: now,
    })),
  );
  addFees(entries);
  return entries.map(toFee);
}

function isDemoFee(fee: StoredFee): boolean {
  if (fee.demo === true) return true;
  if (fee.group && (LEGACY_DEMO_GROUPS as readonly string[]).includes(fee.group))
    return true;
  return DEMO_FEE_GROUPS.some((g) => g.group === fee.group);
}

/**
 * Fresh demo data: clear demo transaction history (payments whose fees are
 * all demo, plus the demo fee catalog entries) and issue fresh unpaid demo
 * groups. Real or non-demo records — payments, receipts, staff-issued fees,
 * sessions — are never touched.
 */
export function resetDemoData(): {
  removedPayments: number;
  removedFees: number;
  fees: Fee[];
} {
  const demoIds = listFees().filter(isDemoFee).map((f) => f.id);
  const stats = removeDemoRecords(demoIds);
  return { ...stats, fees: createDemoFees() };
}

/** Public, non-secret view of a ledger record used by the app and staff page. */
export function publicPayment(record: PaymentRecord): PublicPayment {
  return {
    id: record.id,
    studentAddress: record.studentAddress,
    allocations: record.allocations,
    totalCentavos: record.totalCentavos,
    totalDisplay: pesos(record.totalCentavos),
    txHash: record.txHash,
    status: record.status,
    txStatus: record.txStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    verifiedAt: record.verifiedAt,
  };
}

function requirePayment(paymentId: unknown): PaymentRecord {
  if (typeof paymentId !== "string" || !UUID.test(paymentId))
    throw new Error("Invalid payment reference.");
  const record = getPayment(paymentId);
  if (!record) throw new Error("Unknown payment reference.");
  return record;
}

/**
 * Prepare one settlement for the selected fees. Allocations come only from
 * the server fee catalog; the browser cannot supply amounts or recipients.
 * The on-chain leg is the configured deployment's fixed 1 testnet XLM.
 */
export async function prepareFeePayment(
  from: unknown,
  feeIds: unknown,
): Promise<{ payment: PublicPayment; prepared: Prepared }> {
  if (typeof from !== "string" || !StrKey.isValidEd25519PublicKey(from))
    throw new Error("Supply a public Stellar account.");
  const { allocations, totalCentavos } = resolveAllocations(feeIds, allFees());
  const active = findActivePayment(from);
  if (active)
    throw new Error(
      "An earlier payment for this student is still unresolved. Check its original transaction before starting another.",
    );
  const prepared = await preparePayment(from);
  const now = new Date().toISOString();
  const record: PaymentRecord = {
    id: randomUUID(),
    studentAddress: from,
    feeIds: allocations.map((a) => a.feeId),
    allocations,
    totalCentavos,
    preparedXdr: prepared.xdr,
    preparationRequestId: prepared.preparationRequestId,
    txHash: prepared.txHash,
    preparedExpiresAt: prepared.expiresAt,
    status: "PREPARED",
    createdAt: now,
    updatedAt: now,
  };
  putPayment(record);
  return { payment: publicPayment(record), prepared };
}

/**
 * Submit the exact signed envelope for an existing preparation. The server
 * verifies the envelope against the stored preparation before any upstream
 * call; a changed body or mismatched hash is refused and evidence is kept.
 */
export async function submitFeePayment(
  paymentId: unknown,
  signedXdr: unknown,
  preparationRequestId?: unknown,
): Promise<{ payment: PublicPayment; result: Result }> {
  const record = requirePayment(paymentId);
  if (record.status !== "PREPARED" && record.status !== "SUBMITTED")
    throw new Error("This payment is already final; keep its original record.");
  if (typeof signedXdr !== "string" || signedXdr.length > 200000)
    throw new Error("Invalid signed envelope.");
  if (
    preparationRequestId !== undefined &&
    (typeof preparationRequestId !== "string" || preparationRequestId.length > 200)
  )
    throw new Error("Invalid preparation reference.");
  if (Date.parse(record.preparedExpiresAt) <= Date.now())
    throw new Error(
      "Preparation expired. Retain the original record and check its status; expiry alone does not prove it cannot execute.",
    );
  assertOriginal(record.preparedXdr, signedXdr, record.txHash);
  const correlation =
    (typeof preparationRequestId === "string" && preparationRequestId) ||
    record.preparationRequestId;
  const data = await submitPayment(signedXdr, correlation || undefined);
  const next: PaymentRecord = {
    ...record,
    status: "SUBMITTED",
    txStatus: data.status,
    updatedAt: new Date().toISOString(),
  };
  putPayment(next);
  return {
    payment: publicPayment(next),
    result: { txHash: data.txHash, status: data.status, network: "testnet" },
  };
}

/**
 * Refresh a payment from Paiflow's record of the original transaction.
 * Only SUCCESS confirms the payment; PENDING/UNKNOWN stay unresolved and
 * never authorize a replacement.
 */
export async function refreshFeePayment(
  paymentId: unknown,
): Promise<{ payment: PublicPayment; result: Result }> {
  const record = requirePayment(paymentId);
  const data = await paymentStatus(record.txHash);
  const now = new Date().toISOString();
  const next: PaymentRecord = { ...record, txStatus: data.status, updatedAt: now };
  if (data.status === "SUCCESS" && record.status !== "CONFIRMED") {
    next.status = "CONFIRMED";
    next.verifiedAt = now;
  } else if (data.status === "FAILED") {
    next.status = "FAILED";
  } else if (data.status === "REJECTED") {
    next.status = "REJECTED";
  }
  putPayment(next);
  return {
    payment: publicPayment(next),
    result: { txHash: data.txHash, status: data.status, network: data.network },
  };
}

/** Fee catalog annotated with this student's confirmed coverage. */
export function feesWithStatus(from: unknown): FeeWithStatus[] {
  if (typeof from !== "string" || !StrKey.isValidEd25519PublicKey(from))
    throw new Error("Supply a public Stellar account.");
  const covered = new Set(
    listPayments()
      .filter((p) => p.studentAddress === from && p.status === "CONFIRMED")
      .flatMap((p) => p.feeIds),
  );
  return allFees().map((f) => ({ ...f, paid: covered.has(f.id) }));
}

export function receiptFor(paymentId: string): PublicPayment | undefined {
  if (!UUID.test(paymentId)) return undefined;
  const record = getPayment(paymentId);
  return record ? publicPayment(record) : undefined;
}
