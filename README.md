# Paiflow hackathon starter

Paiflow is the money logic behind your app. This repo is the plumbing: replace the screens in `components/starter-app.tsx` with your idea and keep the server page wrapper in `app/page.tsx` and the guarded server-only client in `lib/paiflow.ts`. One deployment serves one business or group. Testnet only.

## Choose the right resource

| Resource                                                                                                                      | Use it for                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Paiflow Guide](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/hackathon/paiflow-guide.md)                      | Wallet setup, building and deploying a flow, and configuring the ready-wired starter.                                    |
| [API quickstart](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/hackathon/developer-api-quickstart.md)          | A separate frontend/backend integration for apps built without the starter. Do not copy its routes into this repository. |
| [Full API reference](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/api/README.md)                              | Endpoint schemas, errors, limits, pagination and advanced workflows.                                                     |
| [OpenAPI JSON](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/api/openapi.json)                                 | Machine-readable endpoint schemas.                                                                                       |
| [Postman collection](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/api/paiflow-api-v1.postman_collection.json) | Runnable API requests for your deployment.                                                                               |
| [Configuration template](.env.example)                                                                                        | Server-only mode, platform origin, deployment UUID and token settings.                                                   |
| [Agent instructions](AGENTS.md)                                                                                               | Coding boundaries, event scope and verification commands.                                                                |
| [Package manifest](package.json)                                                                                              | Node.js range, package manager, dependencies and scripts.                                                                |
| [Server client](lib/paiflow.ts)                                                                                               | Current implementation of mode guards and Paiflow API calls.                                                             |
| [AI developer context](llms.md)                                                                                               | Product constraints, API details and worked examples for your AI assistant.                                              |

