"use client";
import { useEffect, useState } from "react";
import type { PublicConfig, Prepared, Result } from "@/lib/types";
import { browserRequest } from "@/lib/browser-api";
import { connectWallet, signPrepared } from "@/lib/wallet";
import { assertOriginal } from "@/lib/transaction";
import {
  readRecovery,
  saveRecovery,
  terminal,
  assertNoConflictingRecovery,
} from "@/lib/recovery";
import type { Recovery } from "@/lib/recovery";

export function StarterApp({ config }: { config: PublicConfig }) {
  const [address, setAddress] = useState("");
  const [record, setRecord] = useState<Recovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(true);
  const key = config.ready ? `paiflow-sdk-payment-v2:${config.scope}` : "";
  useEffect(() => {
    if (!config.ready) return;
    try {
      assertNoConflictingRecovery(localStorage, key);
      const raw = localStorage.getItem(key);
      if (raw) setRecord(readRecovery(config.scope, raw));
      setBlocked(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Recovery storage could not be read. Preserve it for support before starting another payment.",
      );
    }
  }, [key, config]);
  function save(r: Recovery) {
    saveRecovery(localStorage, key, r);
    setRecord(r);
  }
  async function run(action: (current: Recovery | null) => Promise<void>) {
    if (!config.ready || busy || blocked) return;
    setBusy(true);
    setMessage("");
    try {
      if (!navigator.locks)
        throw new Error(
          "This browser needs Web Locks support for safe payment recovery.",
        );
      await navigator.locks.request(
        key,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error(
              "Another tab is handling this deployment's payment. Return to that tab.",
            );
          assertNoConflictingRecovery(localStorage, key);
          const raw = localStorage.getItem(key);
          const current = raw ? readRecovery(config.scope, raw) : null;
          setRecord(current);
          await action(current);
        },
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unresolved operation. Keep the original record.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function prepare(current: Recovery | null) {
    if (current)
      throw new Error("Resolve the existing payment before preparing another.");
    if (!address) throw new Error("Connect Freighter first.");
    const prepared = await browserRequest<Prepared>("/api/pay", {
      action: "prepare",
      from: address,
    });
    if (!config.ready) return;
    save({ version: 2, scope: config.scope, address, prepared });
    setMessage(
      "Prepared and saved. Review the wallet transaction before approving.",
    );
  }
  async function sign(current: Recovery | null) {
    if (!current || current.signedXdr || terminal(current)) return;
    if (address !== current.address)
      throw new Error("Connect the original consenting wallet.");
    const next = { ...current, signing: true };
    save(next);
    const signedXdr = await signPrepared(current.prepared, current.address);
    assertOriginal(current.prepared.xdr, signedXdr, current.prepared.txHash);
    save({ ...next, signing: false, signedXdr });
    setMessage("Exact signed envelope saved. Submit when ready.");
  }
  async function submit(current: Recovery | null) {
    if (!current?.signedXdr || terminal(current)) return;
    assertOriginal(
      current.prepared.xdr,
      current.signedXdr,
      current.prepared.txHash,
    );
    const next = { ...current, attempted: true };
    save(next);
    const result = await browserRequest<Result>("/api/pay", {
      action: "submit",
      signedXdr: current.signedXdr,
      preparationRequestId: current.prepared.preparationRequestId,
    });
    if (result.txHash !== current.prepared.txHash)
      throw new Error("Response hash mismatch. Keep the original record.");
    // A submit response alone never clears evidence. Confirm through the status route.
    setMessage(
      `Submission returned ${result.status}. Check the original transaction status.`,
    );
  }
  async function status(current: Recovery | null) {
    if (!current) return;
    const result = await browserRequest<Result>("/api/pay", {
      action: "status",
      txHash: current.prepared.txHash,
    });
    if (
      result.txHash !== current.prepared.txHash ||
      result.network !== "testnet"
    )
      throw new Error("Status evidence mismatch. Retain the original record.");
    save({ ...current, status: result.status });
    setMessage(
      result.status === "SUCCESS"
        ? "Original transaction confirmed. This does not verify downstream payouts or fulfil an application order."
        : `Original transaction: ${result.status}. UNKNOWN, rejection, expiry or missing history never prove replacement is safe.`,
    );
  }
  async function clear(current: Recovery | null) {
    if (!current || !terminal(current))
      throw new Error(
        "Check final SUCCESS or FAILED before clearing this record.",
      );
    localStorage.removeItem(key);
    if (localStorage.getItem(key) !== null)
      throw new Error("Could not clear stored evidence.");
    setRecord(null);
    setMessage(
      "Final transaction acknowledged. A new demo payment is now possible.",
    );
  }
  return (
    <main>
      <header>
        <h1>Paiflow SDK payment starter</h1>
        <span className="chip" data-testid="network-chip">
          TESTNET
        </span>
      </header>
      <p>
        A minimal 1 XLM payment demo using the server-side Paiflow SDK and
        Freighter. Use your own native-XLM Receive deployment. No goods or
        orders are fulfilled by this example.
      </p>
      {!config.ready ? (
        <aside>{config.message}</aside>
      ) : (
        <p>
          <a href={config.deploymentUrl} target="_blank" rel="noreferrer">
            Review your deployment and its recipients
          </a>
        </p>
      )}
      <section>
        <h2>1. Connect and prepare</h2>
        <button
          disabled={busy || !config.ready || blocked}
          onClick={() =>
            run(async () => {
              await browserRequest("/api/integration");
              setAddress(await connectWallet());
            })
          }
        >
          Connect Freighter
        </button>
        <p>Wallet: {address || "Not connected"}</p>
        <p>
          Payment: 1 testnet XLM plus network fees. Review the full transaction
          in Freighter.
        </p>
        <button
          disabled={busy || blocked || !address || !!record}
          onClick={() => run(prepare)}
        >
          Prepare 1 XLM payment
        </button>
      </section>
      <section>
        <h2>2. Sign and submit</h2>
        <button
          disabled={
            busy || !record || !!record.signedXdr || terminal(record) || blocked
          }
          onClick={() => run(sign)}
        >
          Sign original transaction
        </button>{" "}
        <button
          disabled={
            busy ||
            !record?.signedXdr ||
            (!!record && terminal(record)) ||
            blocked
          }
          onClick={() => run(submit)}
        >
          {record?.attempted
            ? "Retry exact saved envelope"
            : "Submit saved envelope"}
        </button>
      </section>
      <section>
        <h2>3. Verify and recover</h2>
        <p>
          Reloading restores the original preparation and signed envelope. Keep
          this browser's storage until the original transaction is resolved.
          Re-signing uses the same body; it never prepares a replacement.
        </p>
        {record && (
          <>
            <p>
              Original transaction: <code>{record.prepared.txHash}</code>
            </p>
            <p>Preparation expires: {record.prepared.expiresAt}</p>
            <p>Status: {record.status || "Not checked"}</p>
          </>
        )}
        <button
          disabled={busy || !record || blocked}
          onClick={() => run(status)}
        >
          Check original transaction
        </button>{" "}
        <button
          disabled={busy || !record || !terminal(record) || blocked}
          onClick={() => run(clear)}
        >
          Acknowledge final result and clear
        </button>
        <p>
          Inspect the deployment's activity and recipient balances separately to
          verify your intended payment and payout rules. Transaction
          confirmation alone is not application payment verification.
        </p>
      </section>
      <p role="status" aria-live="polite">
        {busy ? "Working…" : message}
      </p>
      <aside>
        This local demo has no app authentication, order database, rate limit or
        business verification. Do not deploy it as a production checkout. A
        production application must bind prepared transactions to authorised
        orders and keep durable server-side recovery evidence. Browser storage
        is not a backup; deleting it loses recovery.
      </aside>
    </main>
  );
}
