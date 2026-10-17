import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StarterApp } from "@/components/starter-app";
import { fixtureAddress, fixturePrepared } from "./transaction-fixture";
import { envelopeHash } from "@/lib/transaction";
vi.mock("@/lib/wallet", () => ({
  connectWallet: vi.fn(),
  signPrepared: vi.fn(),
}));
const scope =
  "https://beta.app.paiflow.xyz/12345678-1234-1234-1234-123456789abc";
const key = `paiflow-sdk-payment-v2:${scope}`;
const stored = {
  version: 2,
  scope,
  address: fixtureAddress,
  prepared: { ...fixturePrepared, txHash: envelopeHash(fixturePrepared.xdr) },
  signedXdr: fixturePrepared.xdr,
  attempted: true,
};
let renderer: ReactTestRenderer;
let values: Map<string, string>;
let lockAvailable = true;
beforeEach(() => {
  values = new Map();
  lockAvailable = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn(
        async (
          _key: string,
          _options: unknown,
          callback: (lock: object | null) => unknown,
        ) => callback(lockAvailable ? {} : null),
      ),
    },
  });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() => {
    renderer = create(
      <StarterApp config={{ ready: true, scope, deploymentUrl: scope }} />,
    );
  });
}
function button(label: string) {
  return renderer.root
    .findAllByType("button")
    .find((b) => b.children.join("") === label)!;
}
it("reload restores signed envelope and persists it before uncertain exact retry", async () => {
  values.set(key, JSON.stringify(stored));
  await mount();
  expect(button("Prepare 1 XLM payment").props.disabled).toBe(true);
  vi.mocked(fetch).mockImplementation(async (_url, options) => {
    const persisted = JSON.parse(values.get(key)!);
    expect(persisted.signedXdr).toBe(stored.signedXdr);
    expect(persisted.attempted).toBe(true);
    expect(JSON.parse(options!.body as string).signedXdr).toBe(
      stored.signedXdr,
    );
    throw new Error("network lost");
  });
  await act(() => button("Retry exact saved envelope").props.onClick());
  expect(JSON.parse(values.get(key)!).signedXdr).toBe(stored.signedXdr);
  expect(button("Prepare 1 XLM payment").props.disabled).toBe(true);
  expect(button("Acknowledge final result and clear").props.disabled).toBe(
    true,
  );
});
it("another tab owning Web Lock prevents submit and preserves evidence", async () => {
  values.set(key, JSON.stringify(stored));
  await mount();
  lockAvailable = false;
  await act(() => button("Retry exact saved envelope").props.onClick());
  expect(fetch).not.toHaveBeenCalled();
  expect(values.get(key)).toBe(JSON.stringify(stored));
});
it("unreadable storage blocks all new payments instead of discarding evidence", async () => {
  values.set(key, "corrupt recovery");
  await mount();
  expect(button("Connect Freighter").props.disabled).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(values.get(key)).toBe("corrupt recovery");
});
it("storage write failure prevents submission", async () => {
  values.set(key, JSON.stringify(stored));
  await mount();
  vi.stubGlobal("localStorage", {
    length: 1,
    key: () => key,
    getItem: () => JSON.stringify(stored),
    setItem: () => {
      throw new Error("quota");
    },
  });
  await act(() => button("Retry exact saved envelope").props.onClick());
  expect(fetch).not.toHaveBeenCalled();
});
it("UNKNOWN after reload preserves record and never permits clearing", async () => {
  values.set(key, JSON.stringify(stored));
  await mount();
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      data: {
        txHash: stored.prepared.txHash,
        network: "testnet",
        status: "UNKNOWN",
      },
    }),
  );
  await act(() => button("Check original transaction").props.onClick());
  expect(JSON.parse(values.get(key)!).status).toBe("UNKNOWN");
  expect(button("Acknowledge final result and clear").props.disabled).toBe(
    true,
  );
});