Guide links above open GitHub Markdown for developers and AI assistants. PDF copies are also available: [Paiflow Guide](https://drive.google.com/file/d/1abY-gT2TERr_av3eRPHjc9e8vTfkDnuY/view?usp=sharing) and [API quickstart](https://drive.google.com/file/d/1mTFaoICZwW2Ha3OttgJkp2q50o2H5siJ/view?usp=sharing).

The human guides and their PDFs live directly in `docs/hackathon/` in the Paiflow repository. They are event-neutral; follow your participant brief for event rules.

## Technical guide and event instructions

Use [llms.md](llms.md) as the shared Paiflow developer context guide for any event. Give it to your AI assistant alongside your event's primer or mechanics document. The guide covers product behavior, APIs, starter modes and worked examples; it does not set event dates or rules.

Follow your event's primer and organiser instructions for onboarding, credentials, support, qualification, submissions and judging. Ask the organisers if information is missing. The separate [Web3 Iloilo context pack](llms-web3-iloilo.md) contains instructions for that event only; do not apply them to other events.

## Hackathon feature availability

**Dev mode will stay disabled for the duration of the hackathon.** Configure recipients, percentages and required values before deployment. Use the ordinary Pay form with your team's standard flow. Per-payment recipients, **Fill value via API** and **Dev values** are unavailable during the event.

Use the standard payment form and configured recipients. `PAIFLOW_MODE=team` and `pnpm dev` do not enable flow Dev mode.

## Prepare and integrate before the event

You may build your app, deploy flows, integrate with Paiflow and test payments before the hackathon. Ask organisers for your team credentials in advance. Use `PAIFLOW_MODE=team` as soon as your confirmed deployment and API token are ready; `prepare` is the default mode for working without a connection. Follow your event brief for submission and qualification requirements.

1. Install **Node 22** and **pnpm 10** (if pnpm is already installed, skip `corepack enable`), then run `pnpm install` and `pnpm dev`. Open http://localhost:3000. With no configuration, the starter defaults to preparation mode.
2. Prepare dedicated testnet wallets for your customer and payout recipients. Install [Freighter](https://www.freighter.app/) and select **Testnet**. Fund new accounts with testnet XLM via [Friendbot](https://laboratory.stellar.org/#account-creator?network=test). If using USDC, add the exact trustline described below and obtain testnet USDC separately.
3. Build your screens and features in `components/starter-app.tsx`. Stay in preparation mode while working without a Paiflow connection, or switch to team mode to integrate and test now.

The server-only `PAIFLOW_MODE` setting controls integration:

| Mode                           | Behaviour                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `prepare` (default when unset) | App screens work; wallet actions, payments and event polling are disabled. No Paiflow API calls or demo-token creation. |
| `demo`                         | Explicitly enables the shared XLM demo where available; usable before the event.                                        |
| `team`                         | Uses your team's deployment and API token. Missing or invalid configuration disables integration with a clear error.    |

To set preparation mode explicitly, copy `.env.example` to `.env.local` and keep `PAIFLOW_MODE=prepare`. Existing tokens do not enable payments while preparation mode is selected. An empty token does not select demo mode. Invalid mode values disable integration. Restart the server after changing configuration.

Keep the mode checks in both the client screens and server-only module when extending the starter. Direct calls to `/api/pay`, `/api/payout` and `/api/events` return HTTP 403 `PREPARATION_MODE` during preparation. A pending payment submitted before changing modes may still execute on-chain; changing mode does not cancel it. Confirm its status before switching.

## Connect your deployment

1. Obtain your team's Paiflow account credentials; request them before the event. Check that the customer and recipient wallets have testnet XLM, the exact USDC trustline if needed, and the required payment balances.
2. Deploy your team's flow and wait for **CONFIRMED**. Create its API token under **API access**.
3. Copy `.env.example` to `.env.local`. Set server-only `PAIFLOW_MODE=team`, `PAIFLOW_BASE_URL` to the supplied platform origin, `PAIFLOW_API_TOKEN` to your deployment's token and `PAIFLOW_DEPLOYMENT_ID` to its confirmed deployment UUID. Configure all required flow values before deployment; Dev mode stays disabled throughout the hackathon.
4. Run `pnpm dev` and open http://localhost:3000. Restart the server after changing configuration. Amounts use your flow's input asset.
5. Connect the customer wallet in Freighter and make a small test payment. Confirm **SUCCESS**, check the recipients' payout and save its transaction hash. To simulate another customer, switch accounts in Freighter and click **Refresh wallet** (window focus also refreshes).

### Optional shared demo during integration

Set server-only `PAIFLOW_MODE=demo` and `PAIFLOW_BASE_URL` to the supplied platform origin, then restart. The starter then uses a shared **XLM** demo. Use a throwaway Friendbot-funded testnet wallet for a small payment, then switch to your team's deployment and token. Shared-demo payments belong to the shared deployment; follow your event's qualification rules.

Use demo mode for initial payment testing when your event permits it; switch to your team's token for your project. Its token is cached in server memory until two minutes before its one-hour expiry (concurrent requests share one mint). Restarting or running multiple server instances consumes more tokens. Demo minting allows only **3 tokens/hour per IP**, including shared venue Wi-Fi.

**Public demo warning:** the deployment is shared, others can see your depositing address, and deposited testnet XLM goes to a Paiflow-owned account, not back to you. Use a throwaway Friendbot wallet.

Prepare dedicated testnet wallets before integration where permitted. Ask your organisers whether wallet support or fallback wallets are available. Organiser-provided fallback wallets are testnet-only; organisers hold copies of their keys. Never send real (mainnet) funds to them or import them into a wallet you use for real money. Anyone with the key can take what's in them.

**USDC trustlines:** a fresh Stellar wallet usually cannot hold USDC until it adds a trustline to that exact asset code and issuer. A missing recipient trustline can show `TrustlineMissingError` / `The payout recipient has no trustline for {asset}. The recipient must add a trustline for {asset} before this flow can pay them.` in simulation, surfaced as 422 `VALIDATION`; the whole payment reverts. A deploy warning does not block deployment or require acknowledgement, so successful deployment does not prove recipients are ready. In the recipient's testnet wallet, use Add asset / Add trustline for code `USDC`, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, and have that wallet sign its change-trust transaction. Fund a new account with testnet XLM via Friendbot first so it exists and has reserves/fees. A trustline to another issuer's USDC will not work; native XLM needs no trustline. Check the exact trustline and required balances in every wallet, including any organiser-provided fallback wallet. Adding a trustline enables receipt, not a USDC balance: obtain testnet USDC separately, then prepare the failed payment again. Payouts checks recipient readiness before changing it; an inconclusive check also refuses mutation.

**Testnet USDC funding:** after funding the wallet with XLM and adding the exact USDC trustline, open [Circle's testnet faucet](https://faucet.circle.com/), select **USDC** and **Stellar Testnet**, and enter the customer's public wallet address (`G…`). Confirm the USDC balance before testing payments. Repeat for any wallet that will fund a flow, and choose test amounts that fit the available balance. Friendbot supplies XLM, not USDC.

## Extending the app

- Read the [shared developer context guide](llms.md) and the [staging OpenAPI spec](https://beta.app.paiflow.xyz/api/v1/openapi.json). Idea examples are in section 8 of the guide.
- All Paiflow calls live in `lib/paiflow.ts`; no token is sent to the browser. `lib/amount.ts` converts decimal strings to integer stroop strings with bigint (7 decimals). Freighter signs; the app never holds customer keys.
- Execute preparations last **180 seconds**. SUCCESS is final, FAILED can be HTTP 200, and PENDING or transport/502 errors need **Check again** with the same signed envelope. Recovery survives reload in this browser; do not prepare a duplicate payment or clear stored evidence. API errors retain code/message, request id and Retry-After when supplied.
- In demo/team modes, the feed polls every five seconds while visible, drains cursor pages and deduplicates by eventId. It can lag; lack of an event alone does not mean payment failed.
- `releaseEarly` is available in the server client for your authorised server handler. It authorises a relayer release without customer signing, so you must add your app's own authorisation. The supplied control and allowlisted adapter require the deny-by-default application authorizer; uncertain relayer releases are retained for operator review.

## Checks

`pnpm typecheck`, `pnpm test`, `pnpm build`. Dependencies are Next.js/React, Freighter, server-only and the official Stellar SDK. The SDK stays server-only and decodes/hashes the original transaction using its supported parser; it avoids handwritten XDR parsing and enables recovery of legacy records without a hash. TypeScript/types, Vitest and React test renderer are development dependencies; the renderer mounts hook effects for storage/reload and visibility/backoff regression tests without adding a browser DOM library. No database, UI library or state library. Run `pnpm audit` and scan `.next/static` for `pfk_`, `PAIFLOW_API_TOKEN` and your test token before publishing.

## Deployment controls and recovery

Checkout remains the default example. With `PAIFLOW_MODE=team`, configure your confirmed testnet deployment and token, then connect Freighter. The starter reads capabilities on the server, selects the matching reusable panels, and uses current state and preparation simulation to establish eligibility. Select an explicit node when there are multiple candidates. Discovery is support information, not a balance, deadline or consent guarantee.

- On Receive: prepare, sign with the prepared passphrase, submit, and recover the same signed checkout envelope. Swap estimates use the selected node's live quote, not a whole-flow guarantee.
- Schedule: select the stream, refresh live state, fund its live token, and use eligible pause/resume/retrieve controls with its controller wallet. Retrieval requires the deployed policy and current eligibility.
- Subscription: refresh the configured subscriber and allowance; only that original subscriber wallet can approve additional allowance, cancel or reactivate. Reactivation grants no allowance and does not immediately charge. One deployment has one configured subscriber.
- Webhook: fund the live pool, then invoke the server helper after your app verifies a completed task. Funding alone never triggers rewards.
- Time conditions: inspect held balances/freshness and early-release candidates. The platform checks live deadline/branch eligibility. Early release uses a relayer endpoint without a durable retry intent; this example records unresolved release attempts and disables automatic replacement/retry.

`components/deployment-panels.tsx` exports individual Funding, Schedule, Subscription, Balances, Swap quote, Early release and Webhook setup panels with shared wallet-workflow props. These panels, `lib/hooks/use-wallet-operation.ts`, and `lib/hooks/use-activity.ts` are extension points, not a required dashboard. State reads are explicit; refresh after confirmation. All displayed monetary state uses stroop strings; form conversion uses bigint. A SUCCESS transaction is confirmation; HTTP 200, a quote, a balance, or a delayed feed animation is not.

Recovery records are stored in this browser before signing and submission, scoped to mode/platform/deployment, with the consenting customer's address, prepared envelope, intent, hash and exact signed envelope. Browser Web Locks serialize operations in tabs sharing this origin. Use a secure context and a supported browser. Do not clear recovery storage while unresolved or move to another browser and initiate a replacement. Storage failure disables new operations; retain the current record for support. A pending-preparation marker is saved before requesting XDR; transport failures without a usable response keep that marker and support request ID for operator recovery rather than preparing another intent. Signed envelopes are sensitive authorization material: never log, publish or send them to analytics.

Use **Check again** after reload or uncertainty. Execute preparations include the original hash before wallet signing. Older v1 records derive and persist that hash from the saved original envelope before status lookup, even if lookup subsequently fails. Execute resubmits only its original signed envelope or looks up its attributed hash; UNKNOWN/missing evidence never clears recovery. Wallet-intent flows reconcile their original intent and retain the same signed envelope. Schedule/Subscription controls require `replacementAllowed`; funding allows only durable terminal SUCCESS/FAILED/EXPIRED; public allowance status establishes finality or ledger-proven expiry. A client clock passing `expiresAt` never permits replacement. A wallet-signing interruption without a persisted signature can require operator review, because a wallet may itself broadcast. **Execute recovery limitation:** for an expired unsigned record, Check again can resolve a transaction broadcast by the wallet if the deployment-scoped API proves SUCCESS/FAILED. If the result is UNKNOWN or NOT_FOUND, keep the original record and give platform support the deployment ID, transaction hash and preparation request ID (never the signed envelope). The published execute API does not provide ledger-covered noninclusion proof; it cannot safely authorize replacement of a never-included expired preparation. A platform reconciliation capability is required to finish that case; do not reset browser storage to bypass it.

Activity polling retains the earliest next-request time across tab visibility changes. Retry-After (seconds or HTTP date) takes precedence over immediate pagination; invalid values use a five-second fallback. Only one page request runs at a time.

Request IDs, field errors and Retry-After remain available for diagnostics; wait the returned delay before recovery.

### Application authorization

Privileged controls are denied by default. Replace `applicationAuthorized` in `lib/app-authorization.ts` with your application's trusted session, role and deployment-ownership checks. Each Schedule action has its own permission. Wallet consent is separate from application authorization. The integration mutation route rejects cross-origin requests and dispatches only explicitly supported operations. No arbitrary path/body upstream proxy exists. Dev recipient payout UI is excluded from the supplied default and the older payout route also requires application authorization.

### Server-side Webhook rewards

Set optional server-only `PAIFLOW_WEBHOOK_SECRET` from the owner's deployment page. No example callback route is publicly exposed. In your authorized server handler, first verify the actual completed task, then persist a record keyed by that logical event in your database:

```ts
import { webhookReward, type WebhookReward } from "@/lib/paiflow";
// Load an existing record on retry; create it durably only once per verified task.
const record: WebhookReward = {
  key: "completed-task-42",
  payload: { escrow: true, amount: "10000000" },
};
const result = await webhookReward(record);
// Persist result.attemptId and result.txHash. PENDING/UNKNOWN require the SAME
// persisted record/key/payload on retry; never infer success from HTTP 202.
```

Changed effective arguments conflict. A key never automatically expires/reopens. UNKNOWN without a hash requires operator review. An API token authorizes deployment access and must never substitute for your app's completed-task/session checks.

### Readiness and testnet acceptance

Keep prepare as the default: it makes no platform calls and disables wallets/payments/feed. Demo explicitly uses the shared checkout; an empty token never selects demo. Configuration failures identify missing or invalid credentials. Capability discovery refuses mainnet; wallet signing checks the current customer, testnet passphrase and finite preparation expiry. Missing account/trustline and insufficient balances are explained by preparation simulation; fund the exact testnet asset and recipient trustline before trying again. Unsupported flows have no runnable checkout. Do not replace an uncertain original transaction merely to resolve an expiry or rate-limit message.

Read-only hosted verification on **2026-10-12** found healthy staging revision `9ae4172` and published funding, Schedule, Subscription, balance, quote and transaction endpoints; see `docs/staging-verification-2026-10-12.json`. The public allowance workflow is outside `/api/v1`: `/api/deployments/:id/subscription-allowance`, `/submit` and `/status?intent`. Its response omits network/expiry; the server uses live Subscription network and the platform-signed intent's transaction maxTime. The published Schedule response uses `unsignedXdr` and omits passphrase; the server only normalizes network `testnet` to its canonical passphrase. All other networks are rejected.

**Live signed testnet acceptance is pending:** these checks establish published surface availability, not successful transactions. Rehearse each table pattern with dedicated consenting wallets/deployments: Receive/Pay/Split/conditions/Swap; Schedule funding/pause/resume/retrieve; Subscription approve/cancel/reactivate/reapprove and wrong-wallet refusal; Webhook funding/keyed reward retry; authorized/denied early release. Also exercise reload, uncertain submission, expired intent reconciliation, multi-node selection, 429 delays and delayed events. Credentials and exact consenting fixtures are required; no funds were transferred during implementation.
