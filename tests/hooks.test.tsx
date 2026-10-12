import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useActivity } from "@/lib/hooks/use-activity";
import { useWalletOperation } from "@/lib/hooks/use-wallet-operation";
import { IntegrationError } from "@/lib/browser-api";
import type { Recovery } from "@/lib/recovery";
vi.mock("@/lib/browser-api", async (original) => ({
  ...(await original<typeof import("@/lib/browser-api")>()),
  browserRequest: vi.fn(),
}));
vi.mock("@/lib/wallet", () => ({ signPrepared: vi.fn() }));
import { browserRequest } from "@/lib/browser-api";
import { signPrepared } from "@/lib/wallet";
const request = vi.mocked(browserRequest);
let tree: ReactTestRenderer;
let visibility: () => void;
let hidden = false;
const storage = new Map<string, string>();
const scope = "team:https://platform.test/deployments/test";
const key = `paiflow:operation:v1:${scope}`;
const hash = "a".repeat(64);
const record: Recovery = {
  version: 1,
  scope,
  operation: "execute",
  address: `G${"A".repeat(55)}`,
  prepared: {
    xdr: "original-envelope",
    network: "testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    expiresAt: "2026-10-11T00:00:00Z",
  },
};
let wallet: ReturnType<typeof useWalletOperation>;
function Wallet() {
  wallet = useWalletOperation(scope, true);
  return null;
}
function Activity() {
  useActivity(true);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  hidden = false;
  storage.clear();
  request.mockReset();
  vi.mocked(signPrepared).mockReset();
  vi.stubGlobal("document", {
    get hidden() {
      return hidden;
    },
    addEventListener: (_: string, callback: () => void) => {
      visibility = callback;
    },
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, v);
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _: string,
        __: unknown,
        callback: (lease: object) => Promise<void>,
      ) => callback({}),
    },
  });
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree.unmount();
    });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(["17", "Mon, 12 Oct 2026 00:00:17 GMT"])(
  "visibility respects Retry-After %s before draining hasMore",
  async (retryAfter) => {
    request
      .mockRejectedValueOnce(
        new IntegrationError("RATE_LIMITED", "Wait", null, retryAfter),
      )
      .mockResolvedValueOnce({ items: [], hasMore: true, nextCursor: "next" })
      .mockResolvedValue({ items: [], hasMore: false, nextCursor: "next" });
    await act(async () => {
      tree = create(<Activity />);
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      hidden = true;
      visibility();
      hidden = false;
      visibility();
      visibility();
      await vi.advanceTimersByTimeAsync(16999);
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2]?.[0]).toBe("/api/events?cursor=next");
  },
);
it("malformed Retry-After uses the five-second fallback across visibility changes", async () => {
  request
    .mockRejectedValueOnce(
      new IntegrationError("RATE_LIMITED", "Wait", null, "invalid"),
    )
    .mockResolvedValue({ items: [], hasMore: false });
  await act(async () => {
    tree = create(<Activity />);
  });
  await act(async () => {
    visibility();
    await vi.advanceTimersByTimeAsync(4999);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(request).toHaveBeenCalledTimes(2);
});
it("visibility events cannot start a duplicate request while a page is in flight", async () => {
  let resolve!: (value: unknown) => void;
  request.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  await act(async () => {
    tree = create(<Activity />);
  });
  await act(async () => {
    visibility();
    visibility();
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({ items: [], hasMore: false });
  });
});
it("migrates expired unsigned legacy evidence, retains unknown status across reload and never submits", async () => {
  storage.set(key, JSON.stringify(record));
  request
    .mockResolvedValueOnce({ txHash: hash })
    .mockResolvedValue({ txHash: hash, status: "UNKNOWN" });
  await act(async () => {
    tree = create(<Wallet />);
  });
  await act(async () => {
    await wallet.reconcile();
  });
  expect(JSON.parse(storage.get(key)!).prepared.txHash).toBe(hash);
  expect(wallet.blocked).toBe(true);
  expect(wallet.message).toContain("cannot prove safe replacement");
  expect(signPrepared).not.toHaveBeenCalled();
  expect(
    request.mock.calls.every(([path]) => path === "/api/integration"),
  ).toBe(true);
  await act(async () => {
    tree.unmount();
    tree = create(<Wallet />);
  });
  expect(wallet.recovery?.prepared.txHash).toBe(hash);
  await act(async () => {
    await wallet.start("execute", record.address, {});
  });
  expect(request).toHaveBeenCalledTimes(2);
});
it.each(["SUCCESS", "FAILED"])(
  "settles expired unsigned legacy evidence on original hash %s",
  async (status) => {
    storage.set(key, JSON.stringify(record));
    request
      .mockResolvedValueOnce({ txHash: hash })
      .mockResolvedValueOnce({ txHash: hash, status });
    await act(async () => {
      tree = create(<Wallet />);
    });
    await act(async () => {
      await wallet.reconcile();
    });
    expect(storage.has(key)).toBe(false);
    expect(wallet.recovery).toBeNull();
    expect(signPrepared).not.toHaveBeenCalled();
  },
);
it("keeps a legacy original hash when transaction lookup fails", async () => {
  storage.set(key, JSON.stringify(record));
  request
    .mockResolvedValueOnce({ txHash: hash })
    .mockRejectedValueOnce(new Error("Lookup unavailable"));
  await act(async () => {
    tree = create(<Wallet />);
  });
  await act(async () => {
    await wallet.reconcile();
  });
  expect(JSON.parse(storage.get(key)!).prepared.txHash).toBe(hash);
  expect(wallet.blocked).toBe(true);
  expect(signPrepared).not.toHaveBeenCalled();
});
it("persists original hash before exposing a fresh preparation to the wallet", async () => {
  request.mockResolvedValueOnce({
    ...record.prepared,
    txHash: hash,
    expiresAt: "2026-10-13T00:00:00Z",
  });
  vi.mocked(signPrepared).mockImplementation(async () => {
    expect(JSON.parse(storage.get(key)!).prepared.txHash).toBe(hash);
    throw new Error("Wallet declined");
  });
  await act(async () => {
    tree = create(<Wallet />);
  });
  await act(async () => {
    await wallet.start("execute", record.address, {});
  });
  expect(wallet.blocked).toBe(true);
  expect(JSON.parse(storage.get(key)!).prepared.txHash).toBe(hash);
});
it("persists the original hash before re-signing an unexpired legacy record", async () => {
  storage.set(
    key,
    JSON.stringify({
      ...record,
      prepared: { ...record.prepared, expiresAt: "2026-10-13T00:00:00Z" },
    }),
  );
  request.mockResolvedValueOnce({ txHash: hash });
  vi.mocked(signPrepared).mockImplementation(async () => {
    expect(JSON.parse(storage.get(key)!).prepared.txHash).toBe(hash);
    throw new Error("Wallet response lost");
  });
  await act(async () => {
    tree = create(<Wallet />);
  });
  await act(async () => {
    await wallet.reconcile();
  });
  expect(wallet.recovery?.prepared.txHash).toBe(hash);
  expect(wallet.recovery?.signing).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});
it("storage failure blocks signing and preserves legacy evidence", async () => {
  const saved = JSON.stringify(record);
  storage.set(key, saved);
  request.mockResolvedValueOnce({ txHash: hash });
  await act(async () => {
    tree = create(<Wallet />);
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: () => {
      throw new Error("Quota exceeded");
    },
    removeItem: vi.fn(),
  });
  await act(async () => {
    await wallet.reconcile();
  });
  expect(storage.get(key)).toBe(saved);
  expect(signPrepared).not.toHaveBeenCalled();
  await act(async () => {
    await wallet.reconcile();
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(wallet.blocked).toBe(true);
});
