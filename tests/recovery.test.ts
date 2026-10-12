import { expect, it } from "vitest";
import {
  canResumeEnvelope,
  readRecovery,
  recoverySettled,
  replacementSafe,
  type Recovery,
} from "@/lib/recovery";
const scope =
  "team:https://platform.test/deployments/11111111-1111-4111-8111-111111111111";
const base: Recovery = {
  version: 1,
  scope,
  operation: "execute",
  address: `G${"A".repeat(55)}`,
  prepared: {
    xdr: "original-envelope",
    network: "testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    expiresAt: "2026-10-13T00:00:00Z",
  },
};
it("reload retains the exact signed transaction and uncertain signing state", () => {
  const record = {
    ...base,
    signedXdr: "exact-signed-envelope",
    attempted: true,
    signing: true,
  };
  expect(readRecovery(scope, JSON.stringify(record))).toEqual(record);
});
it.each(["PENDING", "UNKNOWN", "REJECTED", "NOT_FOUND", undefined])(
  "execute %s never permits replacement",
  (status) => {
    expect(replacementSafe({ status }, false)).toBe(false);
  },
);
it.each(["PREPARED", "SUBMITTING", "UNKNOWN", undefined])(
  "intent %s remains reserved even with a contradictory replacement flag",
  (state) => {
    expect(replacementSafe({ state, replacementAllowed: true }, true)).toBe(
      false,
    );
  },
);
it.each(["SUCCESS", "FAILED", "EXPIRED"])(
  "controls require explicit API replacement permission for %s",
  (state) => {
    expect(replacementSafe({ state }, true)).toBe(false);
    expect(replacementSafe({ state, replacementAllowed: false }, true)).toBe(
      false,
    );
    expect(replacementSafe({ state, replacementAllowed: true }, true)).toBe(
      true,
    );
  },
);
it("funding uses durable expiry proof; expiry time alone never settles an operation", () => {
  expect(recoverySettled("funding", { state: "EXPIRED" })).toBe(true);
  expect(recoverySettled("funding", { status: "REJECTED" })).toBe(false);
  expect(recoverySettled("schedule.pause", { state: "EXPIRED" })).toBe(false);
  expect(canResumeEnvelope(base, Date.parse(base.prepared.expiresAt))).toBe(
    false,
  );
});
it("a declined or lost wallet response can resume the original envelope before expiry", () => {
  const record = { ...base, signing: true };
  expect(canResumeEnvelope(record, Date.parse("2026-10-12T00:00:00Z"))).toBe(
    true,
  );
  expect(
    canResumeEnvelope(
      { ...record, signedXdr: "original-signature" },
      Date.parse("2026-10-12T00:00:00Z"),
    ),
  ).toBe(false);
});
it.each([
  { ...base, scope: "different-deployment" },
  { ...base, operation: "arbitrary-proxy" },
  { ...base, address: "S-private-key" },
  { ...base, signedXdr: "" },
  { ...base, attempted: "true" },
  { ...base, prepared: { ...base.prepared, network: "mainnet" } },
  {
    ...base,
    prepared: {
      ...base.prepared,
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    },
  },
  { ...base, prepared: { ...base.prepared, expiresAt: "bad-date" } },
  {
    ...base,
    operation: "funding",
    prepared: { ...base.prepared, intent: "not-an-intent" },
  },
  {
    ...base,
    operation: "funding",
    prepared: {
      ...base.prepared,
      intent: "11111111-1111-4111-8111-111111111111",
      action: "subscription.cancel",
    },
  },
])(
  "refuses corrupt or unrelated recovery evidence without interpreting it as a new payment",
  (record) => {
    expect(() => readRecovery(scope, JSON.stringify(record))).toThrow(/retain/);
  },
);
it("does not replace malformed storage with an empty state", () => {
  expect(() => readRecovery(scope, "{")).toThrow(/retain/);
});
