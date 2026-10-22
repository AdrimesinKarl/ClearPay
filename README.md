ClearPay

ClearPay is a campus fee payment demo that uses Paiflow payment splitting to route one wallet-signed testnet payment across campus recipients. Students choose the fees they owe, review the allocation, and pay in one transaction. Once Paiflow verifies the transaction, ClearPay issues a digital receipt and updates the fee statuses. Authorized staff can review payments and allocations in the ledger.

The fee are examples to demonstrate the flow. ClearPay records peso allocations in its campus ledger against the verified transaction. The on-chain settlement is the configured Paiflow deployment’s fixed 1 testnet XLM payment. No real money moves.

## Run locally

Requires Node `>=22.22.2 <23` and pnpm `10.4.1`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Payment actions remain disabled until Paiflow is configured.

## Configure Paiflow

1. Deploy an **On Receive (native XLM)** flow in Paiflow with the intended recipients and rules. Review the confirmed deployment. ClearPay does not create or deploy flows.
2. Create a **Read and operate** token in **Account → Developer** and grant it access to the deployment. An existing deployment-bound `pfk_` token also works.
3. Add the following server-only settings to `.env.local`, then restart the app:

```dotenv
PAIFLOW_BASE_URL=https://beta.app.paiflow.xyz
PAIFLOW_DEPLOYMENT_ID=<confirmed deployment UUID>
PAIFLOW_API_TOKEN=<pfd_ or pfk_ token>
STAFF_ACCESS_CODE=<shared code for /staff>
```

Keep these settings private. Do not use `NEXT_PUBLIC_` for them, commit `.env.local`, or add wallet secret keys to the app. ClearPay uses only the configured deployment.

The campus ledger is stored at `CLEARPAY_STORE_PATH`, which defaults to `.clearpay/store.json`. Set `STAFF_ACCESS_CODE` to enable staff access.

## Try a payment

1. Install Freighter and fund a dedicated testnet wallet with enough XLM for the transaction and network fees.
2. Connect the wallet, select fees, and review the example allocations.
3. Sign the prepared transaction in Freighter.
4. Wait for Paiflow verification. Only a `SUCCESS` result confirms the payment and issues a receipt.
5. Staff can sign in at `/staff` with the configured access code to review the ledger.

ClearPay saves the original payment preparation before signing and the signed envelope before submission. If submission or verification is unresolved, it checks the original transaction and does not prepare a replacement. A manual retry resubmits only the same signed envelope, preserving the original transaction evidence in the ledger.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
node scripts/check-browser-bundle.mjs
```

Tests use fixtures and mocked upstream responses. Rehearse a small authorized payment on the configured testnet deployment before demonstrating the app.
