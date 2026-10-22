# Front-End Skills

Build interfaces that feel intentional, clear, and specific to the product. Treat the existing design system and product requirements as the source of truth.

This project is a Next.js 15 App Router application (React 19, TypeScript, plain CSS via `app/globals.css`). The two browser entry points are `app/page.tsx` (customer payment flow) and `app/staff/page.tsx` (staff dashboard), backed by the client components in `components/clearpay-app.tsx` and `components/staff-app.tsx`. Server routes live under `app/api/`.

## Before changing code

1. Inspect the project structure, existing UI (`app/globals.css`, `components/`, `app/`), design tokens, component conventions, and the applicable `AGENTS.md` and `llms.md` instructions.
2. Identify the user's goal, the important content and actions, and the constraints the interface must satisfy — for this product that includes the payment lifecycle states (preparation, signing, submission, confirmation, recovery) and the staff reconciliation views.
3. Reuse existing patterns when they fit. If requirements conflict with the current system, follow the explicit product requirements and make the smallest coherent adjustment.
4. If key requirements are missing, make a sensible, reversible choice and state the assumption. Ask only when the missing detail materially blocks a correct implementation.

## Design and implementation standards

- Make the interface feel designed for this product and task. Avoid generic templates, stock dashboard layouts, decorative gradients, gratuitous glass effects, oversized rounded cards, and filler copy.
- Establish a clear visual hierarchy. Give the primary task (e.g. the payment action, the signing step, the recovery path) the space and emphasis it needs; keep secondary elements quiet.
- Use the project's typography, spacing, color, icon, and component conventions from `app/globals.css`. Do not invent new tokens or patterns without a reason.
- Prefer simple, readable layouts over unnecessary panels, cards, badges, dividers, and ornament.
- Use real product language and meaningful content. Do not add placeholder text, fake metrics, or unsupported claims. Amounts are fixed at 1 XLM and must render from string values, never floating-point formatting.
- Make responsive behavior deliberate. Check how content reflows at narrow widths (mobile wallets are a primary surface); avoid clipped controls, horizontal overflow, and awkward stacking.
- Include appropriate interaction states: hover, focus, active, disabled, loading, empty, and error states where relevant. Payment flows must surface pending/uncertain states honestly rather than spinning silently.
- Support keyboard use and assistive technology. Use semantic HTML, visible focus styles, accessible names, sufficient contrast, and correctly associated labels.
- Keep components and styling consistent with the codebase. Avoid unnecessary dependencies, broad rewrites, duplicated components, and unrelated cleanup.
- Preserve existing behavior unless the requested change requires otherwise.

## Security and lifecycle constraints for the UI

- The browser never sees platform origin details, deployment IDs, or `pfd_`/`pfk_` credentials, and the UI must not surface them. Freighter signing happens in the browser using only the server-prepared network passphrase.
- Client components may import from `@paiflow/sdk` only as type-only imports. All runtime SDK calls stay server-side.
- The UI must present transaction confirmation as distinct from a verified payout or order fulfilment, and must not imply fulfilment on `PENDING`, `UNKNOWN`, or `NOT_FOUND`.
- Recovery UI reconciles the original transaction and retries only its exact signed envelope; never offer a "replace payment" path from an uncertain state.

## Quality check

Before finishing, review the changed screens at the relevant viewport sizes and check that:

- The result satisfies the user's stated goal and system requirements.
- The hierarchy, spacing, typography, and interactions are coherent.
- The UI uses existing design-system conventions consistently.
- Responsive, keyboard, and accessibility needs are handled.
- No placeholder content, accidental overflow, console errors, or unrelated changes remain.

Run only checks that are requested or required by the project's instructions (`pnpm typecheck`, `pnpm test`, `pnpm build` when the change warrants them). In your final response, summarize what changed, note any assumptions or limitations, and report checks that were actually performed.
