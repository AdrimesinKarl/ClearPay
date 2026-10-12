import "server-only";
import { PaiflowError } from "@/lib/paiflow";
export type PrivilegedAction =
  | "schedule.pause"
  | "schedule.resume"
  | "schedule.retrieve"
  | "releaseEarly"
  | "payout"
  | "webhook";
// Replace with your application's session, ownership and role checks. Wallet consent
// is separate. Never authorize from an address, a browser flag or Paiflow token alone.
export async function applicationAuthorized(
  _request: Request,
  _action: PrivilegedAction,
): Promise<boolean> {
  return false;
}
export async function requireApplicationAuthorization(
  request: Request,
  action: PrivilegedAction,
) {
  if (!(await applicationAuthorized(request, action)))
    throw new PaiflowError(
      403,
      {
        code: "FORBIDDEN",
        message:
          "Configure your application's session and ownership authorization for this control.",
      },
      null,
      null,
    );
}
