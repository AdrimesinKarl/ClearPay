export const TESTNET = "Test SDF Network ; September 2015";
export const AMOUNT = "10000000";
export type Prepared = {
  xdr: string;
  network: "testnet" | "mainnet";
  networkPassphrase: string;
  expiresAt: string;
  preparationRequestId?: string;
  txHash: string;
};
export type PublicConfig =
  | { ready: false; message: string }
  | { ready: true; scope: string; deploymentUrl: string };
export type Result = { txHash: string; status: string; network?: string };
export type Allocation = {
  feeId: string;
  group?: string;
  office: string;
  label: string;
  amountCentavos: number;
};
export type Fee = {
  id: string;
  group?: string;
  office: string;
  label: string;
  amountCentavos: number;
};
export type FeeWithStatus = Fee & { paid: boolean };
export type PaymentAppStatus =
  | "PREPARED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "REJECTED";
export type PublicPayment = {
  id: string;
  studentAddress: string;
  allocations: Allocation[];
  totalCentavos: number;
  totalDisplay: string;
  txHash: string;
  status: PaymentAppStatus;
  txStatus?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
};
