// Derived from hosted OpenAPI, verified 2026-10-12. No runtime configuration.
export type DeploymentCapabilities = {
  deploymentId: string;
  network: "testnet" | "mainnet";
  configurationSource: "deployment_snapshot";
  triggerType:
    | "deposit"
    | "webhook"
    | "subscription"
    | "payroll"
    | "schedule"
    | "oracle"
    | "unknown";
  inputAsset:
    | null
    | { kind: "native" }
    | { kind: "known"; symbol: "USDC" }
    | { kind: "custom"; code: string; issuer: string };
  operations: {
    execute: CapabilityOperation;
    funding: CapabilityOperation;
    balances: CapabilityOperation;
    events: CapabilityOperation;
    transactions: CapabilityOperation;
    releaseEarly: CapabilityOperation;
    payouts: CapabilityOperation;
    webhook: CapabilityOperation;
    subscriptionCancel: CapabilityOperation;
    subscriptionReactivate: CapabilityOperation;
    swapQuote: CapabilityOperation;
    scheduleState: CapabilityOperation;
    scheduleControls: CapabilityOperation;
    subscriptionState: CapabilityOperation;
    subscriptionAllowance: CapabilityOperation;
  };
};
export type CapabilityOperation = {
  status: "supported" | "conditional" | "unsupported";
  authentication: "deployment_token" | "webhook_secret" | "subscriber_wallet";
  requirements: Array<string>;
  nodeIds: Array<string>;
};
export type FundingDiscovery = {
  deploymentId: string;
  network: "testnet" | "mainnet";
  nodes: Array<{
    nodeId: string;
    templateKind: "STREAMER" | "WEBHOOK";
    contractAddress: string;
    action: "schedule.fund" | "webhook.fund";
    tokenContractAddress: string;
    authorization: "funding_wallet";
    effect: string;
  }>;
};
export type FundingPrepare = {
  nodeId?: string;
  fromAddress: string;
  tokenContractAddress: string;
  amountStroops: string;
};
export type FundingPrepared = {
  intent: string;
  txHash: string;
  expiresAt: string;
  xdr: string;
  action: "schedule.fund" | "webhook.fund";
  nodeId: string;
  fromAddress: string;
  tokenContractAddress: string;
  amountStroops: string;
  network: "testnet" | "mainnet";
  networkPassphrase: string;
};
export type FundingSubmit = {
  action: "schedule.fund" | "webhook.fund";
  intent: string;
  signedXdr: string;
};
export type FundingReconcile = {
  action: "schedule.fund" | "webhook.fund";
  intent: string;
};
export type FundingReconciled = {
  intent: string;
  action: "schedule.fund" | "webhook.fund";
  txHash: string;
  network: "testnet" | "mainnet";
  state: "PREPARED" | "SUBMITTING" | "SUCCESS" | "FAILED" | "EXPIRED";
  expiresAt: string;
};
export type ScheduleState = {
  deploymentId: string;
  network: "testnet" | "mainnet";
  nodeId: string;
  contractAddress: string;
  controller: string;
  controlEligibility: {
    walletProtocolSupported: boolean;
    pause: boolean;
    resume: boolean;
    retrieve: boolean;
  };
  tokenContractAddress: string;
  paused: boolean;
  pauseAllowed: boolean;
  retrieveAllowed: boolean;
  balanceStroops: string;
  availableStroops: string;
  claimedStroops: string;
  unvestedStroops: string;
  retrievableStroops: string;
  retrievalRecipient: string;
  readAt: string;
};
export type SchedulePrepared = {
  intent: string;
  txHash: string;
  expiresAt: string;
  unsignedXdr: string;
  network: "testnet" | "mainnet";
  action: "pause" | "resume" | "retrieve";
  nodeId: string;
  contractAddress: string;
  walletAddress: string;
  recipient?: string;
  estimatedAmountStroops?: string;
  tokenContractAddress?: string;
};
export type ScheduleReconciled = {
  intent: string;
  txHash: string;
  network: "testnet" | "mainnet";
  action: "pause" | "resume" | "retrieve";
  state: "PREPARED" | "SUBMITTING" | "SUCCESS" | "FAILED" | "EXPIRED";
  replacementAllowed: boolean;
};
export type SubscriptionState = {
  deploymentId: string;
  flowName: string;
  network: "testnet" | "mainnet";
  templateKind: "SUBSCRIPTION" | "SUBSCRIPTION_DEV";
  contractAddress: string;
  tokenContractAddress: string;
  subscriber: string | null;
  isCancelled: boolean;
  setupRequired: boolean;
  allowance: string;
  assetLabel: string;
  asset:
    | { kind: "native" }
    | { kind: "known"; symbol: "USDC" }
    | { kind: "custom"; code: string; issuer: string }
    | null;
};
export type SubscriptionControlPrepared = {
  intent: string;
  txHash: string;
  expiresAt: string;
  xdr: string;
  network: "testnet" | "mainnet";
  networkPassphrase: string;
  action: "subscription.cancel" | "subscription.reactivate";
  walletAddress: string;
  nodeId: string;
  contractAddress: string;
  tokenContractAddress: string;
};
export type SubscriptionControlReconciled = {
  intent: string;
  txHash: string;
  action: "subscription.cancel" | "subscription.reactivate";
  state: "PREPARED" | "SUBMITTING" | "SUCCESS" | "FAILED" | "EXPIRED";
  ledger: number | null;
  replacementAllowed: boolean;
};
export type TransactionStatus = {
  txHash: string;
  network: "testnet" | "mainnet";
  status: "SUCCESS" | "FAILED" | "PENDING" | "UNKNOWN" | "REJECTED";
  ledger?: number;
  error?: { code: string; message: string };
};
export type DeploymentBalances = {
  deploymentId: string;
  network: "testnet" | "mainnet";
  totals: Array<{ tokenContract: string; balanceStroops: string }>;
  nodes: Array<{
    nodeId: string;
    templateKind: string;
    contractAddress: string;
    tokenContract: string | null;
    balanceStroops: string | null;
    readAt: string | null;
    stale: boolean;
    error?: string;
  }>;
  freshness: {
    status: "fresh" | "partial" | "stale";
    totalsComplete: boolean;
    attemptedAt: string;
    cached: boolean;
  };
};
export type SwapQuote = {
  deploymentId: string;
  network: "testnet" | "mainnet";
  nodeId: string;
  contractAddress: string;
  assetInContractAddress: string;
  assetOutContractAddress: string;
  routerAddress: string;
  pairAddress: string;
  amountInStroops: string;
  amountOutStroops: string;
  amountOutMinStroops: string;
  slippageBps: number;
  readStartedAt: string;
  quotedAt: string;
  freshness: "live";
  estimate: true;
  scope: "selected_node";
  meetsMinimumAtQuote: boolean;
};
