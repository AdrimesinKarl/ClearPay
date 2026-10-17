import { preparePayment, submitPayment, paymentStatus } from "@/lib/paiflow";
import { handle, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const text = await request.text();
    if (text.length > 210000) throw new Error("Request too large.");
    const b: unknown = JSON.parse(text);
    if (!b || typeof b !== "object" || Array.isArray(b))
      throw new Error("Invalid request.");
    const v = b as Record<string, unknown>;
    if (
      v.action === "prepare" &&
      typeof v.from === "string" &&
      Object.keys(v).length === 2
    )
      return preparePayment(v.from);
    if (
      v.action === "status" &&
      typeof v.txHash === "string" &&
      Object.keys(v).length === 2
    )
      return paymentStatus(v.txHash);
    if (
      v.action === "submit" &&
      typeof v.signedXdr === "string" &&
      v.signedXdr.length <= 200000 &&
      (v.preparationRequestId === undefined ||
        (typeof v.preparationRequestId === "string" &&
          v.preparationRequestId.length <= 200)) &&
      Object.keys(v).every((k) =>
        ["action", "signedXdr", "preparationRequestId"].includes(k),
      )
    )
      return submitPayment(
        v.signedXdr,
        v.preparationRequestId as string | undefined,
      );
    throw new Error("Invalid request.");
  });
}
