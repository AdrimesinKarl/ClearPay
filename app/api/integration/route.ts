import * as api from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import {
  applicationAuthorized,
  requireApplicationAuthorization,
} from "@/lib/app-authorization";

const privileged = new Set([
  "schedule.pause",
  "schedule.resume",
  "schedule.retrieve",
  "releaseEarly",
]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function payload(value: unknown, keys: string[], required: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("Expected an input object.");
  const b = value as Record<string, unknown>;
  if (
    Object.keys(b).some((k) => !keys.includes(k)) ||
    required.some((k) => !(k in b))
  )
    throw new InputError("Invalid input fields.");
  for (const [k, v] of Object.entries(b)) {
    if (
      typeof v !== "string" ||
      !v ||
      v.length >
        (k === "xdr"
          ? 200000
          : k === "signedXdr"
            ? 100000
            : k === "intent"
              ? 20000
              : 128)
    )
      throw new InputError(`Invalid ${k}.`);
    if (
      ["fromAddress", "walletAddress", "userAddress"].includes(k) &&
      !/^G[A-Z2-7]{55}$/.test(v)
    )
      throw new InputError("Supply a public G-address.");
    if (k === "tokenContractAddress" && !/^C[A-Z2-7]{55}$/.test(v))
      throw new InputError("Supply the live token C-address.");
    if (
      ["amount", "amountStroops"].includes(k) &&
      (!/^[1-9]\d{0,38}$/.test(v) || BigInt(v) > (1n << 127n) - 1n)
    )
      throw new InputError("Supply positive i128 stroops.");
    if (k === "action" && v !== "schedule.fund" && v !== "webhook.fund")
      throw new InputError("Unsupported funding action.");
  }
  return b as Record<string, string>;
}
export async function GET(request: Request) {
  return handle(async () => {
    api.requireIntegration();
    const q = new URL(request.url).searchParams;
    if (
      [...q.keys()].some(
        (k) => !["read", "nodeId", "amount", "txHash", "intent"].includes(k),
      )
    )
      throw new InputError("Unknown query.");
    const nodeId = q.get("nodeId") ?? undefined;
    if (nodeId !== undefined && (!nodeId || nodeId.length > 128))
      throw new InputError("Invalid nodeId.");
    switch (q.get("read")) {
      case "capabilities": {
        const c = await api.capabilities();
        if (c.network !== "testnet")
          throw new InputError("Only Testnet deployments are allowed.");
        if (
          !c.operations ||
          typeof c.deploymentId !== "string" ||
          typeof c.triggerType !== "string"
        )
          throw new InputError(
            "Malformed capabilities; confirm hosted API support.",
          );
        const operations = Object.fromEntries(
          [
            "execute",
            "events",
            "balances",
            "funding",
            "transactions",
            "releaseEarly",
            "payouts",
            "webhook",
            "subscriptionAllowance",
            "subscriptionState",
            "scheduleState",
            "scheduleControls",
            "subscriptionCancel",
            "subscriptionReactivate",
            "swapQuote",
          ].map((key) => {
            const op = c.operations[key as keyof typeof c.operations];
            return [
              key,
              {
                authentication: [
                  "deployment_token",
                  "webhook_secret",
                  "subscriber_wallet",
                ].includes(op?.authentication)
                  ? op.authentication
                  : "deployment_token",
                status:
                  op && ["supported", "conditional"].includes(op.status)
                    ? op.status
                    : "unsupported",
                nodeIds: Array.isArray(op?.nodeIds)
                  ? op.nodeIds.filter((n) => typeof n === "string")
                  : [],
                requirements: Array.isArray(op?.requirements)
                  ? op.requirements.filter((n) => typeof n === "string")
                  : [],
              },
            ];
          }),
        );
        const asset = c.inputAsset;
        const inputAsset =
          asset?.kind === "native"
            ? { kind: "native" }
            : asset?.kind === "known" && asset.symbol === "USDC"
              ? { kind: "known", symbol: "USDC" }
              : asset?.kind === "custom" &&
                  /^[A-Za-z0-9]{1,12}$/.test(asset.code) &&
                  /^G[A-Z2-7]{55}$/.test(asset.issuer)
                ? { kind: "custom", code: asset.code, issuer: asset.issuer }
                : null;
        return {
          platformOrigin: api.integrationOrigin(),
          deploymentId: c.deploymentId,
          network: c.network,
          triggerType: c.triggerType,
          configurationSource: c.configurationSource,
          inputAsset,
          operations,
          applicationAuthorization: {
            schedule: {
              pause: await applicationAuthorized(request, "schedule.pause"),
              resume: await applicationAuthorized(request, "schedule.resume"),
              retrieve: await applicationAuthorized(
                request,
                "schedule.retrieve",
              ),
            },
            releaseEarly: await applicationAuthorized(request, "releaseEarly"),
          },
        };
      }
      case "balances":
        return api.balances();
      case "funding":
        return api.fundingDiscovery();
      case "schedule":
        return api.scheduleState(nodeId);
      case "subscription":
        return api.subscriptionState();
      case "quote": {
        const b = payload(
          { amount: q.get("amount"), ...(nodeId ? { nodeId } : {}) },
          ["amount", "nodeId"],
          ["amount"],
        );
        return api.swapQuote({ amount: b.amount!, nodeId });
      }
      case "transaction": {
        const hash = q.get("txHash");
        if (!hash || !/^[a-f0-9]{64}$/.test(hash))
          throw new InputError("Invalid txHash.");
        return api.transactionStatus(hash);
      }
      case "allowance": {
        const intent = q.get("intent");
        if (!intent || intent.length > 20000)
          throw new InputError("Invalid allowance intent.");
        return api.allowanceStatus(intent);
      }
      default:
        throw new InputError("Unsupported read.");
    }
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    api.requireIntegration();
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new api.PaiflowError(
        403,
        { code: "FORBIDDEN", message: "Use this application's origin." },
        null,
        null,
      );
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new InputError("Expected JSON.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new InputError("Expected object.");
    const outer = raw as Record<string, unknown>;
    if (
      Object.keys(outer).some(
        (k) => !["operation", "phase", "input"].includes(k),
      ) ||
      typeof outer.operation !== "string" ||
      !["prepare", "submit", "reconcile"].includes(String(outer.phase))
    )
      throw new InputError("Invalid operation.");
    const op = outer.operation;
    const phase = outer.phase;
    const supported = [
      "execute",
      "funding",
      "allowance",
      "subscription.cancel",
      "subscription.reactivate",
      "schedule.pause",
      "schedule.resume",
      "schedule.retrieve",
      "releaseEarly",
    ];
    if (!supported.includes(op)) throw new InputError("Unsupported operation.");
    if ((await api.capabilities()).network !== "testnet")
      throw new InputError("Only Testnet deployments are allowed.");
    if (privileged.has(op))
      await requireApplicationAuthorization(
        request,
        op as
          | "schedule.pause"
          | "schedule.resume"
          | "schedule.retrieve"
          | "releaseEarly",
      );
    if (op === "execute") {
      if (phase === "submit")
        throw new InputError("Execute submission uses the payment route.");
      const b = payload(outer.input, ["xdr"], ["xdr"]);
      return phase === "prepare"
        ? { txHash: api.executeHash(b.xdr!) }
        : api.reconcileExecute(b.xdr!);
    }
    if (phase !== "prepare") {
      const keys = op === "funding" ? ["intent", "action"] : ["intent"];
      const b = payload(
        outer.input,
        [...keys, ...(phase === "submit" ? ["signedXdr"] : [])],
        [...keys, ...(phase === "submit" ? ["signedXdr"] : [])],
      );
      if (op !== "allowance" && !uuid.test(b.intent!))
        throw new InputError("Invalid intent UUID.");
      const intent = { intent: b.intent! };
      const signed = { ...intent, signedXdr: b.signedXdr! };
      if (op === "funding") {
        const action = b.action! as "schedule.fund" | "webhook.fund";
        return phase === "submit"
          ? api.submitFunding({ ...signed, action })
          : api.reconcileFunding({ ...intent, action });
      }
      if (op === "allowance")
        return phase === "submit"
          ? api.submitAllowance(signed)
          : api.allowanceStatus(b.intent!);
      if (op.startsWith("schedule.")) {
        const action = op.split(".")[1] as api.ScheduleAction;
        return phase === "submit"
          ? api.submitSchedule(action, signed)
          : api.reconcileSchedule(action, intent);
      }
      if (op.startsWith("subscription.")) {
        const action = op.split(".")[1] as api.SubscriptionAction;
        return phase === "submit"
          ? api.submitSubscription(action, signed)
          : api.reconcileSubscription(action, intent);
      }
      throw new InputError(
        "Early release has no wallet-intent retry protocol.",
      );
    }
    if (op === "funding") {
      const b = payload(
        outer.input,
        ["fromAddress", "tokenContractAddress", "amountStroops", "nodeId"],
        ["fromAddress", "tokenContractAddress", "amountStroops"],
      );
      return api.prepareFunding({
        fromAddress: b.fromAddress!,
        tokenContractAddress: b.tokenContractAddress!,
        amountStroops: b.amountStroops!,
        nodeId: b.nodeId,
      });
    }
    if (op === "allowance") {
      const b = payload(
        outer.input,
        ["userAddress", "amount"],
        ["userAddress", "amount"],
      );
      return api.prepareAllowance({
        userAddress: b.userAddress!,
        amount: b.amount!,
      });
    }
    if (op === "releaseEarly") {
      const b = payload(outer.input, ["nodeId"], []);
      return api.releaseEarly({ nodeId: b.nodeId });
    }
    const b = payload(
      outer.input,
      op.startsWith("schedule.")
        ? ["walletAddress", "nodeId"]
        : ["walletAddress"],
      ["walletAddress"],
    );
    if (op.startsWith("schedule.")) {
      const p = await api.prepareSchedule(
        op.split(".")[1] as api.ScheduleAction,
        { walletAddress: b.walletAddress!, nodeId: b.nodeId },
      );
      if (p.network !== "testnet")
        throw new InputError("Only Testnet preparations are allowed.");
      // Published Schedule API supplies network and unsignedXdr, without a passphrase.
      return {
        ...p,
        xdr: p.unsignedXdr,
        networkPassphrase: "Test SDF Network ; September 2015",
      };
    }
    return api.prepareSubscription(op.split(".")[1] as api.SubscriptionAction, {
      walletAddress: b.walletAddress!,
    });
  });
}
