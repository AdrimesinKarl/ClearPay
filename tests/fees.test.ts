import { expect, it } from "vitest";
import {
  DEMO_FEE_GROUPS,
  FEES,
  parsePesos,
  pesos,
  resolveAllocations,
} from "@/lib/fees";
it("catalog holds the three MVP fee groups with exact centavo amounts", () => {
  expect(FEES).toHaveLength(6);
  const byId = new Map(FEES.map((f) => [f.id, f]));
  expect(byId.get("thesis-partial-faculty-secretary")).toMatchObject({
    group: "Thesis Partial Payment",
    office: "Faculty Secretary",
    amountCentavos: 50000,
  });
  expect(byId.get("thesis-partial-registrar")).toMatchObject({
    group: "Thesis Partial Payment",
    office: "Registrar",
    amountCentavos: 6000,
  });
  expect(byId.get("pre-oral-registrar")).toMatchObject({
    group: "Pre-Oral Defense Fee",
    office: "Registrar",
    amountCentavos: 50000,
  });
  expect(byId.get("pre-oral-department")).toMatchObject({
    group: "Pre-Oral Defense Fee",
    office: "Department",
    amountCentavos: 6000,
  });
  expect(byId.get("final-defense-registrar")).toMatchObject({
    group: "Final Defense Fee",
    office: "Registrar",
    amountCentavos: 50000,
  });
  expect(byId.get("final-defense-department")).toMatchObject({
    group: "Final Defense Fee",
    office: "Department",
    amountCentavos: 6000,
  });
});
it("computes the combined allocation total of ₱560 for a full group", () => {
  const { allocations, totalCentavos } = resolveAllocations([
    "thesis-partial-faculty-secretary",
    "thesis-partial-registrar",
  ]);
  expect(totalCentavos).toBe(56000);
  expect(allocations.map((a) => a.office)).toEqual([
    "Faculty Secretary",
    "Registrar",
  ]);
  expect(allocations.map((a) => a.group)).toEqual([
    "Thesis Partial Payment",
    "Thesis Partial Payment",
  ]);
  expect(allocations[0]?.amountCentavos).toBe(50000);
  expect(allocations[1]?.amountCentavos).toBe(6000);
});
it("keeps catalog order and supports single-fee selection", () => {
  const { allocations, totalCentavos } = resolveAllocations([
    "thesis-partial-registrar",
  ]);
  expect(totalCentavos).toBe(6000);
  expect(allocations).toHaveLength(1);
  expect(allocations[0]?.feeId).toBe("thesis-partial-registrar");
});
it("rejects unknown, duplicate, empty and malformed selections", () => {
  for (const feeIds of [
    [],
    ["thesis-partial-registrar", "thesis-partial-registrar"],
    ["thesis-partial-registrar", "unknown-fee"],
    ["pre-oral-registrar", "pre-oral-registrar"],
    "thesis-partial-registrar",
    [7],
    [
      "thesis-partial-faculty-secretary",
      "thesis-partial-registrar",
      "extra",
    ],
  ]) {
    expect(() => resolveAllocations(feeIds)).toThrow();
  }
});
it("formats centavos as pesos without floating point", () => {
  expect(pesos(50000)).toBe("₱500");
  expect(pesos(6000)).toBe("₱60");
  expect(pesos(56000)).toBe("₱560");
  expect(pesos(6050)).toBe("₱60.50");
  expect(pesos(0)).toBe("₱0");
  expect(() => pesos(1.5)).toThrow();
  expect(() => pesos(-5)).toThrow();
});
it("parses staff-entered peso amounts into integer centavos", () => {
  expect(parsePesos("500")).toBe(50000);
  expect(parsePesos("₱500")).toBe(50000);
  expect(parsePesos("60.5")).toBe(6050);
  expect(parsePesos("60.50")).toBe(6050);
  expect(parsePesos(" 12.34 ")).toBe(1234);
  for (const bad of ["", "abc", "5.555", "-5", "5,00", "0", "0.00", 5, null]) {
    expect(() => parsePesos(bad)).toThrow();
  }
});
it("defines three demo groups mirroring the MVP catalog", () => {
  expect(DEMO_FEE_GROUPS).toHaveLength(3);
  expect(DEMO_FEE_GROUPS.map((g) => g.group)).toEqual([
    "Thesis Partial Payment",
    "Pre-Oral Defense Fee",
    "Final Defense Fee",
  ]);
  const expected: Record<string, Record<string, number>> = {
    "Thesis Partial Payment": {
      "Faculty Secretary": 50000,
      Registrar: 6000,
    },
    "Pre-Oral Defense Fee": { Registrar: 50000, Department: 6000 },
    "Final Defense Fee": { Registrar: 50000, Department: 6000 },
  };
  for (const g of DEMO_FEE_GROUPS) {
    expect(g.items).toHaveLength(2);
    for (const item of g.items) {
      expect(item.amountCentavos).toBe(expected[g.group]![item.office]);
    }
  }
});
it("resolves selections against an extended catalog and keeps the fee group", () => {
  const catalog = [
    ...FEES,
    {
      id: "staff-issued-library-clearance",
      office: "Library",
      label: "Library clearance fee",
      amountCentavos: 25000,
    },
  ];
  const { allocations, totalCentavos } = resolveAllocations(
    ["thesis-partial-registrar", "staff-issued-library-clearance"],
    catalog,
  );
  expect(totalCentavos).toBe(31000);
  expect(allocations[0]).toMatchObject({
    feeId: "thesis-partial-registrar",
    group: "Thesis Partial Payment",
    office: "Registrar",
    amountCentavos: 6000,
  });
  expect(allocations[1]).toMatchObject({
    feeId: "staff-issued-library-clearance",
    office: "Library",
  });
  expect(() =>
    resolveAllocations(["staff-issued-library-clearance"]),
  ).toThrow();
});
