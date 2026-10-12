# Paiflow hackathon starter

Paiflow is the money logic behind your app. This repo is the plumbing: replace the screens in `components/starter-app.tsx` with your idea and keep the server page wrapper in `app/page.tsx` and the guarded server-only client in `lib/paiflow.ts`. One deployment serves one business or group. Testnet only.

## Choose the right resource

| Resource | Use it for |
| --- | --- |
| [Paiflow Guide](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/hackathon/paiflow-guide.md) | Wallet setup, building and deploying a flow, and configuring the ready-wired starter. |
| [API quickstart](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/hackathon/developer-api-quickstart.md) | A separate frontend/backend integration for apps built without the starter. Do not copy its routes into this repository. |
| [Full API reference](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/api/README.md) | Endpoint schemas, errors, limits, pagination and advanced workflows. |
| [OpenAPI JSON](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/api/openapi.json) | Machine-readable endpoint schemas. |
| [Postman collection](https://github.com/artisam-paiflow/paiflow/blob/develop/docs/api/paiflow-api-v1.postman_collection.json) | Runnable API requests for your deployment. |
| [Configuration template](.env.example) | Server-only mode, platform origin, deployment UUID and token settings. |
| [Agent instructions](AGENTS.md) | Coding boundaries, event scope and verification commands. |
| [Package manifest](package.json) | Node.js range, package manager, dependencies and scripts. |
| [Server client](lib/paiflow.ts) | Current implementation of mode guards and Paiflow API calls. |
| [AI developer context](llms.md) | Product constraints, API details and worked examples for your AI assistant. |

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
| `demo`                         | Explicitly enables the shared XLM demo where available; usable before the event.                                     |
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
- Execute preparations last **180 seconds**. SUCCESS is final, FAILED can be HTTP 200, and PENDING or transport/502 errors need **Check again** with the same signed envelope. Keep the tab open while uncertain; do not prepare a duplicate payment. API errors retain code/message, request id and Retry-After when supplied.
- In demo/team modes, the feed polls every five seconds while visible, drains cursor pages and deduplicates by eventId. It can lag; lack of an event alone does not mean payment failed.
- `releaseEarly` is available in the server client for your authorised server handler. It authorises a relayer release without customer signing, so you must add your app's own authorisation. There is deliberately no release route or button here.

## Checks

`pnpm typecheck`, `pnpm test`, `pnpm build`. Dependencies are limited to Next.js/React, Freighter and server-only, with TypeScript/types and Vitest for development. No database, Stellar SDK, UI library or state library. Run `pnpm audit` and scan `.next/static` for `pfk_`, `PAIFLOW_API_TOKEN` and your test token before publishing.
