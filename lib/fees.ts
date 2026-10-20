import type { Allocation, Fee } from "@/lib/types";

/**
 * Campus fee catalog — the ClearPay MVP sample fees. Each thesis milestone is
 * a payable group with per-office allocations. Amounts are integer centavos
 * computed on the server; the browser never supplies or amends amounts or
 * recipients. Recipient offices map to the payout wallets configured on the
 * PaiFlow deployment.
 */
export const FEES: readonly Fee[] = [
  {
    id: "thesis-partial-faculty-secretary",
    group: "Thesis Partial Payment",
    office: "Faculty Secretary",
    label: "Thesis partial payment",
    amountCentavos: 50000,
  },
  {
    id: "thesis-partial-registrar",
    group: "Thesis Partial Payment",
    office: "Registrar",
    label: "Thesis partial payment",
    amountCentavos: 6000,
  },
  {
    id: "pre-oral-registrar",
    group: "Pre-Oral Defense Fee",
    office: "Registrar",
    label: "Pre-oral defense fee",
    amountCentavos: 50000,
  },
  {
    id: "pre-oral-department",
    group: "Pre-Oral Defense Fee",
    office: "Department",
    label: "Pre-oral defense fee",
    amountCentavos: 6000,
  },
  {
    id: "final-defense-registrar",
    group: "Final Defense Fee",
    office: "Registrar",
    label: "Final defense fee",
    amountCentavos: 50000,
  },
  {
    id: "final-defense-department",
    group: "Final Defense Fee",
    office: "Department",
    label: "Final defense fee",
    amountCentavos: 6000,
  },
];

export function pesos(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0)
    throw new Error("Invalid centavos amount.");
  const whole = Math.floor(centavos / 100);
  const fraction = centavos % 100;
  return `₱${whole.toLocaleString("en-US")}${
    fraction ? `.${String(fraction).padStart(2, "0")}` : ""
  }`;
}

/**
 * Demo fee groups for staff to issue or reissue after a reset. These mirror
 * the MVP catalog: each group is a separate payable bundle with its own
 * per-office allocations (offices map to the payout wallets configured on
 * the deployment). Amounts are fixed server-side in integer centavos.
 */
export const DEMO_FEE_GROUPS = [
  {
    group: "Thesis Partial Payment",
    items: [
      { office: "Faculty Secretary", amountCentavos: 50000 },
      { office: "Registrar", amountCentavos: 6000 },
    ],
  },
  {
    group: "Pre-Oral Defense Fee",
    items: [
      { office: "Registrar", amountCentavos: 50000 },
      { office: "Department", amountCentavos: 6000 },
    ],
  },
  {
    group: "Final Defense Fee",
    items: [
      { office: "Registrar", amountCentavos: 50000 },
      { office: "Department", amountCentavos: 6000 },
    ],
  },
] as const;

/** Group names used by earlier demo issuances, still recognized as demo. */
export const LEGACY_DEMO_GROUPS = [
  "Pre-Oral Defense",
  "Final Defense",
] as const;

/**
 * Parse a staff-entered peso amount ("500", "500.5", "500.50") into integer
 * centavos using string arithmetic only — never floating point.
 */
export function parsePesos(input: unknown): number {
  if (typeof input !== "string") throw new Error("Invalid amount.");
  const trimmed = input.trim().replace(/^₱\s?/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed))
    throw new Error("Enter the amount in pesos, e.g. 500 or 500.50.");
  const [whole, fraction = ""] = trimmed.split(".");
  const centavos =
    Number(whole) * 100 + (fraction ? Number(fraction.padEnd(2, "0")) : 0);
  if (!Number.isSafeInteger(centavos) || centavos <= 0)
    throw new Error("Invalid amount.");
  return centavos;
}

/**
 * Resolve a student fee selection into server-trusted allocations.
 * Rejects unknown, duplicate or empty selections before any payment work.
 * The catalog defaults to the static campus fees; the server also passes the
 * full stored catalog so staff-issued fees are selectable.
 */
export function resolveAllocations(
  feeIds: unknown,
  catalog: readonly Fee[] = FEES,
): {
  allocations: Allocation[];
  totalCentavos: number;
} {
  if (!Array.isArray(feeIds) || feeIds.length === 0)
    throw new Error("Select at least one fee.");
  if (feeIds.length > catalog.length) throw new Error("Unknown fee selection.");
  const requested = new Set<string>();
  for (const id of feeIds) {
    if (typeof id !== "string" || !catalog.some((f) => f.id === id))
      throw new Error("Unknown fee selection.");
    if (requested.has(id)) throw new Error("Duplicate fee selection.");
    requested.add(id);
  }
  const allocations = catalog
    .filter((f) => requested.has(f.id))
    .map((f) => ({
      feeId: f.id,
      group: f.group,
      office: f.office,
      label: f.label,
      amountCentavos: f.amountCentavos,
    }));
  const totalCentavos = allocations.reduce(
    (sum, a) => sum + a.amountCentavos,
    0,
  );
  return { allocations, totalCentavos };
}
