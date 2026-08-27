# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: real Chilean users who want to organize their personal finances with the 50/30/20 method — people who receive bank statements (cartolas) from Chilean banks (Banco de Chile, BancoEstado, BCI, Santander) and want to know, each month, whether they are doing fine. The project owner is "user zero," but design decisions target this real public audience, not a single-operator tool.

Secondary: evaluators arriving through the self-serve demo mode (auto-expiring, read-only sample account) with a "Crear cuenta" path to the marketing site.

Accounts are strictly single-user — no household, team, or shared-account features.

## Product Purpose

MoneyDiary consolidates bank movements imported from Chilean bank statement files (`.xlsx`/`.pdf`), classifies spending with the 50/30/20 method (Necesidades / Deseos / Ahorro), and answers the core question "¿estoy bien este mes?" through a green/yellow/red semáforo.

Success (confirmed): **personal monthly clarity** — a user answers "am I doing fine this month?" in seconds, from real consolidated data. Adoption metrics and engineering-showcase value are secondary to that outcome.

## Positioning

An emotionally calm, non-bank-like "lifestyle-centric financial companion" (per root DESIGN.md): it turns stressful financial data into an approachable monthly verdict. The mechanism a neighboring product cannot truthfully copy: native parsing of Chilean bank cartolas plus a single worst-of-three-buckets semáforo verdict, computed on exact CLP amounts (BigInt, never float).

## Operating Context

- Monthly ritual: download cartola from the bank → upload in `/subir` (preview with auto-detected bank and per-row category override → commit) → review the Resumen dashboard and semáforo.
- Manual movements (`/registrar`) cover income/expenses that never pass through an imported cartola.
- Auto-categorization patterns (`/configuracion/categorias`) reduce recurring classification work; reclassification happens inline on movement lists, with confirmation when a move crosses buckets.
- Production: `app.moneydiary.cl` (Vercel), backend at `api.moneydiary.cl` (Express, session cookie auth; Google OAuth login capability-gated server-side).
- Demo mode (`esDemo`) makes every write surface read-only and shows contextual nudges to create a real account.

## Capabilities and Constraints

- Read surfaces: Resumen dashboard (income, expense pie, annual 50/30/20 grid), semáforo detail, bucket detail, ingresos list, ingestas list.
- Write surfaces: cartola upload/commit, delete successful ingestas, manual movement registration, inline reclassification, profile edit (name/email/password, Google link/unlink), categories + patterns CRUD.
- Money is exact CLP: BigInt on the backend, string-serialized over HTTP; the web app never does float math on amounts (root plan de pruebas).
- The frontend never imports backend domain code (ADR-005/ADR-008); the contract is hand-written DTOs in `src/api/types.ts`.
- Terminology (binding domain vocabulary): **cartola** (bank statement file), **ingesta** (one import event, PROCESADA/FALLIDA), **semáforo** (worst-of-3-buckets monthly verdict), **movimiento** (transaction), **patrones** (auto-categorization rules), **buckets** Necesidades/Deseos/Ahorro plus "Sin categoría". UI deliberately relabels `Deseos` → **"Gustos"** (via `ETIQUETA_BUCKET`); the API keeps `Deseos`.
- UI language (confirmed): **neutral/professional Spanish** — no regional slang in copy; Chilean domain terms like "cartola" stay because they are domain vocabulary, not regionalism. No i18n planned.
- Undecided: none material at init time.

## Brand Commitments

- Name: **MoneyDiary**. Favicon: `apps/web/public/favicon.svg` (purple/blue abstract mark); fuller brand assets live with `apps/landing`.
- Product apps use **Inter**; the landing's DM Sans / Plus Jakarta Sans pairing is an explicit exception and only a *candidate* for product-wide adoption (root DESIGN.md).
- The incumbent visual world is the root `DESIGN.md` ("Serene Finance"): soft modernism, pastel bucket palette (Soft Blue = Necesidades, Lavanda = Gustos, Pastel Yellow = Ahorro, Coral = over-budget).

## Evidence on Hand

- Real production app with real data flows at `app.moneydiary.cl`; demo account with sample data as the public evaluation path.
- Real bank fixtures for the four supported banks live in `apps/api/test/fixtures/`.
- No testimonials, case studies, press, or user metrics exist — future marketing/product surfaces must not fabricate them.

## Product Principles

1. **The monthly verdict comes first.** Every surface should shorten the path to "¿estoy bien este mes?"; detail views exist to explain the verdict, not to compete with it.
2. **Exact money, always.** Amounts are exact CLP; anything that affects how much money is shown or classified belongs to the backend domain (ADR-024), never to client-side math.
3. **Calm over bank-like density.** Financial anxiety is the enemy; prefer clarity, whitespace, and one clear signal over dense dashboards.
4. **Demo is a first-class citizen.** Every new write surface must degrade gracefully to read-only demo mode with an honest nudge, never a broken control.
5. **Domain vocabulary is the interface.** Use the binding Spanish terms consistently; never invent synonyms for cartola, ingesta, semáforo, or the buckets.

## Accessibility & Inclusion

WCAG 2.2 AA is the committed standard (ADR-018). Practices already in force and expected of new work: color is never the only carrier of meaning (icons/text alongside bucket colors), live regions (`role="status"`/`alert`) and explicit focus management on state transitions, stable `aria-label`s, visible focus rings. `eslint-plugin-jsx-a11y` runs at `warn` app-wide with `error` scoped to newer files (debt burndown strategy); `vitest-axe` used on selected components.
