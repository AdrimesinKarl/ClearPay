"use client";
import { useEffect, useRef, useState } from "react";
import type {
  FeeWithStatus,
  Prepared,
  PublicConfig,
  PublicPayment,
  Result,
} from "@/lib/types";
import { pesos } from "@/lib/fees";
import {
  BrowserRequestError,
  browserRequest,
  RESPONSE_DEADLINE_MS,
} from "@/lib/browser-api";
import {
  assertStatus,
  confirmOriginal,
  CONFIRMATION_PENDING,
  CONFIRMATION_UNRESOLVED,
} from "@/lib/confirmation";
import { connectWallet, signPrepared } from "@/lib/wallet";
import { assertOriginal } from "@/lib/transaction";
import {
  readRecovery,
  saveRecovery,
  terminal,
  assertNoConflictingRecovery,
} from "@/lib/recovery";
import type { Recovery } from "@/lib/recovery";

type Operation = {
  signal: AbortSignal;
  valid: () => boolean;
  save: (record: Recovery) => void;
  message: (message: string) => void;
};

type PrepareResponse = { payment: PublicPayment; prepared: Prepared };
type StatusResponse = { payment: PublicPayment; result: Result };

/** Only a Paiflow-verified SUCCESS authorizes replacing the stored record. */
function replaceable(record: Recovery) {
  return terminal(record) && record.status === "SUCCESS";
}

