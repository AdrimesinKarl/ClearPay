import { afterEach, expect, it, vi } from "vitest";
import {
  browserRequest,
  IntegrationError,
  preparationDefinitelyRefused,
  retryDelay,
} from "@/lib/browser-api";
afterEach(() => vi.unstubAllGlobals());
it.each([
  "RATE_LIMITED",
  "INSUFFICIENT_FUNDS",
  "VALIDATION",
  "FORBIDDEN",
  "UNAUTHENTICATED",
  "CONFIGURATION",
])("allows correcting definitive pre-sign refusal %s", (code) => {
  expect(
    preparationDefinitelyRefused(
      new IntegrationError(code, "refused", null, null),
    ),
  ).toBe(true);
});
it.each(["CONFLICT", "UPSTREAM_RPC", "HTTP 500", "UNKNOWN"])(
  "retains unresolved preparation evidence for %s",
  (code) => {
    expect(
      preparationDefinitelyRefused(
        new IntegrationError(code, "unresolved", "request-1", null),
      ),
    ).toBe(false);
  },
);
it("retains network transport uncertainty", () =>
  expect(preparationDefinitelyRefused(new TypeError("fetch failed"))).toBe(
    false,
  ));
it("honors Retry-After and retains structured fields/request ID", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "RATE_LIMITED",
              message: "Wait",
              fields: { amount: ["Use stroops"] },
              details: { intent: "original" },
            },
          }),
          {
            status: 429,
            headers: { "Retry-After": "17", "x-request-id": "request-1" },
          },
        ),
      ),
  );
  try {
    await browserRequest("/api/integration");
    throw new Error("Expected refusal");
  } catch (e) {
    expect(e).toBeInstanceOf(IntegrationError);
    const error = e as IntegrationError;
    expect(error.requestId).toBe("request-1");
    expect(error.fields).toEqual({ amount: ["Use stroops"] });
    expect(error.details).toEqual({ intent: "original" });
    expect(retryDelay(error)).toBe(17000);
    expect(error.message).toContain("Wait Retry-After");
  }
});
