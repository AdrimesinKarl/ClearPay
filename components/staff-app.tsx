"use client";
import { useEffect, useState } from "react";
import type { Fee, PublicPayment } from "@/lib/types";
import { pesos } from "@/lib/fees";
import { browserRequest } from "@/lib/browser-api";

const OFFICE_SUGGESTIONS = ["Registrar", "Department", "Faculty Secretary"];

export function StaffApp() {
  const [authed, setAuthed] = useState(false);
  const [payments, setPayments] = useState<PublicPayment[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [feeLabel, setFeeLabel] = useState("");
  const [feeOffice, setFeeOffice] = useState("");
  const [feeAmount, setFeeAmount] = useState("");

  async function load() {
    try {
      const data = await browserRequest<{ payments: PublicPayment[] }>(
        "/api/staff",
      );
      setPayments(data.payments);
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login() {
    setBusy(true);
    setMessage("");
    try {
      await browserRequest("/api/staff", { action: "login", code });
      setCode("");
      await load();
      setMessage("Signed in. Payment records below are server-verified.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Sign-in could not complete.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await browserRequest("/api/staff", { action: "logout" });
    } finally {
      setAuthed(false);
      setPayments([]);
      setBusy(false);
      setMessage("Signed out.");
    }
  }

  async function addFee() {
    setBusy(true);
    setMessage("");
    try {
      const { fee } = await browserRequest<{ fee: Fee }>("/api/staff", {
        action: "add-fee",
        label: feeLabel,
        office: feeOffice,
        amount: feeAmount,
      });
      setFeeLabel("");
      setFeeOffice("");
      setFeeAmount("");
      setMessage(
        `Fee added for ${fee.office} (${pesos(fee.amountCentavos)}). It now appears unpaid in the student fee list.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Fee could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createDemoFees() {
    setBusy(true);
    setMessage("");
    try {
      const { fees } = await browserRequest<{ fees: Fee[] }>("/api/staff", {
        action: "create-demo-fees",
      });
      const groups = [...new Set(fees.map((f) => f.group).filter(Boolean))];
      setMessage(
        `Demo fees created: ${groups.join(" and ")}. Each group can be paid as its own transaction. Existing fees and records were not changed.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Demo fees could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetDemoData() {
    setBusy(true);
    setMessage("");
    try {
      const { removedPayments, fees } = await browserRequest<{
        removedPayments: number;
        removedFees: number;
        fees: Fee[];
      }>("/api/staff", { action: "reset-demo-data" });
      const groups = [...new Set(fees.map((f) => f.group).filter(Boolean))];
      setMessage(
        `Demo data reset: removed ${removedPayments} demo payment record(s) and issued fresh unpaid fees for ${groups.join(", ")}. Real and non-demo records were not touched.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Demo data could not be reset.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">ClearPay · Staff</span>
          <span className="brand-tagline">Campus payment verification</span>
        </div>
        <span className="chip" data-testid="network-chip">
          TESTNET
        </span>
        <a className="staff-link" href="/">
          Student checkout
        </a>
      </header>

      <p className="lede">
        Authorized campus staff can review payment records, allocations and
        Paiflow verification status. Access is gated by the server-configured
        staff code.
      </p>
      {!authed ? (
        <section className="signin-card" aria-labelledby="staff-signin-heading">
          <h2 id="staff-signin-heading">Staff sign-in</h2>
          <label>
            Access code
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button disabled={busy || !code} onClick={() => void login()}>
            Sign in
          </button>
        </section>
      ) : (
        <>
          <section aria-labelledby="staff-fees-heading">
            <p className="step-kicker">Fee catalog</p>
            <h2 id="staff-fees-heading">Issue a new fee</h2>
            <p className="step-intro">
              New fees start unpaid and appear in the student&apos;s
              outstanding-fees list. Issuing fees never changes or deletes
              existing fees, payment records, or receipts.
            </p>
            <div className="form-grid">
              <label>
                Description
                <input
                  type="text"
                  value={feeLabel}
                  onChange={(e) => setFeeLabel(e.target.value)}
                  placeholder="e.g. Pre-Oral Defense Fee"
                  maxLength={120}
                />
              </label>
              <label>
                Recipient office
                <input
                  type="text"
                  list="staff-offices"
                  value={feeOffice}
                  onChange={(e) => setFeeOffice(e.target.value)}
                  placeholder="e.g. Registrar"
                  maxLength={80}
                />
                <datalist id="staff-offices">
                  {OFFICE_SUGGESTIONS.map((office) => (
                    <option key={office} value={office} />
                  ))}
                </datalist>
              </label>
              <label>
                Amount (₱)
                <input
                  type="text"
                  inputMode="decimal"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  placeholder="e.g. 500 or 500.50"
                />
              </label>
            </div>
            <button
              disabled={busy || !feeLabel.trim() || !feeOffice.trim() || !feeAmount.trim()}
              onClick={() => void addFee()}
            >
              Add fee
            </button>{" "}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void createDemoFees()}
            >
              Create Demo Fees
            </button>{" "}
            <button
              className="danger"
              disabled={busy}
              onClick={() => void resetDemoData()}
            >
              Reset Demo Data
            </button>
            <p className="muted">
              Create Demo Fees issues the Thesis Partial Payment, Pre-Oral
              Defense, and Final Defense groups (Registrar and Department
              allocations per group). Each group is paid as its own
              transaction with its own verification and receipt. Reset Demo
              Data clears only demo transaction history and reissues these
              groups as fresh unpaid fees; real and non-demo records are never
              touched.
            </p>
          </section>
          <section aria-labelledby="staff-ledger-heading">
          <div className="staff-header-row">
            <div>
              <p className="step-kicker">Campus ledger</p>
              <h2 id="staff-ledger-heading">Payment records</h2>
            </div>
            <span style={{ marginLeft: "auto" }}>
              <button className="secondary" disabled={busy} onClick={() => void load()}>
                Refresh
              </button>{" "}
              <button className="danger" disabled={busy} onClick={() => void logout()}>
                Sign out
              </button>
            </span>
          </div>
          {payments.length === 0 ? (
            <p className="muted">No payment records yet.</p>
          ) : (
            <div className="table-scroll">
              <table data-testid="staff-ledger">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Student wallet</th>
                    <th>Allocations</th>
                    <th className="amount">Total</th>
                    <th>Transaction</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <code>{payment.id.slice(0, 8)}</code>
                        {payment.verifiedAt ? (
                          <div className="muted">
                            verified {payment.verifiedAt}
                          </div>
                        ) : null}
                      </td>
                      <td className="address">
                        <code>{payment.studentAddress}</code>
                      </td>
                      <td>
                        {payment.allocations.map((allocation) => (
                          <div key={allocation.feeId}>
                            {allocation.group ? (
                              <div className="fee-group">{allocation.group}</div>
                            ) : null}
                            <strong>{allocation.office}:</strong>{" "}
                            {pesos(allocation.amountCentavos)}
                          </div>
                        ))}
                      </td>
                      <td className="amount">{payment.totalDisplay}</td>
                      <td className="address">
                        <code>{payment.txHash}</code>
                        {payment.txStatus ? (
                          <div className="muted">tx {payment.txStatus}</div>
                        ) : null}
                      </td>
                      <td>
                        {payment.status === "CONFIRMED" ? (
                          <span className="badge badge-success">Verified</span>
                        ) : payment.status === "FAILED" ? (
                          <span className="badge badge-danger">
                            {payment.status}
                          </span>
                        ) : (
                          <span className="badge badge-warning">
                            {payment.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </section>
        </>
      )}
      <p className="live-status" role="status" aria-live="polite">
        {busy ? "Working…" : message}
      </p>
      <aside>
        Staff records are the campus ledger view of the same payments students
        make. A record is only marked Verified after Paiflow reports the
        original transaction as SUCCESS; PENDING or UNKNOWN records stay
        unresolved.
      </aside>
    </main>
  );
}
