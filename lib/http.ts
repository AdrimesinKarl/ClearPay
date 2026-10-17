import "server-only";
import { PaiflowApiError } from "@paiflow/sdk";
export async function handle(action: () => Promise<unknown>) {
  try {
    return Response.json({ data: await action() });
  } catch (error) {
    if (error instanceof PaiflowApiError) {
      const headers = new Headers();
      if (error.metadata.requestId)
        headers.set("x-request-id", error.metadata.requestId);
      if (error.metadata.retryAfter)
        headers.set("Retry-After", error.metadata.retryAfter);
      return Response.json(
        {
          error: {
            code: error.code,
            message:
              "Paiflow request failed. Retain the original payment record and check its status.",
          },
        },
        { status: error.status, headers },
      );
    }
    return Response.json(
      {
        error: {
          code: "UNRESOLVED",
          message:
            "Request could not complete. Retain the original envelope and check its status before starting another payment.",
        },
      },
      { status: 502 },
    );
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("Same-origin requests required.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Expected JSON.");
}
