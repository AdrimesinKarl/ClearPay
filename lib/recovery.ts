import type { Prepared } from "@/lib/paiflow";

export type Operation =
  | "execute"
  | "funding"
  | "allowance"
  | "schedule.pause"
  | "schedule.resume"
  | "schedule.retrieve"
  | "subscription.cancel"
  | "subscription.reactivate";
export type Recovery = {
  version: 1;
  scope: string;
  operation: Operation;
  address: string;
  prepared: Prepared & { intent?: string; txHash?: string; action?: string };
  signedXdr?: string;
  signing?: boolean;
  attempted?: boolean;
};
const operations: readonly string[] = [
  "execute",
  "funding",
  "allowance",
  "schedule.pause",
  "schedule.resume",
  "schedule.retrieve",
  "subscription.cancel",
  "subscription.reactivate",
];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function envelope(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 200_000
  );
}
/** Reject corrupted or unrelated evidence without deleting the stored record. */
export function readRecovery(scope: string, raw: string): Recovery {
  const invalid =
    "Invalid recovery record; retain it for support before starting another transaction.";
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(invalid);
  }
  if (
    !object(value) ||
    value.version !== 1 ||
    value.scope !== scope ||
    typeof value.operation !== "string" ||
    !operations.includes(value.operation) ||
    typeof value.address !== "string" ||
    !/^G[A-Z2-7]{55}$/.test(value.address) ||
    !object(value.prepared)
  )
    throw new Error(invalid);
  const p = value.prepared;
  if (
    !envelope(p.xdr) ||
    p.network !== "testnet" ||
    p.networkPassphrase !== "Test SDF Network ; September 2015" ||
    typeof p.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(p.expiresAt)) ||
    (value.signedXdr !== undefined && !envelope(value.signedXdr)) ||
    (value.signing !== undefined && typeof value.signing !== "boolean") ||
    (value.attempted !== undefined && typeof value.attempted !== "boolean") ||
    (p.txHash !== undefined &&
      (typeof p.txHash !== "string" || !/^[a-f0-9]{64}$/.test(p.txHash)))
  )
    throw new Error(invalid);
  if (
    value.operation !== "execute" &&
    (typeof p.intent !== "string" ||
      !p.intent ||
      p.intent.length > 4096 ||
      (value.operation !== "allowance" && !uuid.test(p.intent)))
  )
    throw new Error(invalid);
  if (
    value.operation === "funding" &&
    p.action !== "schedule.fund" &&
    p.action !== "webhook.fund"
  )
    throw new Error(invalid);
  return value as Recovery;
}
/** Re-signing the identical envelope preserves its hash even after a lost wallet response. */
export function canResumeEnvelope(record: Recovery, now = Date.now()): boolean {
  return !record.signedXdr && now < Date.parse(record.prepared.expiresAt);
}
/** A queue rejection or absent RPC evidence never authorizes replacement. */
export function replacementSafe(
  result: { status?: string; state?: string; replacementAllowed?: boolean },
  intent: boolean,
): boolean {
  if (intent)
    return (
      result.replacementAllowed === true &&
      ["SUCCESS", "FAILED", "EXPIRED"].includes(result.state ?? "")
    );
  return result.status === "SUCCESS" || result.status === "FAILED";
}
export function recoverySettled(
  operation: Operation,
  result: { status?: string; state?: string; replacementAllowed?: boolean },
): boolean {
  if (operation === "funding")
    return ["SUCCESS", "FAILED", "EXPIRED"].includes(result.state ?? "");
  if (operation === "execute" || operation === "allowance")
    return replacementSafe(result, false);
  return replacementSafe(result, true);
}
