import { listPayments } from "@/lib/store";
import {
  addStaffFee,
  createDemoFees,
  publicPayment,
  resetDemoData,
} from "@/lib/payments";
import {
  clearStaffCookie,
  createStaffSession,
  endStaffSession,
  staffAccessConfigured,
  staffCookie,
  staffSessionValid,
  verifyStaffCode,
} from "@/lib/staff";
import { sameOrigin } from "@/lib/http";
export const dynamic = "force-dynamic";
function json(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, init);
}
export async function GET(request: Request) {
  if (!staffSessionValid(request))
    return json(
      { error: { code: "UNAUTHENTICATED", message: "Staff sign-in required." } },
      { status: 401 },
    );
  const payments = listPayments()
    .map(publicPayment)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ data: { payments } });
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const text = await request.text();
    if (text.length > 4000) throw new Error("Request too large.");
    const body: unknown = JSON.parse(text);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as Record<string, unknown>).action !== "string"
    )
      throw new Error("Invalid request.");
    const v = body as Record<string, unknown>;
    if (v.action === "login") {
      if (!staffAccessConfigured())
        throw new Error(
          "Staff access is not configured on the server. Set STAFF_ACCESS_CODE.",
        );
      if (Object.keys(v).length !== 2 || typeof v.code !== "string")
        throw new Error("Invalid request.");
      if (!verifyStaffCode(v.code))
        return json(
          {
            error: {
              code: "UNAUTHENTICATED",
              message: "Access code refused.",
            },
          },
          { status: 401 },
        );
      const session = createStaffSession();
      return json(
        { data: { ok: true } },
        { headers: { "set-cookie": staffCookie(session.token, session.maxAgeMs) } },
      );
    }
    if (v.action === "logout") {
      if (Object.keys(v).length !== 1) throw new Error("Invalid request.");
      endStaffSession(request);
      return json(
        { data: { ok: true } },
        { headers: { "set-cookie": clearStaffCookie() } },
      );
    }
    const unauthenticated = () =>
      json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Staff sign-in required.",
          },
        },
        { status: 401 },
      );
    if (v.action === "add-fee") {
      if (!staffSessionValid(request)) return unauthenticated();
      if (
        Object.keys(v).length !== 4 ||
        typeof v.label !== "string" ||
        typeof v.office !== "string" ||
        typeof v.amount !== "string"
      )
        throw new Error("Invalid request.");
      const fee = addStaffFee({ label: v.label, office: v.office, amount: v.amount });
      return json({ data: { fee } });
    }
    if (v.action === "create-demo-fees") {
      if (!staffSessionValid(request)) return unauthenticated();
      if (Object.keys(v).length !== 1) throw new Error("Invalid request.");
      const fees = createDemoFees();
      return json({ data: { fees } });
    }
    if (v.action === "reset-demo-data") {
      if (!staffSessionValid(request)) return unauthenticated();
      if (Object.keys(v).length !== 1) throw new Error("Invalid request.");
      const result = resetDemoData();
      return json({ data: result });
    }
    throw new Error("Invalid request.");
  } catch (error) {
    return json(
      {
        error: {
          code: "UNRESOLVED",
          message:
            error instanceof Error
              ? error.message
              : "Request could not complete.",
        },
      },
      { status: 400 },
    );
  }
}
