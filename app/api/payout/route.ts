// Legacy Dev-only extension. Privileged app authorization is required.
import { requireApplicationAuthorization } from "@/lib/app-authorization";
import { preparePayout, submitPayout, requireIntegration } from "@/lib/paiflow";
import { handle, paymentBody, InputError } from "@/lib/http";
export async function POST(request: Request) {
  return handle(async () => {
    if (requireIntegration() === "demo")
      throw new InputError("Payouts require your team's deployment/token.");
    await requireApplicationAuthorization(request, "payout");
    const body = await paymentBody(request, true);
    return "signedXdr" in body ? submitPayout(body) : preparePayout(body);
  });
}
