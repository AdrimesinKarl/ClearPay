import {
  prepareExecute,
  submitExecute,
  requireIntegration,
  capabilities,
} from "@/lib/paiflow";
import { handle, paymentBody, InputError } from "@/lib/http";
export async function POST(request: Request) {
  return handle(async () => {
    requireIntegration();
    const body = await paymentBody(request);
    if ((await capabilities()).network !== "testnet")
      throw new InputError("Only Testnet transactions are allowed.");
    const preparationRequestId =
      request.headers.get("x-preparation-request-id") ?? undefined;
    return "signedXdr" in body
      ? submitExecute(body, true, preparationRequestId)
      : prepareExecute(body);
  });
}