export function ClearPayApp({ config }: { config: PublicConfig }) {
  const [address, setAddress] = useState("");
  const [record, setRecord] = useState<Recovery | null>(null);
  const [payment, setPayment] = useState<PublicPayment | null>(null);
  const [fees, setFees] = useState<FeeWithStatus[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [feesVersion, setFeesVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(true);
  const key = config.ready ? `paiflow-sdk-payment-v2:${config.scope}` : "";
  const scope = config.ready ? config.scope : "";
  const scopeKey = useRef(key);
  scopeKey.current = key;
  const loadedKey = useRef<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const resumed = useRef(new Set<string>());

  useEffect(() => {
    loadedKey.current = null;
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setConfirming(false);
    resumed.current.clear();
    setBlocked(true);
    setRecord(null);
    setPayment(null);
    setAddress("");
    setMessage("");
    if (!config.ready) return;
    try {
      assertNoConflictingRecovery(localStorage, key);
      const raw = localStorage.getItem(key);
      if (raw) setRecord(readRecovery(config.scope, raw));
      loadedKey.current = key;
      setBlocked(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Recovery storage could not be read. Preserve it for support before starting another payment.",
      );
    }
    return () => {
      loadedKey.current = null;
      active.current?.abort();
    };
  }, [key, config.ready]);

  useEffect(() => {
    if (!config.ready) return;
    const controller = new AbortController();
    (async () => {
      try {
        const catalog = await browserRequest<{
          ready: boolean;
          fees: FeeWithStatus[];
        }>("/api/fees", undefined, controller.signal);
        const withStatus = address
          ? await browserRequest<FeeWithStatus[]>(
              "/api/fees",
              { from: address },
              controller.signal,
            )
          : catalog.fees.map((f) => ({ ...f, paid: false }));
        if (controller.signal.aborted) return;
        setFees(withStatus);
        setSelected((prev) =>
          prev.filter((id) => withStatus.some((f) => f.id === id && !f.paid)),
        );
      } catch {
        // Fee status refresh failures are non-fatal; payment actions re-check.
      }
    })();
    return () => controller.abort();
  }, [key, config.ready, address, feesVersion]);

  async function run(
    action: (current: Recovery | null, op: Operation) => Promise<void>,
  ) {
    if (!config.ready || active.current || blocked || loadedKey.current !== key)
      return;
    const controller = new AbortController();
    active.current = controller;
    const valid = () =>
      !controller.signal.aborted &&
      scopeKey.current === key &&
      loadedKey.current === key;
    const op: Operation = {
      signal: controller.signal,
      valid,
      save: (r) => {
        if (!valid())
          throw new DOMException("Operation cancelled", "AbortError");
        if (r.scope !== config.scope)
          throw new Error(
            "Recovery scope mismatch. Retain the original record.",
          );
        saveRecovery(localStorage, key, r);
        setRecord(r);
      },
      message: (text) => {
        if (valid()) setMessage(text);
      },
    };
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
          if (!valid()) return;
          if (!lock)
            throw new Error(
              "Another tab is handling this student's payment. Return to that tab.",
            );
          assertNoConflictingRecovery(localStorage, key);
          const raw = localStorage.getItem(key);
          const current = raw ? readRecovery(config.scope, raw) : null;
          setRecord(current);
          await action(current, op);
        },
      );
    } catch (error) {
      op.message(
        error instanceof Error
          ? error.message
          : "Unresolved operation. Keep the original record.",
      );
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (scopeKey.current === key && loadedKey.current === key) {
          setBusy(false);
          setConfirming(false);
        }
      }
    }
  }

  function statusMessage(result: Result, appStatus?: string) {
    if (result.status === "SUCCESS")
      return "Transaction verified with Paiflow. The digital receipt below is confirmed; campus fee statuses are updated.";
    if (result.status === "FAILED")
      return "Transaction failed on the network. Its evidence is retained until acknowledged.";
    if (appStatus === "CONFIRMED")
      return "Transaction verified with Paiflow. The digital receipt below is confirmed.";
    return `Transaction: ${result.status}. UNKNOWN, rejection, expiry or missing history never prove replacement is safe.`;
  }

  async function checkOriginal(current: Recovery, op: Operation) {
    if (!op.valid() || !current.paymentId) return;
    resumed.current.add(`${key}:${current.prepared.txHash}`);
    op.message(CONFIRMATION_PENDING);
    setConfirming(true);
    const outcome = await confirmOriginal({
      txHash: current.prepared.txHash,
      signal: op.signal,
      lookup: (signal, remainingMs) =>
        browserRequest<StatusResponse>(
          "/api/payments",
          { action: "status", paymentId: current.paymentId },
          signal,
          remainingMs,
        ).then((r) => {
          if (op.valid()) {
            setPayment(r.payment);
            if (r.payment.status === "CONFIRMED")
              setFeesVersion((v) => v + 1);
          }
          return r.result;
        }),
      onResult: (result) => {
        op.save({ ...current, status: result.status });
        if (
          result.status === "SUCCESS" ||
          result.status === "FAILED" ||
          result.status === "REJECTED"
        )
          op.message(statusMessage(result));
      },
    });
    if (outcome === "unresolved") op.message(CONFIRMATION_UNRESOLVED);
  }

  useEffect(() => {
    if (
      blocked ||
      busy ||
      !record?.attempted ||
      !record.signedXdr ||
      terminal(record)
    )
      return;
    const identity = `${key}:${record.prepared.txHash}`;
    if (resumed.current.has(identity)) return;
    resumed.current.add(identity);
    void run(async (current, op) => {
      if (current?.attempted && current.signedXdr && !terminal(current))
        await checkOriginal(current, op);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, blocked, busy, record]);

  async function prepare(current: Recovery | null, op: Operation) {
    if (current && !replaceable(current))
      throw new Error("Resolve the existing payment before preparing another.");
    if (!address) throw new Error("Connect Freighter first.");
    const feeIds = selected.filter((id) =>
      fees.some((f) => f.id === id && !f.paid),
    );
    if (feeIds.length === 0)
      throw new Error("Select at least one unpaid fee to check out.");
    if (current) {
      // Paiflow verified SUCCESS: the campus ledger retains the record, so
      // starting a new checkout releases the previous verified recovery slot.
      localStorage.removeItem(key);
      if (localStorage.getItem(key) !== null)
        throw new Error("Could not clear stored evidence.");
      setRecord(null);
    }
    const response = await browserRequest<PrepareResponse>(
      "/api/payments",
      { action: "prepare", from: address, feeIds },
      op.signal,
    );
    if (!op.valid()) return;
    op.save({
      version: 2,
      scope,
      address,
      paymentId: response.payment.id,
      prepared: response.prepared,
    });
    setPayment(response.payment);
    op.message(
      "Prepared and saved. Review the wallet transaction before approving.",
    );
  }

  async function sign(current: Recovery | null, op: Operation) {
    if (!current || current.signedXdr || terminal(current)) return;
    if (address !== current.address)
      throw new Error("Connect the original consenting wallet.");
    const next = { ...current, signing: true };
    op.save(next);
    const signedXdr = await signPrepared(current.prepared, current.address);
    assertOriginal(current.prepared.xdr, signedXdr, current.prepared.txHash);
    op.save({ ...next, signing: false, signedXdr });
    op.message("Exact signed envelope saved. Submit when ready.");
  }

  async function submit(current: Recovery | null, op: Operation) {
    if (!current?.signedXdr || terminal(current)) return;
    assertOriginal(
      current.prepared.xdr,
      current.signedXdr,
      current.prepared.txHash,
    );
    const next = { ...current, attempted: true };
    resumed.current.add(`${key}:${current.prepared.txHash}`);
    op.save(next);
    let response: StatusResponse;
    try {
      response = await browserRequest<StatusResponse>(
        "/api/payments",
        {
          action: "submit",
          paymentId: current.paymentId,
          signedXdr: current.signedXdr,
          preparationRequestId: current.prepared.preparationRequestId,
        },
        op.signal,
        RESPONSE_DEADLINE_MS,
      );
      if (op.valid()) setPayment(response.payment);
    } catch (error) {
      if (!op.valid()) return;
      if (
        error instanceof BrowserRequestError &&
        error.status < 500 &&
        error.code !== "UPSTREAM_RPC"
      )
        throw error;
      await checkOriginal(next, op);
      return;
    }
    if (!op.valid()) return;
    if (response.result.txHash !== current.prepared.txHash)
      throw new Error("Response hash mismatch. Keep the original record.");
    if (response.result.status === "REJECTED") {
      op.save({ ...next, status: "REJECTED" });
      op.message(statusMessage(response.result));
      return;
    }
    // Confirmation uses the original status route even when submission reports success.
    await checkOriginal(next, op);
  }

  async function status(current: Recovery | null, op: Operation) {
    if (!current?.paymentId) return;
    const response = await browserRequest<StatusResponse>(
      "/api/payments",
      { action: "status", paymentId: current.paymentId },
      op.signal,
      RESPONSE_DEADLINE_MS,
    );
    if (!op.valid()) return;
    assertStatus(response.result, current.prepared.txHash);
    setPayment(response.payment);
    if (response.payment.status === "CONFIRMED")
      setFeesVersion((v) => v + 1);
    op.save({ ...current, status: response.result.status });
    op.message(statusMessage(response.result, response.payment.status));
  }

  async function clear(current: Recovery | null, op: Operation) {
    if (!current || !terminal(current))
      throw new Error(
        "Check final SUCCESS or FAILED before clearing this record.",
      );
    if (!op.valid()) return;
    localStorage.removeItem(key);
    if (localStorage.getItem(key) !== null)
      throw new Error("Could not clear stored evidence.");
    setRecord(null);
    setPayment(null);
    setFeesVersion((v) => v + 1);
    op.message(
      "Final transaction acknowledged. The receipt stays in the campus ledger for staff; a new payment is now possible.",
    );
  }

  const selectedFees = fees.filter((f) => selected.includes(f.id));
  const selectedTotal = selectedFees.reduce((sum, f) => sum + f.amountCentavos, 0);
  const resolved = !!record && replaceable(record);

  const bannerClass = (status: string, txStatus?: string | null) => {
    if (status === "CONFIRMED" && txStatus === "SUCCESS") return "verified";
    if (status === "FAILED" || txStatus === "FAILED") return "failed";
    return "pending";
  };

  return (
    <main>
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">ClearPay</span>
          <span className="brand-tagline">University fee settlement</span>
        </div>
        <span className="chip" data-testid="network-chip">
          TESTNET
        </span>
        <a className="staff-link" href="/staff">
          Staff sign-in
        </a>
      </header>

      <p className="lede">
        One student checkout settles multiple campus offices through a single
        Paiflow testnet payment. The on-chain settlement is{" "}
        <strong>1 testnet XLM</strong> from the configured deployment; the peso
        amounts are the campus ledger allocations recorded with the verified
        transaction.
      </p>
      {!config.ready ? (
        <aside role="alert">{config.message}</aside>
      ) : (
        <p className="muted">
          <a href={config.deploymentUrl} target="_blank" rel="noreferrer">
            Review your deployment and its recipients
          </a>
        </p>
      )}

      <section aria-labelledby="fees-heading">
        <p className="step-kicker">Step 1</p>
        <h2 id="fees-heading">Fees</h2>
        <p className="step-intro">
          Select the fees to pay. Paid fees cannot be selected again.
        </p>
        {fees.length === 0 ? (
          <p className="muted">Loading fees…</p>
        ) : (
          <ul className="fee-list">
            {fees.map((fee) => (
              <li key={fee.id}>
                <label className="fee-row">
                  <input
                    type="checkbox"
                    disabled={fee.paid || busy || blocked || (!!record && !resolved)}
                    checked={selected.includes(fee.id)}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.includes(fee.id)
                          ? prev.filter((id) => id !== fee.id)
                          : [...prev, fee.id],
                      )
                    }
                  />
                  <span className="fee-name">
                    {fee.group && (
                      <span className="fee-group">{fee.group}</span>
                    )}
                    <span className="fee-office">{fee.office}</span>
                    <span className="fee-label">{fee.label}</span>
                  </span>
                  <span className="fee-amount">{pesos(fee.amountCentavos)}</span>
                  {fee.paid && <span className="badge badge-success">Paid</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {selectedFees.length > 0 && (
          <div className="summary-card" data-testid="checkout-summary">
            <h3>Allocations</h3>
            <table>
              <tbody>
                {selectedFees.map((fee) => (
                  <tr key={fee.id}>
                    <td>
                      {fee.group && <div className="fee-group">{fee.group}</div>}
                      {fee.office}
                    </td>
                    <td>{fee.label}</td>
                    <td className="amount">{pesos(fee.amountCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="total-row">
              <span className="total-label">Combined total</span>
              <span className="total-amount" data-testid="checkout-total">
                {pesos(selectedTotal)}
              </span>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="checkout-heading">
        <p className="step-kicker">Step 2</p>
        <h2 id="checkout-heading">Checkout</h2>
        <p className="wallet-line">
          <button
            className="secondary"
            disabled={busy || !config.ready || blocked}
            onClick={() =>
              run(async (_current, op) => {
                await browserRequest("/api/fees", undefined, op.signal);
                const connected = await connectWallet();
                if (op.valid()) setAddress(connected);
              })
            }
          >
            Connect Freighter
          </button>
          {address ? (
            <span className="wallet-pill">{address}</span>
          ) : (
            <span className="muted">Wallet not connected</span>
          )}
        </p>
        <p className="step-intro">
          Settlement: 1 testnet XLM plus network fees for the selected fees.
          Review the full transaction in Freighter.
        </p>
        <button
          disabled={
            busy ||
            blocked ||
            !address ||
            selected.length === 0 ||
            (!!record && !resolved)
          }
          onClick={() => run(prepare)}
        >
          Pay selected fees · 1 testnet XLM
        </button>
      </section>

      <section aria-labelledby="sign-heading">
        <p className="step-kicker">Step 3</p>
        <h2 id="sign-heading">Sign, submit and verify</h2>
        <button
          disabled={
            busy || !record || !!record.signedXdr || terminal(record) || blocked
          }
          onClick={() => run(sign)}
        >
          Sign original transaction
        </button>{" "}
        <button
          className="secondary"
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
        {record && (
          <p className="muted">
            Original transaction: <code>{record.prepared.txHash}</code>
          </p>
        )}
      </section>

      <section aria-labelledby="receipt-heading">
        <p className="step-kicker">Step 4</p>
        <h2 id="receipt-heading">Receipt</h2>
        {payment ? (
          <div data-testid="receipt">
            <div
              className={`status-banner ${bannerClass(payment.status, payment.txStatus)}`}
            >
              {payment.status === "CONFIRMED"
                ? "Verified with Paiflow"
                : payment.status}
              {payment.txStatus ? ` · transaction ${payment.txStatus}` : ""}
            </div>
            <dl className="receipt-meta">
              <div>
                <dt>Transaction reference</dt>
                <dd>
                  <code>{payment.txHash}</code>
                </dd>
              </div>
              <div>
                <dt>Receipt number</dt>
                <dd>{payment.id}</dd>
              </div>
              {payment.verifiedAt && (
                <div>
                  <dt>Verified at</dt>
                  <dd>{payment.verifiedAt}</dd>
                </div>
              )}
            </dl>
            <table>
              <tbody>
                {payment.allocations.map((allocation) => (
                  <tr key={allocation.feeId}>
                    <td>
                      {allocation.group && (
                        <div className="fee-group">{allocation.group}</div>
                      )}
                      {allocation.office}
                    </td>
                    <td>{allocation.label}</td>
                    <td className="amount">
                      {pesos(allocation.amountCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total settled</td>
                  <td className="amount">{payment.totalDisplay}</td>
                </tr>
              </tfoot>
            </table>
            {payment.status === "CONFIRMED" ? (
              <p className="badge badge-success" data-testid="verified-badge">
                Confirmed campus receipt
              </p>
            ) : (
              <p className="notice notice-warning" role="alert">
                This receipt is not confirmed yet. Only a Paiflow-verified
                SUCCESS marks it confirmed; never treat a redirect or an
                unverified response as payment.
              </p>
            )}
          </div>
        ) : (
          <p className="muted">No payment prepared yet.</p>
        )}
        <button
          className="secondary"
          disabled={busy || !record || blocked}
          onClick={() => run(status)}
        >
          Check transaction
        </button>{" "}
        <button
          className="danger"
          disabled={busy || !record || !terminal(record) || blocked}
          onClick={() => run(clear)}
        >
          Acknowledge final result and clear
        </button>
        <p className="muted">
          Reloading restores the original preparation and signed envelope. Keep
          this browser&apos;s storage until the original transaction is
          resolved. Re-signing uses the same body; it never prepares a
          replacement. Once Paiflow verifies SUCCESS, the checkout releases
          automatically for the next payment; FAILED results stay until you
          acknowledge them above.
        </p>
      </section>

      <p className="live-status" role="status" aria-live="polite">
        {confirming ? message : busy ? "Working…" : message}
      </p>
      {confirming && (
        <button
          className="danger"
          onClick={() => {
            active.current?.abort();
            setMessage(CONFIRMATION_UNRESOLVED);
          }}
        >
          Stop checking
        </button>
      )}
      <aside>
        ClearPay is a testnet demonstration: it has no student account system,
        rate limits or fulfilment integration, and the peso allocations are
        campus ledger entries recorded against the verified transaction, not
        on-chain amounts. A production deployment needs student authentication,
        durable server-side recovery evidence and independent payout
        verification. Browser storage is not a backup; deleting it loses
        recovery.
      </aside>
    </main>
  );
}
