import {
  prepareFeePayment,
  submitFeePayment,
  refreshFeePayment,
} from "@/lib/payments";
import { handle, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const text = await request.text();
    if (text.length > 210000) throw new Error("Request too large.");
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Invalid request.");
    const v = body as Record<string, unknown>;
    if (
      v.action === "prepare" &&
      typeof v.from === "string" &&
      Array.isArray(v.feeIds) &&
      Object.keys(v).length === 3
    )
      return prepareFeePayment(v.from, v.feeIds);
    if (
      v.action === "status" &&
      typeof v.paymentId === "string" &&
      Object.keys(v).length === 2
    )
      return refreshFeePayment(v.paymentId);
    if (
      v.action === "submit" &&
      typeof v.paymentId === "string" &&
      typeof v.signedXdr === "string" &&
      v.signedXdr.length <= 200000 &&
      (v.preparationRequestId === undefined ||
        (typeof v.preparationRequestId === "string" &&
          v.preparationRequestId.length <= 200)) &&
      Object.keys(v).every((k) =>
        ["action", "paymentId", "signedXdr", "preparationRequestId"].includes(k),
      )
    )
      return submitFeePayment(v.paymentId, v.signedXdr, v.preparationRequestId);
    throw new Error("Invalid request.");
  });
}
