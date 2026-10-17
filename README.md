# Paiflow SDK payment example

A small, runnable Next.js example for integrating `@paiflow/sdk` into your own app. Connect Freighter, prepare a **1 testnet XLM** payment, sign it in the wallet, submit the original envelope, and check its transaction status. One explicitly configured Paiflow deployment supplies the payment rules.

The SDK runs in your Node server. The browser calls your application's routes and signs with Freighter; it never receives the Paiflow credential. Copy the integration into an existing app or use this minimal example as a starting point.

## Previous API starter

The HTTP-based starter is preserved on [`legacy/api-2026-10-17`](https://github.com/artisam-paiflow/paiflow-hackathon-starter/tree/legacy/api-2026-10-17), at commit `e20d164889e5c3230d1591dd377de769f07308ac`. That branch is the legacy reference for prepare/team/demo modes, activity polling and funding, Schedule, Subscription and payout panels. New integrations should use the SDK path on `main`. Existing clones retain their original configuration and supported backend API.

This repository remains an SDK example; the custom HTTP integration path is retired. Campus Snacks remains a separate HTTP-based sample and has not been migrated by this change.

## Run locally

Requires **Node `>=22.22.2 <23`** and **pnpm `10.4.1`**.

```sh
git clone https://github.com/artisam-paiflow/paiflow-hackathon-starter.git
cd paiflow-hackathon-starter
npm install --global pnpm@10.4.1
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. Without complete server configuration, payment actions remain disabled.

The dependency is pinned to **`@paiflow/sdk@0.2.0`**, published under npm's `beta` tag. Developer tokens require a backend implementing OpenAPI `1.1.0`, including the staging environment checked on October 17, 2026.

## Configure your deployment

1. In Paiflow, build and deploy an **On Receive (native XLM)** flow with your chosen recipients and rules. Wait for confirmation and review those rules. This app does not create or deploy flows.
2. In **Account → Developer**, create a **Read and operate** token and explicitly grant it access to that deployment. Copy its one-time `pfd_` secret. An existing deployment-bound `pfk_` token from **API access** also works.
3. Set these server-only values in `.env.local`, then restart:

```dotenv
PAIFLOW_BASE_URL=https://beta.app.paiflow.xyz
PAIFLOW_DEPLOYMENT_ID=<your confirmed deployment UUID>
PAIFLOW_API_TOKEN=<your pfd_ or pfk_ token>
```

Never use `NEXT_PUBLIC_` for these settings, commit `.env.local`, or put wallet secret keys into the app. The app uses the configured deployment, never the first discovery result. A developer token must explicitly include that deployment.

The old `PAIFLOW_MODE` and shared-demo path are no longer used. Complete credentials enable this example. Removing them disables new API actions but does not cancel an existing transaction. Retain recovery evidence when changing configuration.

## Try a payment

1. Install Freighter. Fund a dedicated testnet customer wallet with enough XLM for the payment and transaction fees. Use testnet recipients; mainnet and non-native-XLM deployments are refused.
2. Connect the wallet. Review your deployment and its recipients in Paiflow, then start the payment.
3. Review and sign in Freighter. The app uses the server-prepared network passphrase, checks the wallet's network and verifies the signed transaction body against the original preparation.
4. Check the original transaction's status. `SUCCESS` confirms that transaction. `PENDING`, `UNKNOWN`, missing history and transport errors remain unresolved.
5. Inspect recipient payouts in Paiflow or a testnet explorer. A transaction confirmation is not an application receipt or authorization to fulfil an order.

This is a fixed-amount payment demonstration, not a shop. It has no customer authentication, persistent order database or fulfilment system, and does not independently verify your intended recipients or split. Real applications need session/ownership checks, rate limits, trusted pricing, durable order-to-transaction binding and exact receipt verification.

## Recover an interrupted payment

The example saves the original preparation before signing and the exact signed envelope before submission. Recovery is scoped to the configured platform and deployment. Browser storage and Web Locks are required; a storage failure blocks the next financial step.

After a reload, check the original hash or retry the **same signed envelope** using the recovery controls. Keep original evidence after a timeout, rejected response, `UNKNOWN`, `NOT_FOUND` or expired preparation. None proves that a replacement is safe. Do not clear browser data to start over while an operation is unresolved. If no signature is available after expiry, ask the platform operator to establish the outcome.

Recovery is local to this browser and origin. Lost storage, a different machine or a lost preparation response may require operator assistance. Browser storage is teaching code, not durable cross-device payment storage. Never log or share signed envelopes or full recovery records.

Existing API-starter recovery records block a new SDK payment. Resolve them using the legacy version on the same browser origin before switching. An unresolved SDK record for another platform or deployment also blocks a new payment; restore its original server configuration to reconcile it. These checks retain the old evidence rather than silently deleting or converting it.

## Code map

| File                           | Responsibility                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| `lib/paiflow.ts`               | Server-only configuration and typed SDK payment calls          |
| `app/api/pay/route.ts`         | Allowlisted preparation, submission and reconciliation actions |
| `app/api/integration/route.ts` | Non-secret configuration state                                 |
| `lib/wallet.ts`                | Freighter connection and signing                               |
| `lib/recovery.ts`              | Original transaction evidence and validation                   |
| `lib/transaction.ts`           | Transaction hashing and unchanged-envelope checks              |
| `components/starter-app.tsx`   | Payment walkthrough and recovery controls                      |

The SDK supplies transport, typed responses and API metadata. Your app supplies wallet consent, storage, authorization, reconciliation decisions and business rules.

## Checks and evidence

```sh
pnpm typecheck
pnpm test
pnpm build
node scripts/check-browser-bundle.mjs
```

Tests use fixtures and mocked upstream responses. They do not establish live wallet consent or payout readiness. Complete a small authorized testnet rehearsal against your deployment before demonstrating it. No fresh signed payment was made for this migration.

Follow your event's primer for permissions, deadlines and submissions. The existing `llms.md` describes the preserved API starter and awaits a separate documentation review; use this README and current source for the SDK example.
