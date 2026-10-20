# ClearPay

ClearPay is a campus payment MVP built on the Paiflow SDK payment example. A student selects the fees they owe — ₱500 to the **Faculty Secretary**, ₱60 to the **Registrar** — reviews the combined ₱560 allocation, and settles everything with **one** wallet-signed payment through the configured Paiflow testnet deployment. The app verifies the original transaction with Paiflow before issuing a digital receipt, and authorized staff can review the ledger of payments and allocations.

The on-chain leg is the deployment's fixed **1 testnet XLM** settlement; peso amounts are campus ledger allocations recorded against the verified transaction reference. This is a testnet demonstration — no real money moves.

## How the flow works

1. **Fees** — the server-owned fee catalog is shown with each fee's payment status for the connected student wallet. Paid fees cannot be re-selected.
2. **Checkout** — the student selects unpaid fees and sees the server-computed allocations and combined total (₱560 for both fees).
3. **Prepare** — the server validates the selection, computes allocations, prepares the fixed 1 XLM payment with the Paiflow SDK, and persists a `PREPARED` ledger record before the browser ever signs.
4. **Sign** — Freighter signs the original prepared envelope in the browser using the server-prepared testnet passphrase. The app verifies the signed body matches the original.
5. **Submit** — the server re-verifies the exact envelope against the stored preparation, submits it, and records the transaction hash.
6. **Verify** — the app checks the original transaction with Paiflow. Only `SUCCESS` marks the payment `CONFIRMED` and updates fee statuses; `PENDING`, `UNKNOWN`, expiry and transport errors never do.
7. **Receipt** — a digital receipt shows the transaction reference, verified status, total, and per-office fee breakdown.
8. **Staff** — staff signed in with the server-configured access code review all payment records, allocations, and verification status at `/staff`.

The browser never supplies totals, allocations, or recipients: the server recomputes everything from its fee catalog, and payment confirmation comes from Paiflow's record of the original transaction — never from a redirect or unverified response.

## Run locally

Requires **Node `>=22.22.2 <23`** and **pnpm `10.4.1`**.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. Without complete Paiflow server configuration, payment actions remain disabled and the limitation is shown in the app.

## Configure

1. In Paiflow, build and deploy an **On Receive (native XLM)** flow with your chosen recipients and rules. Wait for confirmation and review those rules. This app does not create or deploy flows.
2. In **Account → Developer**, create a **Read and operate** token and explicitly grant it access to that deployment. Copy its one-time `pfd_` secret. An existing deployment-bound `pfk_` token from **API access** also works.
3. Set these server-only values in `.env.local`, then restart:

```dotenv
PAIFLOW_BASE_URL=https://beta.app.paiflow.xyz
PAIFLOW_DEPLOYMENT_ID=<your confirmed deployment UUID>
PAIFLOW_API_TOKEN=<your pfd_ or pfk_ token>
STAFF_ACCESS_CODE=<shared code for the /staff ledger>
```

Never use `NEXT_PUBLIC_` for these settings, commit `.env.local`, or put wallet secret keys into the app. The app uses the configured deployment, never the first discovery result.

The campus ledger persists to `CLEARPAY_STORE_PATH` (default `.clearpay/store.json`, gitignored). Set `STAFF_ACCESS_CODE` to enable the staff ledger; without it, staff sign-in reports that access is not configured.

## Try a payment

1. Install Freighter. Fund a dedicated testnet student wallet with enough XLM for the payment and transaction fees.
2. Connect the wallet, select both fees, and review the ₱560 allocation.
3. Sign the prepared transaction in Freighter and submit the saved envelope.
4. Watch the app verify the original transaction. `SUCCESS` issues the receipt and marks the fees paid; anything unresolved stays unconfirmed with its evidence retained.
5. Staff can open `/staff`, sign in with the access code, and review the record, allocations, and verified status.

## Recovery semantics

ClearPay keeps the starter's recovery guarantees. The original preparation is persisted before signing and the exact signed envelope before submission, in browser storage guarded by Web Locks; a storage failure blocks the next financial step. After submission, `PENDING`, `UNKNOWN`, `NOT_FOUND`, expiry and lost responses never authorize a replacement — the app only re-reads the original transaction, and manual retry sends only the same signed envelope. Server-side, the ledger record retains the original hash and preparation correlation metadata alongside the browser evidence.

## Code map

| File                             | Responsibility                                                  |
| -------------------------------- | --------------------------------------------------------------- |
| `lib/paiflow.ts`                 | Server-only SDK configuration and typed payment calls           |
| `lib/fees.ts`                    | Campus fee catalog, server-side selection validation, formatting |
| `lib/payments.ts`                | Prepare/submit/verify orchestration and ledger record mapping   |
| `lib/store.ts`                   | File-backed campus payment ledger and staff sessions            |
| `lib/staff.ts`                   | Staff access-code verification and session cookies              |
| `app/api/fees/route.ts`          | Fee catalog and per-student paid status                         |
| `app/api/payments/route.ts`      | Allowlisted prepare, submit and verification actions            |
| `app/api/staff/route.ts`         | Staff sign-in and ledger reads                                  |
| `app/api/receipts/[id]/route.ts` | Digital receipt lookup                                          |
| `components/clearpay-app.tsx`    | Student fees → checkout → verified receipt walkthrough          |
| `components/staff-app.tsx`       | Staff sign-in and payment ledger                                |
| `lib/wallet.ts`                  | Freighter connection and signing                                |
| `lib/recovery.ts`                | Original transaction evidence and validation                    |
| `lib/transaction.ts`             | Transaction hashing and unchanged-envelope checks               |

## Checks and evidence

```sh
pnpm typecheck
pnpm test
pnpm build
node scripts/check-browser-bundle.mjs
```

Tests use fixtures and mocked upstream responses. They do not establish live wallet consent or payout readiness. Complete a small authorized testnet rehearsal against your deployment before demonstrating it.
