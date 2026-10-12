Read `llms.md` first; it is the shared, event-neutral Paiflow API and product guide. Early Paiflow deployment, integration and test payments are allowed once the team has credentials. Keep prepare as the default; team mode can be selected before the event. For onboarding, credentials, submission requirements and judging, follow the participant's event primer and organiser instructions. Do not infer event rules from technical examples or another event's context pack. If event information is missing, ask the organisers. `llms-web3-iloilo.md` is a separate event-specific pack; use it only for that event. This is starter code, not a supported package — edit freely.

- Call Paiflow only through server-only `lib/paiflow.ts`; keep the deployment token in server environment variables. Never use `NEXT_PUBLIC_` for configuration or return tokens to the browser.
- Never handle a customer's secret key. Freighter signs XDR in the browser, using the prepared network passphrase. Refuse mainnet.
- Use `lib/amount.ts` for money. Amounts are decimal/stroops strings with bigint arithmetic, never floating-point numbers.
- Keep signed envelopes for PENDING and uncertain submission errors; retry that same envelope, never duplicate a payment.
- The payout proxy is unauthenticated. Add your app's authorisation before exposing it publicly. Add authorisation before exposing `releaseEarly`; this starter has no release route.
- Run `pnpm typecheck`, `pnpm build && pnpm test` after edits. Check `.next/static` for credential leaks.
