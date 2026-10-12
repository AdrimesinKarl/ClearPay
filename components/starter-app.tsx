"use client";
import { useEffect, useState } from "react";
import type { PublicConfig } from "@/lib/paiflow";
import { toStroops } from "@/lib/amount";
import { connectWallet, refreshWallet } from "@/lib/wallet";
import { browserRequest } from "@/lib/browser-api";
import { useWalletOperation } from "@/lib/hooks/use-wallet-operation";
import { useActivity } from "@/lib/hooks/use-activity";
import {
  DeploymentPanels,
  type Discovery,
} from "@/components/deployment-panels";
export function StarterApp({
  config,
  payoutsAvailable: _payoutsAvailable = false,
}: {
  config: PublicConfig;
  payoutsAvailable?: boolean;
}) {
  const enabled = config.mode === "demo" || config.mode === "team";
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("1");
  const [error, setError] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [discoveryError, setDiscoveryError] = useState("");
  const configIdentity = JSON.stringify(config);
  const scope = discovery
    ? `${config.mode}:${discovery.platformOrigin}/${discovery.deploymentId}`
    : "unconfigured";
  const workflow = useWalletOperation(scope, enabled && !!discovery);
  const activity = useActivity(enabled && !!discovery, scope);
  useEffect(() => {
    if (!enabled) return;
    setAddress("");
    const refresh = () => {
      void refreshWallet()
        .then(setAddress)
        .catch(() => setAddress(""));
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, configIdentity]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setDiscovery(null);
    setDiscoveryError("");
    void browserRequest<Discovery>("/api/integration?read=capabilities")
      .then((c) => {
        if (!cancelled) setDiscovery(c);
      })
      .catch((e) => {
        if (!cancelled) setDiscoveryError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, configIdentity]);
  async function connect() {
    try {
      setAddress(await connectWallet());
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  const canPay =
    enabled &&
    (discovery?.operations.execute.status === "supported" ||
      discovery?.operations.execute.status === "conditional");
  return (
    <main>
      <header>
        <h1>Your idea, powered by Paiflow</h1>
        <span className="chip" data-testid="network-chip">
          TESTNET
        </span>
      </header>
      <p>
        Replace these screens with your app. Your deployed flow supplies the
        money logic; integrate and test before the event.
      </p>
      {config.mode === "prepare" && (
        <aside role="status">
          Preparation mode — payments, wallet actions and the live feed are
          disabled. Choose team mode with your deployment and API token to
          integrate and test.
        </aside>
      )}
      {config.mode === "disabled" && (
        <aside role="alert">Payments unavailable: {config.message}</aside>
      )}
      {config.mode === "demo" && (
        <aside>
          Demo mode — shared deployment. Use a throwaway Friendbot wallet:
          others can see your depositing address, and testnet XLM goes to
          Paiflow, not back to you.
        </aside>
      )}
      {discoveryError && (
        <p role="alert">
          Discovery unavailable: {discoveryError}. Confirm credentials and
          hosted API availability before transacting.
        </p>
      )}
      <section aria-label="Customer wallet">
        <h2>Customer wallet</h2>
        <p className="address">{address || "No wallet connected"}</p>
        <button
          disabled={!enabled || workflow.busy}
          onClick={() => void connect()}
        >
          Connect Freighter
        </button>{" "}
        <button
          disabled={!enabled || workflow.busy}
          onClick={() =>
            void refreshWallet()
              .then(setAddress)
              .catch((e) => setError(String(e)))
          }
        >
          Refresh wallet
        </button>
        <p>
          Switch customer accounts in Freighter, then refresh. The selected
          wallet signs its own transaction.
        </p>
      </section>
      <section>
        <h2>Pay</h2>
        {enabled && !canPay && (
          <p>
            {discovery
              ? "This deployment does not support execute checkout. Use its funding or Subscription controls below."
              : "Checking deployment capabilities before enabling checkout…"}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              void workflow.start("execute", address, {
                from: address,
                amount: toStroops(amount),
              });
            } catch (cause) {
              setError(String(cause));
            }
          }}
        >
          <label>
            Amount (flow input asset; XLM in demo mode)
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button disabled={!canPay || workflow.blocked || !address}>
            {workflow.busy ? "Working…" : "Pay"}
          </button>
        </form>
      </section>
      {workflow.message && <p role="status">{workflow.message}</p>}
      {error && <p role="alert">{error}</p>}
      {workflow.recovery && (
        <section>
          <h2>Recover existing transaction</h2>
          <p>
            {workflow.recovery.operation} · Customer {workflow.recovery.address}{" "}
            · {workflow.recovery.prepared.txHash ?? "Hash not yet returned"}
          </p>
          <p>
            The original transaction may still execute. Reload recovery is saved
            in this browser. Do not clear storage or prepare a replacement while
            unresolved.
          </p>
          <button
            disabled={!enabled || workflow.busy}
            onClick={() => void workflow.reconcile()}
          >
            Check again
          </button>
        </section>
      )}
      {discovery && (
        <DeploymentPanels
          capabilities={discovery}
          address={address}
          blocked={workflow.blocked}
          start={workflow.start}
        />
      )}
      <section>
        <h2>Live feed</h2>
        {activity.error && <p role="alert">{activity.error}</p>}
        {!enabled && <p>Live feed is disabled.</p>}
        {enabled && !activity.events.length && (
          <p>
            Waiting for events. Collection can lag; check transaction status
            before paying again.
          </p>
        )}
        <ol>
          {activity.events.map((e) => (
            <li key={e.eventId}>
              <strong>
                {e.kind}
                {e.topic ? ` · ${e.topic}` : ""}
              </strong>{" "}
              · <time dateTime={e.occurredAt}>{e.occurredAt}</time>
              <p>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.txHash}
                </a>
              </p>
              <pre>{JSON.stringify(e.data, null, 2)}</pre>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
