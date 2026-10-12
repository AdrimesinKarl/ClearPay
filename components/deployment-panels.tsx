"use client";
import { useEffect, useState, useRef } from "react";
import type {
  DeploymentCapabilities,
  FundingDiscovery,
  ScheduleState,
  SubscriptionState,
} from "@/lib/api-types";
import { browserRequest } from "@/lib/browser-api";
import { toStroops } from "@/lib/amount";
import type { Operation } from "@/lib/hooks/use-wallet-operation";
export type Discovery = DeploymentCapabilities & {
  platformOrigin: string;
  applicationAuthorization: {
    schedule: Record<"pause" | "resume" | "retrieve", boolean>;
    releaseEarly: boolean;
  };
};
export function NodeSelect({
  nodes,
  value,
  onChange,
}: {
  nodes: string[];
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label>
      Node
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a node</option>
        {nodes.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}
export type PanelKind =
  | "balances"
  | "funding"
  | "schedule"
  | "subscription"
  | "quote"
  | "release"
  | "webhook";
export type PanelProps = {
  capabilities: Discovery;
  address: string;
  blocked: boolean;
  start: (op: Operation, address: string, input: unknown) => Promise<void>;
};
export function DeploymentPanels({
  capabilities: c,
  address,
  blocked,
  start,
  only,
}: {
  only?: PanelKind[];
  capabilities: Discovery;
  address: string;
  blocked: boolean;
  start: (op: Operation, address: string, input: unknown) => Promise<void>;
}) {
  const show = (kind: PanelKind) => !only || only.includes(kind);
  const scheduleSelection = useRef("");
  const [funding, setFunding] = useState<FundingDiscovery | null>(null);
  const [schedule, setSchedule] = useState<ScheduleState | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(
    null,
  );
  const [fundNode, setFundNode] = useState("");
  const [scheduleNode, setScheduleNode] = useState("");
  const [releaseNode, setReleaseNode] = useState("");
  const [swapNode, setSwapNode] = useState("");
  const [amount, setAmount] = useState("1");
  const [approval, setApproval] = useState("1");
  const [holdings, setHoldings] = useState<unknown>(null);
  const [quote, setQuote] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [releasePending, setReleasePending] = useState(false);
  scheduleSelection.current = scheduleNode;
  const available = (k: keyof DeploymentCapabilities["operations"]) =>
    ["supported", "conditional"].includes(
      c.operations[k]?.status ?? "unsupported",
    );
  async function read<T>(kind: string, set: (v: T) => void, nodeId?: string) {
    try {
      const result = await browserRequest<T>(
        `/api/integration?read=${kind}${nodeId ? `&nodeId=${encodeURIComponent(nodeId)}` : ""}`,
      );
      if (kind === "schedule" && nodeId !== scheduleSelection.current) return;
      set(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "State unavailable");
    }
  }
  useEffect(() => {
    if (show("funding") && available("funding"))
      void read<FundingDiscovery>("funding", setFunding);
    if (show("subscription") && available("subscriptionState"))
      void read<SubscriptionState>("subscription", setSubscription);
  }, [c]);
  useEffect(() => {
    setSchedule(null);
    if (scheduleNode)
      void read<ScheduleState>("schedule", setSchedule, scheduleNode);
  }, [scheduleNode]);
  useEffect(() => {
    setReleasePending(
      localStorage.getItem(
        `paiflow:release:${c.platformOrigin}/${c.deploymentId}`,
      ) !== null,
    );
  }, [c.deploymentId]);
  async function action(op: Operation, input: unknown) {
    try {
      await start(op, address, input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid amount");
    }
  }
  const fundingSelection = funding?.nodes.find((n) => n.nodeId === fundNode);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {show("balances") && available("balances") && (
        <section>
          <h2>Balances and held funds</h2>
          <button onClick={() => void read("balances", setHoldings)}>
            Refresh balances
          </button>
          <p>
            Amounts are integer stroops. Check freshness and completeness;
            holdings do not establish release eligibility.
          </p>
          {holdings !== null && <pre>{JSON.stringify(holdings, null, 2)}</pre>}
        </section>
      )}
      {show("funding") && available("funding") && (
        <section>
          <h2>Fund the pool</h2>
          <p>
            Funding adds funds only. It does not execute a payout or Webhook
            callback.
          </p>
          <NodeSelect
            nodes={funding?.nodes.map((n) => n.nodeId) ?? []}
            value={fundNode}
            onChange={setFundNode}
          />
          {fundingSelection && (
            <p>Live token: {fundingSelection.tokenContractAddress}</p>
          )}
          <label>
            Amount
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button
            disabled={blocked || !address || !fundingSelection}
            onClick={() => {
              try {
                void action("funding", {
                  nodeId: fundNode,
                  fromAddress: address,
                  tokenContractAddress: fundingSelection!.tokenContractAddress,
                  amountStroops: toStroops(amount),
                });
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Prepare, sign and fund
          </button>
        </section>
      )}
      {show("schedule") && available("scheduleState") && (
        <section>
          <h2>Schedule</h2>
          <NodeSelect
            nodes={c.operations.scheduleState.nodeIds}
            value={scheduleNode}
            onChange={setScheduleNode}
          />
          <button
            disabled={!scheduleNode}
            onClick={() =>
              void read<ScheduleState>("schedule", setSchedule, scheduleNode)
            }
          >
            Refresh Schedule state
          </button>
          {schedule && schedule.nodeId === scheduleNode && (
            <>
              <p>
                Controller: {schedule.controller} ·{" "}
                {schedule.paused ? "Paused" : "Running"}
              </p>
              <pre>{JSON.stringify(schedule, null, 2)}</pre>
              {(["pause", "resume", "retrieve"] as const).map((a) => (
                <p key={a}>
                  {schedule.controlEligibility[a] &&
                  c.applicationAuthorization.schedule[a] ? (
                    <button
                      disabled={blocked || address !== schedule.controller}
                      onClick={() =>
                        void action(`schedule.${a}`, {
                          walletAddress: address,
                          nodeId: scheduleNode,
                        })
                      }
                    >
                      {a}
                    </button>
                  ) : (
                    `${a} unavailable: live eligibility or application authorization is required.`
                  )}
                </p>
              ))}
            </>
          )}
        </section>
      )}
      {show("subscription") && available("subscriptionState") && (
        <section>
          <h2>Subscription</h2>
          <button
            onClick={() =>
              void read<SubscriptionState>("subscription", setSubscription)
            }
          >
            Refresh Subscription state
          </button>
          {subscription && (
            <>
              <p>
                {subscription.isCancelled ? "Cancelled" : "Active"} ·
                Subscriber: {subscription.subscriber ?? "Setup required"} ·
                Allowance: {subscription.allowance} stroops (
                {subscription.assetLabel})
              </p>
              <p>
                This deployment has one configured subscriber. The matching
                original customer's wallet must consent.
              </p>
              <label>
                Additional allowance
                <input
                  value={approval}
                  inputMode="decimal"
                  onChange={(e) => setApproval(e.target.value)}
                />
              </label>
              <button
                disabled={
                  blocked ||
                  subscription.setupRequired ||
                  subscription.isCancelled ||
                  address !== subscription.subscriber ||
                  !available("subscriptionAllowance")
                }
                onClick={() => {
                  try {
                    void action("allowance", {
                      userAddress: address,
                      amount: toStroops(approval),
                    });
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Approve allowance
              </button>
              <button
                disabled={
                  blocked ||
                  subscription.setupRequired ||
                  address !== subscription.subscriber ||
                  !available(
                    subscription.isCancelled
                      ? "subscriptionReactivate"
                      : "subscriptionCancel",
                  )
                }
                onClick={() =>
                  void action(
                    subscription.isCancelled
                      ? "subscription.reactivate"
                      : "subscription.cancel",
                    { walletAddress: address },
                  )
                }
              >
                {subscription.isCancelled ? "Reactivate" : "Cancel"}
              </button>
              <p>
                Reactivation grants no allowance and does not immediately
                charge. Refresh state after confirmation.
              </p>
            </>
          )}
        </section>
      )}
      {show("quote") && available("swapQuote") && (
        <section>
          <h2>Swap estimate</h2>
          <NodeSelect
            nodes={c.operations.swapQuote.nodeIds}
            value={swapNode}
            onChange={setSwapNode}
          />
          <label>
            Input amount
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button
            disabled={!swapNode}
            onClick={() => {
              try {
                void read(
                  `quote&amount=${toStroops(amount)}`,
                  setQuote,
                  swapNode,
                );
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Get quote
          </button>
          <p>
            Selected-node estimate only; execution and downstream output may
            differ.
          </p>
          {quote !== null && <pre>{JSON.stringify(quote, null, 2)}</pre>}
        </section>
      )}
      {show("release") && available("releaseEarly") && (
        <section>
          <h2>Early release</h2>
          <NodeSelect
            nodes={c.operations.releaseEarly.nodeIds}
            value={releaseNode}
            onChange={setReleaseNode}
          />
          <p>
            Candidate nodes require live deadline and branch eligibility checks
            by the server. Configure app authorization first.
          </p>
          <button
            disabled={
              !c.applicationAuthorization.releaseEarly ||
              !releaseNode ||
              blocked ||
              releasePending
            }
            onClick={() => {
              void (async () => {
                try {
                  const releaseKey = `paiflow:release:${c.platformOrigin}/${c.deploymentId}`;
                  if (!navigator.locks)
                    throw new Error(
                      "Use a browser with Web Locks for release controls.",
                    );
                  await navigator.locks.request(
                    releaseKey,
                    { ifAvailable: true },
                    async (lease) => {
                      if (!lease || localStorage.getItem(releaseKey))
                        throw new Error(
                          "An existing release requires operator review before another attempt.",
                        );
                      localStorage.setItem(
                        `paiflow:release:${c.platformOrigin}/${c.deploymentId}`,
                        "unresolved",
                      );
                      setReleasePending(true);
                      const r = await browserRequest<{ txHash: string }>(
                        "/api/integration",
                        {
                          operation: "releaseEarly",
                          phase: "prepare",
                          input: { nodeId: releaseNode },
                        },
                      );
                      localStorage.setItem(
                        `paiflow:release:${c.platformOrigin}/${c.deploymentId}`,
                        r.txHash,
                      );
                      setError(
                        `Release confirmed: ${r.txHash}. Review live holdings before another release.`,
                      );
                    },
                  );
                } catch (e) {
                  setError(
                    `${String(e)} Keep the release record; check balances, activity and platform support before retrying.`,
                  );
                }
              })();
            }}
          >
            Release before deadline
          </button>
          {releasePending && (
            <p>
              A release was requested. Automatic retries are disabled because
              this endpoint has no durable retry intent. Review the saved
              hash/outcome with support.
            </p>
          )}
        </section>
      )}
      {show("webhook") && available("webhook") && (
        <section>
          <h2>Webhook setup</h2>
          <p>
            Copy the authenticated owner's trigger URL and secret into server
            configuration. Verify the completed task in your application,
            persist a stable event key and payload, then call the server-only
            webhookReward helper. Retry exactly that record on PENDING or
            UNKNOWN. No public callback proxy is exposed.
          </p>
        </section>
      )}
    </>
  );
}

export const FundingPanel = (props: PanelProps) => (
  <DeploymentPanels {...props} only={["funding"]} />
);
export const SchedulePanel = (props: PanelProps) => (
  <DeploymentPanels {...props} only={["schedule"]} />
);
export const SubscriptionPanel = (props: PanelProps) => (
  <DeploymentPanels {...props} only={["subscription"]} />
);
export const BalancesPanel = (props: PanelProps) => (
  <DeploymentPanels {...props} only={["balances"]} />
);
export const SwapQuotePanel = (props: PanelProps) => (
  <DeploymentPanels {...props} only={["quote"]} />
);
export const EarlyReleasePanel = (props: PanelProps) => (
  <DeploymentPanels {...props} only={["release"]} />
);
export const WebhookSetupPanel = (props: PanelProps) => (
  <DeploymentPanels {...props} only={["webhook"]} />
);
