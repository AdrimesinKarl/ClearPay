import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClearPayApp } from "@/components/clearpay-app";
import { StaffApp } from "@/components/staff-app";
import { FEES, pesos } from "@/lib/fees";
import { fixtureAddress, fixturePrepared } from "./transaction-fixture";
import { envelopeHash } from "@/lib/transaction";
import { connectWallet, signPrepared } from "@/lib/wallet";
vi.mock("@/lib/wallet", () => ({
  connectWallet: vi.fn(),
  signPrepared: vi.fn(),
}));
const scope =
  "https://beta.app.paiflow.xyz/12345678-1234-1234-1234-123456789abc";
const key = `paiflow-sdk-payment-v2:${scope}`;
const hash = envelopeHash(fixturePrepared.xdr);
const demoFeeCatalog = [
  ...FEES,
  {
    id: "thesis-partial-payment-registrar-cccc3333",
    group: "Thesis Partial Payment",
    office: "Registrar",
    label: "Thesis Partial Payment",
    amountCentavos: 150000,
  },
  {
    id: "thesis-partial-payment-department-cccc3333",
    group: "Thesis Partial Payment",
    office: "Department",
    label: "Thesis Partial Payment",
    amountCentavos: 50000,
  },
  {
    id: "pre-oral-defense-registrar-aaaa1111",
    group: "Pre-Oral Defense",
    office: "Registrar",
    label: "Pre-Oral Defense",
    amountCentavos: 50000,
  },
  {
    id: "pre-oral-defense-department-aaaa1111",
    group: "Pre-Oral Defense",
    office: "Department",
    label: "Pre-Oral Defense",
    amountCentavos: 6000,
  },
  {
    id: "final-defense-registrar-bbbb2222",
    group: "Final Defense",
    office: "Registrar",
    label: "Final Defense",
    amountCentavos: 50000,
  },
  {
    id: "final-defense-department-bbbb2222",
    group: "Final Defense",
    office: "Department",
    label: "Final Defense",
    amountCentavos: 6000,
  },
];
const prepared = {
  ...fixturePrepared,
  expiresAt: "2999-01-01T00:00:00Z",
  txHash: hash,
  preparationRequestId: "preparation-evidence",
};
const paymentView = (overrides: Record<string, unknown> = {}) => ({
  id: "12345678-1234-1234-1234-123456789abc",
  studentAddress: fixtureAddress,
  allocations: [
    {
      feeId: "faculty-secretary",
      office: "Faculty Secretary",
      label: "Records verification fee",
      amountCentavos: 50000,
    },
    {
      feeId: "registrar",
      office: "Registrar",
      label: "Transcript processing fee",
      amountCentavos: 6000,
    },
  ],
  totalCentavos: 56000,
  totalDisplay: "₱560",
  txHash: hash,
  status: "PREPARED",
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
  ...overrides,
});
let renderer: ReactTestRenderer | undefined;
let values: Map<string, string>;
let feesPaid = false;
let submitCalls = 0;
let statusCalls = 0;
function requestAction(options?: RequestInit) {
  if (!options?.body) return { action: "GET", body: {} as Record<string, unknown> };
  const body = JSON.parse(options.body as string) as Record<string, unknown>;
  return { action: String(body.action), body };
}
function json(data: unknown, init?: ResponseInit) {
  return Response.json({ data }, init);
}
function feeCatalog() {
  return FEES.map((f) => ({ ...f, paid: feesPaid }));
}
async function fetchRouter(url: RequestInfo | URL, options?: RequestInit) {
  const target = String(url);
  if (!options?.body) {
    if (target.endsWith("/api/fees"))
      return json({ ready: true, fees: FEES });
    if (target.endsWith("/api/staff"))
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Staff sign-in required." } },
        { status: 401 },
      );
    throw new Error(`Unexpected GET ${target}`);
  }
  const { body } = requestAction(options);
  if (target.endsWith("/api/fees")) return json(feeCatalog());
  if (target.endsWith("/api/payments")) {
    if (body.action === "prepare")
      return json({ payment: paymentView(), prepared });
    if (body.action === "submit") {
      submitCalls++;
      return json({
        payment: paymentView({ status: "SUBMITTED", txStatus: "PENDING" }),
        result: { txHash: hash, status: "PENDING", network: "testnet" },
      });
    }
    if (body.action === "status") {
      statusCalls++;
      return json({
        payment: paymentView({
          status: "CONFIRMED",
          txStatus: "SUCCESS",
          verifiedAt: "2026-10-20T00:05:00Z",
        }),
        result: { txHash: hash, status: "SUCCESS", network: "testnet" },
      });
    }
  }
  if (target.endsWith("/api/staff")) {
    if (body.action === "login" && body.code === "campus-code-42")
      return json(
        { ok: true },
        { headers: { "set-cookie": "clearpay_staff=tok; HttpOnly" } },
      );
    if (body.action === "login")
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Access code refused." } },
        { status: 401 },
      );
    if (body.action === "logout") return json({ ok: true });
    if (body.action === "create-demo-fees")
      return json({ fees: demoFeeCatalog.slice(2) });
    if (body.action === "reset-demo-data")
      return json({
        removedPayments: 1,
        removedFees: 6,
        fees: demoFeeCatalog.slice(2),
      });
    if (body.action === "add-fee")
      return json({
        fee: {
          id: "staff-fee-1",
          office: body.office,
          label: body.label,
          amountCentavos: 50000,
        },
      });
  }
  throw new Error(`Unexpected POST ${target}`);
}
beforeEach(() => {
  renderer = undefined;
  values = new Map();
  feesPaid = false;
  submitCalls = 0;
  statusCalls = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn(
        async (
          _key: string,
          _options: unknown,
          callback: (lock: object | null) => unknown,
        ) => callback({}),
      ),
    },
  });
  vi.stubGlobal("fetch", vi.fn(fetchRouter));
});
afterEach(async () => {
  if (renderer) await act(() => renderer!.unmount());
  vi.unstubAllGlobals();
});
function saved() {
  return JSON.parse(values.get(key)!);
}
function buttons() {
  return renderer!.root.findAllByType("button");
}
function button(label: string) {
  return buttons().find((b) => b.children.join("") === label)!;
}
function message() {
  return renderer!.root.findByProps({ role: "status" }).children.join("");
}
function treeText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(treeText).join("");
  const children = (node as { children?: unknown }).children;
  return children ? treeText(children) : "";
}
function pageText() {
  return treeText(renderer!.root);
}
async function mountStudent() {
  await act(async () => {
    renderer = create(
      <ClearPayApp config={{ ready: true, scope, deploymentUrl: scope }} />,
    );
  });
  await act(async () => {});
}
async function click(label: string) {
  await act(async () => {
    void button(label).props.onClick();
  });
  await act(async () => {});
}
it("shows fees, computes the ₱560 checkout total, and never sends totals from the browser", async () => {
  vi.mocked(connectWallet).mockResolvedValue(fixtureAddress);
  const bodies: Array<Record<string, unknown>> = [];
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.body) bodies.push(JSON.parse(options.body as string));
    return fetchRouter(url, options);
  });
  await mountStudent();
  expect(pageText()).toContain("Faculty Secretary");
  expect(pageText()).toContain("Registrar");
  expect(pageText()).toContain("₱500");
  expect(pageText()).toContain("₱60");
  const checkboxes = renderer!.root.findAllByType("input");
  expect(checkboxes).toHaveLength(2);
  await act(async () => {
    checkboxes[0]!.props.onChange();
  });
  await act(async () => {
    checkboxes[1]!.props.onChange();
  });
  const total = renderer!.root.findByProps({ "data-testid": "checkout-total" });
  expect(total.children.join("")).toBe("₱560");
  expect(pesos(56000)).toBe("₱560");
  await click("Connect Freighter");
  await click("Pay selected fees · 1 testnet XLM");
  const prepareBody = bodies.find((b) => b.action === "prepare");
  expect(prepareBody).toEqual({
    action: "prepare",
    from: fixtureAddress,
    feeIds: expect.arrayContaining(["faculty-secretary", "registrar"]),
  });
  expect(JSON.stringify(prepareBody)).not.toContain("56000");
  expect(saved().paymentId).toBe("12345678-1234-1234-1234-123456789abc");
  expect(saved().prepared.txHash).toBe(hash);
});
it("signs and submits the exact envelope, then shows the verified receipt only after Paiflow SUCCESS", async () => {
  vi.mocked(connectWallet).mockResolvedValue(fixtureAddress);
  vi.mocked(signPrepared).mockResolvedValue(prepared.xdr);
  let feesPosts = 0;
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.body && String(url).endsWith("/api/fees")) feesPosts++;
    return fetchRouter(url, options);
  });
  await mountStudent();
  for (const box of renderer!.root.findAllByType("input")) {
    await act(async () => {
      box.props.onChange();
    });
  }
  await click("Connect Freighter");
  await click("Pay selected fees · 1 testnet XLM");
  await click("Sign original transaction");
  expect(saved().signedXdr).toBe(prepared.xdr);
  await click("Submit saved envelope");
  expect(submitCalls).toBe(1);
  expect(saved().attempted).toBe(true);
  expect(statusCalls).toBeGreaterThanOrEqual(1);
  expect(message()).toContain("verified with Paiflow");
  const receipt = renderer!.root.findByProps({ "data-testid": "receipt" });
  expect(receipt).toBeDefined();
  expect(renderer!.root.findByProps({ "data-testid": "verified-badge" })).toBeDefined();
  expect(pageText()).toContain(hash);
  expect(pageText()).toContain("₱560");
  // Confirmation refreshed fee status from the server and shows Paid badges.
  feesPaid = true;
  await click("Check transaction");
  await act(async () => {});
  expect(feesPosts).toBeGreaterThanOrEqual(3);
  const badges = renderer!.root
    .findAllByType("span")
    .filter((s) => s.children.join("") === "Paid");
  expect(badges.length).toBe(2);
});
it("reload resumes only original-transaction reads and reaches the verified receipt", async () => {
  feesPaid = true;
  values.set(
    key,
    JSON.stringify({
      version: 2,
      scope,
      address: fixtureAddress,
      paymentId: "12345678-1234-1234-1234-123456789abc",
      prepared,
      signedXdr: prepared.xdr,
      attempted: true,
    }),
  );
  const seen: string[] = [];
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.body)
      seen.push((JSON.parse(options.body as string) as { action: string }).action);
    return fetchRouter(url, options);
  });
  await mountStudent();
  expect(seen.filter((a) => a === "status").length).toBeGreaterThanOrEqual(1);
  expect(seen).not.toContain("submit");
  expect(seen).not.toContain("prepare");
  expect(saved().status).toBe("SUCCESS");
  expect(renderer!.root.findByProps({ "data-testid": "verified-badge" })).toBeDefined();
});
it("unresolved transactions never show the verified badge", async () => {
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.body) {
      const body = JSON.parse(options.body as string) as { action: string };
      if (body.action === "status")
        return json({
          payment: paymentView({ status: "SUBMITTED", txStatus: "UNKNOWN" }),
          result: { txHash: hash, status: "UNKNOWN", network: "testnet" },
        });
    }
    return fetchRouter(url, options);
  });
  values.set(
    key,
    JSON.stringify({
      version: 2,
      scope,
      address: fixtureAddress,
      paymentId: "12345678-1234-1234-1234-123456789abc",
      prepared,
      signedXdr: prepared.xdr,
      attempted: true,
    }),
  );
  await mountStudent();
  expect(
    renderer!.root.findAllByProps({ "data-testid": "verified-badge" }),
  ).toHaveLength(0);
  expect(saved().status).toBe("UNKNOWN");
  expect(
    pageText(),
  ).toContain("not confirmed yet");
});
it("releases the checkout for a new payment after Paiflow verifies SUCCESS", async () => {
  vi.mocked(connectWallet).mockResolvedValue(fixtureAddress);
  vi.mocked(signPrepared).mockResolvedValue(prepared.xdr);
  let prepareCalls = 0;
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (
      options?.body &&
      String(url).endsWith("/api/payments") &&
      (JSON.parse(options.body as string) as { action: string }).action ===
        "prepare"
    )
      prepareCalls++;
    return fetchRouter(url, options);
  });
  await mountStudent();
  for (const box of renderer!.root.findAllByType("input")) {
    await act(async () => {
      box.props.onChange();
    });
  }
  await click("Connect Freighter");
  await click("Pay selected fees · 1 testnet XLM");
  await click("Sign original transaction");
  await click("Submit saved envelope");
  expect(
    renderer!.root.findByProps({ "data-testid": "verified-badge" }),
  ).toBeDefined();
  expect(saved().status).toBe("SUCCESS");
  // The verified receipt no longer blocks a new checkout: the next prepare
  // releases the resolved record instead of refusing replacement.
  await click("Pay selected fees · 1 testnet XLM");
  expect(prepareCalls).toBe(2);
  expect(saved().status).toBeUndefined();
  expect(saved().paymentId).toBe("12345678-1234-1234-1234-123456789abc");
  expect(saved().prepared.txHash).toBe(hash);
});
it("staff app gates the ledger behind the access code and lists verified records", async () => {
  await act(async () => {
    renderer = create(<StaffApp />);
  });
  await act(async () => {});
  expect(button("Sign in")).toBeDefined();
  const input = renderer!.root.findByType("input");
  await act(async () => {
    input.props.onChange({ target: { value: "wrong" } });
  });
  await click("Sign in");
  expect(message()).toContain("Access code refused.");
  await act(async () => {
    input.props.onChange({ target: { value: "campus-code-42" } });
  });
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (!options?.body && String(url).endsWith("/api/staff"))
      return json({
        payments: [paymentView({ status: "CONFIRMED", verifiedAt: "2026-10-20T00:05:00Z" })],
      });
    return fetchRouter(url, options);
  });
  await click("Sign in");
  const ledger = renderer!.root.findByProps({ "data-testid": "staff-ledger" });
  expect(ledger).toBeDefined();
  expect(pageText()).toContain("Faculty Secretary");
  expect(pageText()).toContain("₱500");
  expect(pageText()).toContain("Registrar");
  expect(pageText()).toContain("₱60");
  expect(pageText()).toContain("Verified");
  await click("Sign out");
  expect(button("Sign in")).toBeDefined();
});
it("shows grouped demo fees and totals each defense group separately", async () => {
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (!options?.body && String(url).endsWith("/api/fees"))
      return json({ ready: true, fees: demoFeeCatalog });
    return fetchRouter(url, options);
  });
  await mountStudent();
  expect(pageText()).toContain("Thesis Partial Payment");
  expect(pageText()).toContain("Pre-Oral Defense");
  expect(pageText()).toContain("Final Defense");
  expect(pageText()).toContain("Department");
  const checkboxes = renderer!.root.findAllByType("input");
  expect(checkboxes).toHaveLength(8);
  // Select only the Pre-Oral group: Registrar ₱500 + Department ₱60.
  await act(async () => {
    checkboxes[4]!.props.onChange();
  });
  await act(async () => {
    checkboxes[5]!.props.onChange();
  });
  const total = renderer!.root.findByProps({ "data-testid": "checkout-total" });
  expect(total.children.join("")).toBe("₱560");
  expect(pageText()).toContain("Final Defense");
});
it("staff can issue a single fee and create the demo defense groups", async () => {
  await act(async () => {
    renderer = create(<StaffApp />);
  });
  await act(async () => {});
  const input = renderer!.root.findByType("input");
  await act(async () => {
    input.props.onChange({ target: { value: "campus-code-42" } });
  });
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (!options?.body && String(url).endsWith("/api/staff"))
      return json({ payments: [] });
    return fetchRouter(url, options);
  });
  await click("Sign in");
  // Issue one manual fee.
  const fields = renderer!.root.findAllByType("input");
  expect(fields).toHaveLength(3);
  await act(async () => {
    fields[0]!.props.onChange({ target: { value: "ID replacement fee" } });
  });
  await act(async () => {
    fields[1]!.props.onChange({ target: { value: "Registrar" } });
  });
  await act(async () => {
    fields[2]!.props.onChange({ target: { value: "500" } });
  });
  await click("Add fee");
  expect(message()).toContain("Fee added for Registrar (₱500)");
  // Create the three demo groups.
  await click("Create Demo Fees");
  expect(message()).toContain("Thesis Partial Payment");
  expect(message()).toContain("Pre-Oral Defense");
  expect(message()).toContain("Final Defense");
  expect(message()).toContain("were not changed");
  // Reset clears demo history and reissues fresh unpaid groups.
  await click("Reset Demo Data");
  expect(message()).toContain("Demo data reset");
  expect(message()).toContain("removed 1 demo payment record(s)");
  expect(message()).toContain("Thesis Partial Payment");
  expect(message()).toContain("Real and non-demo records were not touched");
});
it("treats newly created demo fees as unpaid and eligible until confirmed paid", async () => {
  vi.mocked(connectWallet).mockResolvedValue(fixtureAddress);
  const preOralPaid = demoFeeCatalog.map((f) => ({
    ...f,
    paid: f.group === "Pre-Oral Defense",
  }));
  vi.mocked(fetch).mockImplementation(async (url, options) => {
    if (String(url).endsWith("/api/fees"))
      return options?.body
        ? json(preOralPaid)
        : json({ ready: true, fees: demoFeeCatalog });
    return fetchRouter(url, options);
  });
  await mountStudent();
  // Newly created fees render as selectable, unpaid items — never pre-checked
  // or disabled, and with no Paid badges.
  let checkboxes = renderer!.root.findAllByType("input");
  expect(checkboxes).toHaveLength(8);
  expect(checkboxes.every((c) => c.props.disabled === false)).toBe(true);
  expect(
    renderer!.root
      .findAllByType("span")
      .filter((s) => s.children.join("") === "Paid"),
  ).toHaveLength(0);
  // Selecting one Pre-Oral allocation updates the total to ₱500.
  await act(async () => {
    checkboxes[4]!.props.onChange();
  });
  let total = renderer!.root.findByProps({ "data-testid": "checkout-total" });
  expect(total.children.join("")).toBe("₱500");
  // Connect: the server now reports the Pre-Oral group as covered by a
  // confirmed payment. Those rows become disabled with Paid badges, drop out
  // of the selection, and the remaining group stays selectable and payable.
  await click("Connect Freighter");
  checkboxes = renderer!.root.findAllByType("input");
  expect(checkboxes[4]!.props.disabled).toBe(true);
  expect(checkboxes[5]!.props.disabled).toBe(true);
  expect(checkboxes[6]!.props.disabled).toBe(false);
  expect(checkboxes[7]!.props.disabled).toBe(false);
  expect(
    renderer!.root
      .findAllByType("span")
      .filter((s) => s.children.join("") === "Paid"),
  ).toHaveLength(2);
  expect(
    renderer!.root.findAllByProps({ "data-testid": "checkout-summary" }),
  ).toHaveLength(0);
  // Selecting one remaining Final Defense allocation re-enables checkout.
  await act(async () => {
    checkboxes[6]!.props.onChange();
  });
  total = renderer!.root.findByProps({ "data-testid": "checkout-total" });
  expect(total.children.join("")).toBe("₱500");
  const pay = button("Pay selected fees · 1 testnet XLM");
  expect(pay.props.disabled).toBe(false);
});
