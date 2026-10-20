import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as feesGET, POST as feesPOST } from "@/app/api/fees/route";
import { POST as paymentsPOST } from "@/app/api/payments/route";
import { GET as staffGET, POST as staffPOST } from "@/app/api/staff/route";
import { GET as receiptGET } from "@/app/api/receipts/[id]/route";
import { fixtureAddress, fixturePrepared } from "./transaction-fixture";
import { envelopeHash } from "@/lib/transaction";
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
const origin = "https://clearpay.example";
const futurePrepared = {
  ...fixturePrepared,
  expiresAt: "2999-01-01T00:00:00Z",
};
let dir: string;
function post(body: unknown, pathName = "/api/payments", withOrigin = true) {
  return paymentsPOST(
    new Request(origin + pathName, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(withOrigin ? { origin } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}
async function staffLogin() {
  const login = await staffPOST(
    new Request(origin + "/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ action: "login", code: "campus-code-42" }),
    }),
  );
  expect(login.ok).toBe(true);
  return login.headers.get("set-cookie")!.split(";")[0]!;
}
function staffPost(body: unknown, cookie?: string) {
  return staffPOST(
    new Request(origin + "/api/staff", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
type DemoFee = { id: string; group?: string; office: string; amountCentavos: number };
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(path.join(tmpdir(), "clearpay-routes-"));
  vi.stubEnv("CLEARPAY_STORE_PATH", path.join(dir, "store.json"));
  vi.stubEnv("PAIFLOW_BASE_URL", "https://beta.app.paiflow.xyz");
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", id);
  vi.stubEnv("PAIFLOW_API_TOKEN", "pfd_" + "a".repeat(64));
  vi.stubEnv("STAFF_ACCESS_CODE", "campus-code-42");
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
    data: { txHash: hash, status: "SUCCESS", network: "testnet" },
  });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("fees GET exposes the catalog without credentials", async () => {
  const response = await feesGET();
  expect(response.ok).toBe(true);
  const body = await response.json();
  expect(body.data.fees).toHaveLength(2);
  expect(JSON.stringify(body)).not.toContain("a".repeat(64));
});
it("fees POST returns per-student paid status and rejects bad input", async () => {
  const good = await feesPOST(
    new Request(origin + "/api/fees", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ from: fixtureAddress }),
    }),
  );
  expect(good.ok).toBe(true);
  expect((await good.json()).data.map((f: { paid: boolean }) => f.paid)).toEqual([
    false,
    false,
  ]);
  for (const body of [
    JSON.stringify({ from: fixtureAddress, extra: 1 }),
    JSON.stringify({ from: "not-an-address" }),
    JSON.stringify({}),
  ]) {
    const response = await feesPOST(
      new Request(origin + "/api/fees", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body,
      }),
    );
    expect(response.ok).toBe(false);
  }
  const crossSite = await feesPOST(
    new Request(origin + "/api/fees", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ from: fixtureAddress }),
    }),
  );
  expect(crossSite.ok).toBe(false);
});
it("payments route refuses unknown fields, bad origin, oversized and malformed requests", async () => {
  for (const [body, withOrigin] of [
    [JSON.stringify({ action: "prepare", from: fixtureAddress }), false],
    [
      JSON.stringify({
        action: "prepare",
        from: fixtureAddress,
        feeIds: ["registrar"],
        total: "560",
      }),
      true,
    ],
    [JSON.stringify({ action: "prepare", from: fixtureAddress }), true],
    ["{bad", true],
    ["x".repeat(210001), true],
    [JSON.stringify({ action: "hack" }), true],
  ] as const) {
    const response = await post(body, "/api/payments", withOrigin);
    expect(response.ok).toBe(false);
  }
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});
it("payments route runs prepare → submit → status against the ledger", async () => {
  const preparedResponse = await post({
    action: "prepare",
    from: fixtureAddress,
    feeIds: ["faculty-secretary", "registrar"],
  });
  expect(preparedResponse.ok).toBe(true);
  const preparedBody = await preparedResponse.json();
  const paymentId = preparedBody.data.payment.id;
  expect(preparedBody.data.payment.totalDisplay).toBe("₱560");

  const submitResponse = await post({
    action: "submit",
    paymentId,
    signedXdr: futurePrepared.xdr,
    preparationRequestId: "preparation-evidence",
  });
  expect(submitResponse.ok).toBe(true);

  const statusResponse = await post({ action: "status", paymentId });
  expect(statusResponse.ok).toBe(true);
  const statusBody = await statusResponse.json();
  expect(statusBody.data.payment.status).toBe("CONFIRMED");
  expect(statusBody.data.result).toEqual({
    txHash: hash,
    status: "SUCCESS",
    network: "testnet",
  });

  const receipt = await receiptGET(
    new Request(origin + `/api/receipts/${paymentId}`),
    { params: Promise.resolve({ id: paymentId }) },
  );
  expect(receipt.ok).toBe(true);
  const receiptBody = await receipt.json();
  expect(receiptBody.data.status).toBe("CONFIRMED");
  expect(receiptBody.data.totalDisplay).toBe("₱560");
  expect(receiptBody.data.allocations).toHaveLength(2);
});
it("receipt route returns 404 for unknown references", async () => {
  const response = await receiptGET(
    new Request(origin + "/api/receipts/12345678-1234-1234-1234-123456789abc"),
    {
      params: Promise.resolve({
        id: "12345678-1234-1234-1234-123456789abc",
      }),
    },
  );
  expect(response.status).toBe(404);
});
it("staff route gates the ledger behind the access code session", async () => {
  const anonymous = await staffGET(new Request(origin + "/api/staff"));
  expect(anonymous.status).toBe(401);

  const wrong = await staffPOST(
    new Request(origin + "/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ action: "login", code: "nope" }),
    }),
  );
  expect(wrong.status).toBe(401);

  const login = await staffPOST(
    new Request(origin + "/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ action: "login", code: "campus-code-42" }),
    }),
  );
  expect(login.ok).toBe(true);
  const cookie = login.headers.get("set-cookie");
  expect(cookie).toContain("clearpay_staff=");
  expect(cookie).toContain("HttpOnly");

  const authed = await staffGET(
    new Request(origin + "/api/staff", {
      headers: { cookie: cookie!.split(";")[0]! },
    }),
  );
  expect(authed.ok).toBe(true);
  expect((await authed.json()).data.payments).toEqual([]);

  const logout = await staffPOST(
    new Request(origin + "/api/staff", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: cookie!.split(";")[0]!,
      },
      body: JSON.stringify({ action: "logout" }),
    }),
  );
  expect(logout.ok).toBe(true);
  const afterLogout = await staffGET(
    new Request(origin + "/api/staff", {
      headers: { cookie: cookie!.split(";")[0]! },
    }),
  );
  expect(afterLogout.status).toBe(401);
});
it("staff add-fee is session-gated, validated, and appends an unpaid fee", async () => {
  const anonymous = await staffPost({
    action: "add-fee",
    label: "Library clearance fee",
    office: "Library",
    amount: "250",
  });
  expect(anonymous.status).toBe(401);

  const cookie = await staffLogin();
  for (const body of [
    { action: "add-fee", label: "", office: "Library", amount: "250" },
    { action: "add-fee", label: "Library fee", office: "", amount: "250" },
    { action: "add-fee", label: "Library fee", office: "Library", amount: "abc" },
    { action: "add-fee", label: "Library fee", office: "Library", amount: "0" },
    {
      action: "add-fee",
      label: "Library fee",
      office: "Library",
      amount: "250",
      extra: 1,
    },
  ]) {
    const response = await staffPost(body, cookie);
    expect(response.ok).toBe(false);
  }
  const good = await staffPost(
    {
      action: "add-fee",
      label: "ID replacement fee",
      office: "Registrar",
      amount: "250.50",
    },
    cookie,
  );
  expect(good.ok).toBe(true);
  const { data } = await good.json();
  expect(data.fee.amountCentavos).toBe(25050);
  expect(data.fee.id).toContain("id-replacement-fee");
  const catalog = await feesGET();
  const fees = (await catalog.json()).data.fees;
  expect(fees).toHaveLength(3);
  expect(fees[2]).toMatchObject({
    office: "Registrar",
    label: "ID replacement fee",
    amountCentavos: 25050,
  });
});
it("staff demo fees stay unpaid and each defense group pays as its own transaction", async () => {
  const anonymous = await staffPost({ action: "create-demo-fees" });
  expect(anonymous.status).toBe(401);

  const cookie = await staffLogin();
  const created = await staffPost({ action: "create-demo-fees" }, cookie);
  expect(created.ok).toBe(true);
  const { data } = await created.json();
  const demoFees = data.fees as DemoFee[];
  expect(demoFees).toHaveLength(6);
  const groups = [...new Set(demoFees.map((f) => f.group))].sort();
  expect(groups).toEqual([
    "Final Defense",
    "Pre-Oral Defense",
    "Thesis Partial Payment",
  ]);
  for (const group of ["Pre-Oral Defense", "Final Defense"]) {
    const items = demoFees.filter((f) => f.group === group);
    expect(items.map((i) => i.office).sort()).toEqual([
      "Department",
      "Registrar",
    ]);
    expect(items.find((i) => i.office === "Registrar")?.amountCentavos).toBe(
      50000,
    );
    expect(items.find((i) => i.office === "Department")?.amountCentavos).toBe(
      6000,
    );
  }
  const thesis = demoFees.filter((f) => f.group === "Thesis Partial Payment");
  expect(thesis.map((i) => i.office).sort()).toEqual([
    "Department",
    "Registrar",
  ]);
  expect(thesis.find((i) => i.office === "Registrar")?.amountCentavos).toBe(
    150000,
  );
  expect(thesis.find((i) => i.office === "Department")?.amountCentavos).toBe(
    50000,
  );

  // Existing catalog entries are unchanged and no payment records were added.
  const catalog = await feesGET();
  const catalogFees = (await catalog.json()).data.fees;
  expect(catalogFees).toHaveLength(8);
  expect(catalogFees.slice(0, 2).map((f: DemoFee) => f.id)).toEqual([
    "faculty-secretary",
    "registrar",
  ]);
  const ledgerBefore = await staffGET(
    new Request(origin + "/api/staff", { headers: { cookie } }),
  );
  expect((await ledgerBefore.json()).data.payments).toHaveLength(0);

  const outstanding = async () => {
    const response = await feesPOST(
      new Request(origin + "/api/fees", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ from: fixtureAddress }),
      }),
    );
    expect(response.ok).toBe(true);
    return (await response.json()).data as Array<
      DemoFee & { label: string; paid: boolean }
    >;
  };
  expect((await outstanding()).filter((f) => f.paid)).toHaveLength(0);

  // Pay the Pre-Oral group as one transaction.
  const preOral = demoFees.filter((f) => f.group === "Pre-Oral Defense");
  const prep = await post({
    action: "prepare",
    from: fixtureAddress,
    feeIds: preOral.map((f) => f.id),
  });
  expect(prep.ok).toBe(true);
  const prepBody = await prep.json();
  expect(prepBody.data.payment.totalDisplay).toBe("₱560");
  expect(prepBody.data.payment.allocations).toHaveLength(2);
  expect(
    prepBody.data.payment.allocations.every(
      (a: DemoFee) => a.group === "Pre-Oral Defense",
    ),
  ).toBe(true);
  const paymentId = prepBody.data.payment.id;
  const submit = await post({
    action: "submit",
    paymentId,
    signedXdr: futurePrepared.xdr,
    preparationRequestId: "preparation-evidence",
  });
  expect(submit.ok).toBe(true);
  const status = await post({ action: "status", paymentId });
  expect((await status.json()).data.payment.status).toBe("CONFIRMED");

  // Only that group is covered; Final Defense remains outstanding.
  const after = await outstanding();
  expect(
    after
      .filter((f) => f.paid)
      .map((f) => f.id)
      .sort(),
  ).toEqual(preOral.map((f) => f.id).sort());
  const finalDefense = demoFees.filter(
    (f) => f.group === "Final Defense",
  );
  expect(after.find((f) => f.id === finalDefense[0]!.id)?.paid).toBe(false);

  // The Final Defense group pays as its own transaction and receipt.
  const prep2 = await post({
    action: "prepare",
    from: fixtureAddress,
    feeIds: finalDefense.map((f) => f.id),
  });
  expect(prep2.ok).toBe(true);
  const paymentId2 = (await prep2.json()).data.payment.id;
  expect(paymentId2).not.toBe(paymentId);
  const submit2 = await post({
    action: "submit",
    paymentId: paymentId2,
    signedXdr: futurePrepared.xdr,
    preparationRequestId: "preparation-evidence",
  });
  expect(submit2.ok).toBe(true);
  const status2 = await post({ action: "status", paymentId: paymentId2 });
  expect((await status2.json()).data.payment.status).toBe("CONFIRMED");

  // Both receipts exist; the first is untouched by the second payment.
  const ledger = await staffGET(
    new Request(origin + "/api/staff", { headers: { cookie } }),
  );
  const payments = (await ledger.json()).data.payments;
  expect(payments).toHaveLength(2);
  const first = payments.find((p: { id: string }) => p.id === paymentId);
  expect(first.status).toBe("CONFIRMED");
  expect(first.txHash).toBe(hash);
  expect(
    first.allocations.every(
      (a: DemoFee) => a.group === "Pre-Oral Defense",
    ),
  ).toBe(true);
  expect((await outstanding()).filter((f) => f.paid)).toHaveLength(4);
});
it("staff reset-demo-data clears only demo history and reissues fresh unpaid groups", async () => {
  const anonymous = await staffPost({ action: "reset-demo-data" });
  expect(anonymous.status).toBe(401);

  const cookie = await staffLogin();
  const created = await staffPost({ action: "create-demo-fees" }, cookie);
  const { data } = await created.json();
  const oldDemo = data.fees as DemoFee[];
  const oldPreOral = oldDemo.filter((f) => f.group === "Pre-Oral Defense");

  // A real, non-demo fee and a confirmed static-catalog payment.
  await staffPost(
    {
      action: "add-fee",
      label: "Library clearance fee",
      office: "Library",
      amount: "250",
    },
    cookie,
  );
  const realPrep = await post({
    action: "prepare",
    from: fixtureAddress,
    feeIds: ["faculty-secretary", "registrar"],
  });
  const realPaymentId = (await realPrep.json()).data.payment.id;
  await post({
    action: "submit",
    paymentId: realPaymentId,
    signedXdr: futurePrepared.xdr,
    preparationRequestId: "preparation-evidence",
  });
  await post({ action: "status", paymentId: realPaymentId });

  // A confirmed demo payment, which the reset must remove.
  const demoPrep = await post({
    action: "prepare",
    from: fixtureAddress,
    feeIds: oldPreOral.map((f) => f.id),
  });
  const demoPaymentId = (await demoPrep.json()).data.payment.id;
  await post({
    action: "submit",
    paymentId: demoPaymentId,
    signedXdr: futurePrepared.xdr,
    preparationRequestId: "preparation-evidence",
  });
  await post({ action: "status", paymentId: demoPaymentId });

  const reset = await staffPost({ action: "reset-demo-data" }, cookie);
  expect(reset.ok).toBe(true);
  const resetBody = await reset.json();
  expect(resetBody.data.removedPayments).toBe(1);
  expect(resetBody.data.removedFees).toBe(6);
  const fresh = resetBody.data.fees as DemoFee[];
  expect(fresh).toHaveLength(6);
  expect(
    [...new Set(fresh.map((f) => f.group))].sort(),
  ).toEqual(["Final Defense", "Pre-Oral Defense", "Thesis Partial Payment"]);
  expect(fresh.every((f) => !oldDemo.some((o) => o.id === f.id))).toBe(true);

  // Catalog: 2 static + 1 manual + 6 fresh demo; every fresh fee unpaid.
  const catalog = await feesGET();
  const catalogFees = (await catalog.json()).data.fees;
  expect(catalogFees).toHaveLength(9);
  expect(
    catalogFees.some((f: DemoFee) => f.office === "Library"),
  ).toBe(true);
  const outstandingResponse = await feesPOST(
    new Request(origin + "/api/fees", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ from: fixtureAddress }),
    }),
  );
  const outstanding = (await outstandingResponse.json()).data as Array<
    DemoFee & { paid: boolean }
  >;
  const freshIds = new Set(fresh.map((f) => f.id));
  expect(outstanding.filter((f) => freshIds.has(f.id) && f.paid)).toHaveLength(
    0,
  );
  // The real payment still covers the static catalog fees.
  expect(
    outstanding
      .filter((f) => f.paid)
      .map((f) => f.id)
      .sort(),
  ).toEqual(["faculty-secretary", "registrar"]);

  // The real payment record is untouched; the demo receipt is gone.
  const ledger = await staffGET(
    new Request(origin + "/api/staff", { headers: { cookie } }),
  );
  const payments = (await ledger.json()).data.payments;
  expect(payments).toHaveLength(1);
  expect(payments[0].id).toBe(realPaymentId);
  expect(payments[0].txHash).toBe(hash);
  expect(payments[0].status).toBe("CONFIRMED");
  const demoReceipt = await receiptGET(
    new Request(origin + `/api/receipts/${demoPaymentId}`),
    { params: Promise.resolve({ id: demoPaymentId }) },
  );
  expect(demoReceipt.status).toBe(404);

  // Fresh demo groups are immediately payable as their own transactions.
  const freshPreOral = fresh.filter((f) => f.group === "Pre-Oral Defense");
  const freshPrep = await post({
    action: "prepare",
    from: fixtureAddress,
    feeIds: freshPreOral.map((f) => f.id),
  });
  expect(freshPrep.ok).toBe(true);
  expect((await freshPrep.json()).data.payment.totalDisplay).toBe("₱560");
});
it("staff login reports a clear limitation when no code is configured", async () => {
  vi.stubEnv("STAFF_ACCESS_CODE", "");
  const response = await staffPOST(
    new Request(origin + "/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ action: "login", code: "anything" }),
    }),
  );
  expect(response.ok).toBe(false);
  expect(await response.json()).toEqual({
    error: {
      code: "UNRESOLVED",
      message: expect.stringContaining("not configured"),
    },
  });
});
