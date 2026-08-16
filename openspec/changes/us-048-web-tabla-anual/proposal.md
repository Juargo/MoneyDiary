# Proposal: US-048 — Web annual table redesign, navigable mini-charts (#282)

## Intent

The annual grid below the dashboard is the only surface that answers "how did my whole year go?", but today it
is a **dead end that also tells a stale story**. Three problems compound:

1. **It contradicts the main chart.** US-047 moved the dashboard to a 4-item reading (Necesidades, Deseos,
   Ahorro, **Sin categoría**), but the 12 minis still force the old 3-slice 50/30/20 reading via an explicit
   `BUCKETS_5030` override, documented in code as an interim "until US-048 redesigns this table". A user
   comparing August's main donut against August's mini sees two different pictures of the same month.
2. **The grid cannot tell you which month you are looking at.** The only marker today is `esActual` — *today's*
   real calendar month. Navigate to March and the grid still points at August. There is no "selected month"
   concept anywhere in `ResumenAnual`/`ResumenScreen`.
3. **The semáforo is decorative here.** US-047 established the TRANSVERSAL rule (`WG5-07`) that a semáforo is a
   navigable entry point, but the 12 annual badges are static `<span role="img">`s. The one screen with 12
   months of semáforos in view is the one screen you cannot drill into them from.

This change makes the annual grid a **coherent, navigable macro view**: same 4-item reading as the main chart,
an unambiguous "you are here" marker, a per-month semáforo entry point, and a caption that teaches the
interaction instead of leaving users to discover it.

**Why now:** US-046 (backend) and US-047 (main chart) are both shipped. The `BUCKETS_5030` override is
registered debt whose trigger is literally this US, and the `/semaforo?periodo=` route stub US-047 created is
waiting for its highest-volume caller.

**Recorded finding — "Análisis por periodo":** issue #282 says this change absorbs the old "Análisis por
periodo" section. Exploration grepped `apps/web` and `apps/mobile` and found **zero** matching component,
route or module; issue #282's own body never defines it. It was de-facto absorbed by US-030 Slice C, which
built `ResumenAnual`. **There is nothing to delete.** This paragraph is the deliverable for that clause — no
removal task will be created.

## Scope

### In Scope

- **4-wedge minis (CA-01).** The 12 minis adopt the same ring reading as the main chart, including a
  `Sin categoría` wedge. Mechanically this is the deletion of one explicit argument at the call site.
- **Selected-month marker (CA-02).** A genuinely new concept: the month currently driving the main chart is
  visually distinct (larger, Mint-filled circle), derived from `viewModel.periodo` as the single source of
  truth and threaded from `ResumenScreen`.
- **Today marker coexistence (CA-02).** The existing "today" marker (`✓` + `aria-current="date"`) is
  **retained as a distinct, separately-audited marker**, not renamed or absorbed into "selected".
- **Per-month clickable semáforo (CA-05).** Each cell's semáforo becomes a navigable control to
  `/semaforo?periodo={mes.periodo}`, honoring the `WG5-07` transversal rule.
- **DOM restructure of `MesCelda` (CA-05 correctness).** The month control and the semáforo control become
  **siblings** inside a non-interactive wrapper. Required, not cosmetic: an `<a>` inside a `<button>` is
  invalid HTML and produces a broken AX tree.
- **Interaction caption (CA-06).** A new caption under the grid explaining the month-click behavior and naming
  the currently selected month.
- **Verification-only coverage for CA-03 and CA-04** — see the explicit clause below.
- Section header copy refresh to match the wireframe's macro framing.
- `eslint-jsx-a11y` at `error` scope on every file this change touches (US-042/043/047 precedent).

### Verification-only (NOT a rebuild) — CA-03 and CA-04

Exploration verified against code that **CA-03 and CA-04 already ship today**:

| CA | Existing implementation | This change does |
|---|---|---|
| **CA-03** — click a month, main chart switches without reload, same drill-down | `MesCelda`'s `onClick` → `onSelectPeriodo` → `ResumenScreen` → `ResumenPage`'s `onPeriodoChange` → TanStack Router `periodo` search param → `useResumen(periodo)` refetch, including `ResumenScreen`'s FIX-5 per-month bucket-selection reset | **Nothing.** Spec by reference to existing behavior + add regression coverage that survives the DOM restructure |
| **CA-04** — empty/future months visually distinct and non-navigable | `sinIngreso` months render as `<div role="button" aria-disabled="true">` with no `tabIndex`/`onClick` (FIX 3), muted styling | **Nothing to the navigation behavior.** Regression coverage only, plus the D-2 semáforo asymmetry below |

`sdd-spec` MUST write these as requirements that **reference existing behavior and pin it against regression**,
not as build instructions. The DOM restructure is the actual risk to both — that is what the regression tests
exist to catch.

### Out of Scope

- **Any backend or wire change.** `apps/api` and `packages/api-client` show zero diff. Any task touching them
  is scope creep.
- **`/semaforo` page content** — US-049 owns it. This change only adds callers to the existing stub.
- **`apps/mobile` parity.** Web and mobile annual surfaces diverge for now; deferred, no trigger yet.
- **Reopening the grid column count.** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` is recorded against `WDS-04`
  (capability `web-dashboard-shell`, defined only in the un-archived change `web-dashboard-redesign-mobile`;
  its own verify-report marks the deviation ⚠️ PARTIAL/SUGGESTION, an accepted-but-unratified deviation, not a
  ratified requirement) — what IS **locked by an existing test** is the code-level `ResumenAnual.test.tsx`
  grid-columns assertion. The wireframe's "6-per-row" is treated as an illustrative sketch of a wide viewport,
  not a requirement. See R-6.
- **Modifying `SemaforoTag`, `SemaforoBadge`, `MiniDistribucionPie`, `DistribucionPie`, `distribucion-gasto.ts`
  or `bucket-colors.ts`.** All already support what this change needs; `COLOR_BUCKET` already carries a
  `SinCategoria` entry.
- **Changing `ResumenAnual`'s self-contained query ownership.** It keeps its own `useResumenAnual(anio)` and its
  own Loading/Error/Empty states.
- Ingresos drill-down from the minis, month-over-month deltas, year navigation, sparklines, or any annual
  aggregate not already on the wire.

## Capabilities

### New Capabilities

- None. No new capability document is created.

### Modified Capabilities

- **`web-app`** — gains a **new requirement family `WTA-*` (Web Tabla Anual)** for the annual grid, which has
  no requirements of its own today (US-030 Slice C shipped `ResumenAnual` before the living spec existed).
  Prefix precedent in `openspec/specs/web-app/spec.md`: `WCAT-*`, `WCTG-*`, `WCTM-*`, `WPER-*`, `WMYP-*`,
  `WG5-*` — one short mnemonic family per surface. `WTA-*` follows it.

**Binding instruction for `sdd-spec`:** `WTA-*` MUST **reference**, never restate:

| Referenced requirement | What it already settles |
|---|---|
| `WG5-01` | The 4-item ring reading and its client-side apportionment |
| `WG5-07` | The transversal "semáforo is a navigable tag on any chart" rule — CA-05 is this rule applied to the annual grid |
| `WG5-08` | `null` `estadoGlobal` renders "Sin datos" and stays a live link, never omitted — the precedent D-2 extends |
| `WG5-09` | The `/semaforo` stub's under-construction state |
| `WG5-13` | Sin categoría diluting the three spend-bucket percentages |
| `WG5-10` | Real-viewport T1 verification, never className presence |
| `WPER-*` / `WMYP-*` | Period navigation — reused unchanged; CA-03's plumbing already flows through it |
| `WDS-04` | Capability `web-dashboard-shell`, defined only in the un-archived change `web-dashboard-redesign-mobile` — its verify-report records the grid-column layout as an accepted-but-unratified ⚠️ PARTIAL/SUGGESTION deviation, not a locked requirement. The code-level grid-columns test is what is locked and green; cited here, not re-litigated |

## Approved product decisions (BINDING)

Resolved in the proposal question round. `sdd-spec` and `sdd-design` treat these as settled inputs.

| # | Decision | Rationale |
|---|---|---|
| **D-1** | **Selected and today COEXIST as distinct markers.** Selected = larger Mint-filled circle, derived from `viewModel.periodo` threaded as a prop (single source of truth). Today = the existing `✓` + `aria-current="date"`, retained and audited. | `aria-current="date"` means *today* in ARIA semantics; overloading it for "selected" would be semantically wrong. Deriving selected from `viewModel.periodo` (rather than tracking clicks locally) keeps the grid correct on initial load and when the user navigates via `PeriodoSelector` instead of the grid. |
| **D-2** | **Disabled-month asymmetry is ACCEPTED.** An empty/future month cell stays `aria-disabled` and non-navigable (CA-04 intact), but **its mini semáforo tag is ALWAYS clickable** → `/semaforo?periodo=X`. The detail page explains "sin datos". | Direct extension of `WG5-08`'s judgment-day-locked never-hide rule. The asymmetry is deliberate: "this month has no cartola to drill into" ≠ "you may not ask about this month's semáforo". |
| **D-3** | **Mini tag tap-target is design's call, with a WCAG 2.5.8 floor of 24×24 CSS px.** Compact, icon-only, carrying a full accessible name. | The visual glyph may be smaller than its hit area; the floor is non-negotiable (ADR-018, and the same floor `WCTG-13` already enforces elsewhere). |
| **D-4** | **New `MiniSemaforoTag` SIBLING component**, not a `compact` prop on `SemaforoTag`. `MesCelda` restructured to sibling controls (month button + semáforo link, tag positioned top-right). | Mirrors the already-sanctioned `MiniDistribucionPie`-vs-`DistribucionPie` precedent in this codebase. Zero regression risk on `SemaforoTag`'s 6+ locked tests; each component stays single-purpose (SRP). Shared label/estado logic already lives in `lib/semaforo-estilos.ts`, so only the `Link` JSX duplicates — well under the DRY three-strikes threshold. |

## Approach

Extend the existing components in place; add exactly one new component. No new dependency, no new state
container, no new data fetch.

| Concern | Change | Principle |
|---|---|---|
| **4-wedge minis** | Delete the explicit `BUCKETS_5030` second argument from `MesCelda`'s `calcularDistribucionGasto(mes.buckets)` call, and remove the now-obsolete interim comment. `MiniDistribucionPie` is already fully generic. | YAGNI — the debt's registered trigger fired; a one-argument deletion, not a rewrite |
| **Selected month** | `ResumenScreen` passes `periodoSeleccionado={viewModel.periodo}`; `ResumenAnual` derives `esSeleccionado = mes.periodo === periodoSeleccionado`, kept strictly separate from `esActual`. No local state. | Single source of truth; no state to desync |
| **Cell DOM** | `MesCelda`'s wrapper becomes a **non-interactive** positioned element containing two SIBLING controls: the month `<button>` (label + mini ring) and the `MiniSemaforoTag` `<a>` (top-right). Tab order between the two is a design decision, stated explicitly, not left to markup accident. | Valid HTML + correct AX tree; both controls independently keyboard-reachable |
| **Per-month semáforo** | New `apps/web/src/components/MiniSemaforoTag.tsx` — a `<Link to="/semaforo" search={{ periodo }}>`, icon-only, full accessible name, ≥24×24 target, reusing `lib/semaforo-estilos.ts`. `SemaforoTag`/`SemaforoBadge` untouched. | D-4; SRP over prop-branching |
| **Disabled cells** | The month control keeps `aria-disabled`/no-`onClick`; the sibling `MiniSemaforoTag` renders live on the same branch. `esActual` marker survives on the disabled branch (existing FIX 1). | D-2 |
| **Caption** | A caption element under the grid, associated with the section, naming the **actually selected** month dynamically — never a hardcoded "Ago". | CA-06; recognition over recall |
| **Header copy** | Section header adopts the wireframe's macro framing. Final Spanish copy (properly accented — the wireframe sketch renders unaccented) is locked in the spec. | Copy is spec-owned, not implementation-owned |

**Explicitly rejected:** tracking the selected month as local state inside `ResumenAnual` (breaks on initial
load and on `PeriodoSelector` navigation), and adding a `compact`/`size` prop to `SemaforoTag` (prop-branching
on a component with 6+ locked tests, for a genuinely different simpler use — D-4).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/web/src/components/ResumenAnual.tsx` | Modified | Drop `BUCKETS_5030` arg; accept + thread `periodoSeleccionado`; `MesCelda` DOM restructure to sibling controls; caption; header copy |
| `apps/web/src/components/MiniSemaforoTag.tsx` | **New** | Compact navigable semáforo tag (D-4) |
| `apps/web/src/components/ResumenScreen.tsx` | Modified | Pass `periodoSeleccionado={viewModel.periodo}` into `ResumenAnual` |
| `apps/web/src/components/ResumenAnual.test.tsx` | Modified | **Invert** the 3-slice pinning test to 4 with a nonzero `SinCategoria` fixture; migrate `within(botonActual)` assertions to the sibling-control DOM; add selected-vs-today, per-cell semáforo link, disabled-cell-live-tag, and caption tests; **add CA-03/CA-04 regression tests** |
| `apps/web/src/components/MiniSemaforoTag.test.tsx` | **New** | Href/periodo, accessible name, `null` estado → "Sin datos" still linked, ≥24×24 target |
| `apps/web/src/components/ResumenScreen.test.tsx` | Modified | Selected month follows the viewed period end-to-end |
| `apps/web/e2e/dashboard-donut.e2e.ts`, `apps/web/e2e/tablet-grid.e2e.ts` | Modified | CA-03 click-through and CA-05 semáforo navigation at real viewports (precedent files) |
| `apps/web/eslint.config.js` | Modified | Scope touched files to a11y `error` |
| `apps/web/src/components/SemaforoTag.tsx`, `SemaforoBadge.tsx`, `MiniDistribucionPie.tsx`, `DistribucionPie.tsx` | **Untouched** | Zero diff — D-4's whole point |
| `apps/web/src/domain/distribucion-gasto.ts`, `lib/bucket-colors.ts` | **Untouched** | Already support the 4-item ring incl. `SinCategoria` |
| `apps/api`, `packages/api-client`, `apps/mobile` | **Untouched** | Zero diff — ADR-024, any task here is scope creep |

### Test impact — the pinning inversion

`ResumenAnual.test.tsx` (~L420-458) contains an **intentional pin**: "renders exactly 3 mini-pie slices". It
MUST be **inverted to assert 4**, not deleted — and its fixture MUST carry a **nonzero `SinCategoria`** value,
otherwise a 4-wedge implementation still renders 3 visible wedges and the test passes for the wrong reason.
This is the single most likely place for a silent false-green in this change.

## Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R-1 | The `MesCelda` DOM restructure silently regresses CA-03 or CA-04 (already-shipped behavior) | **High** | CA-03/CA-04 regression tests are written **first**, against the current DOM contract expressed behaviorally (click → periodo change; disabled → no activation), then re-run after restructure. This is why they are in scope as verification. |
| R-2 | The 3→4 wedge test passes against a zero-valued `SinCategoria` fixture and proves nothing | **High** | Spec/tasks explicitly require a nonzero `SinCategoria` fixture on the inverted pin |
| R-3 | Two coexisting markers (selected + today) read as visual noise, or as one broken marker | Med | D-1 locks the semantics; design owns making them unmistakably distinct; a11y audit verifies `aria-current="date"` stays on today only |
| R-4 | The 24×24 tap target is met by CSS that the test asserts via className rather than rendered geometry — the exact gap that shipped `WCTG-14` false | Med | Spec requires real-viewport/rendered-box verification for the target size, following `WG5-10`/`WCTM-01` |
| R-5 | 12 more `<Link>`s in the grid degrade render or flood the tab order | Low | 12 static links is trivial; tab order is an explicit design decision (Approach), not an accident |
| R-6 | The wireframe's "6-per-row, 48×48 circles" is read as a mandate and reopens the `WDS-04` grid layout | Med | Declared out of scope above. Circle sizes (48/52px) are design-owned within tokens; **column count stays `2/3/4` and its code-level locking test stays green** — `WDS-04` itself is only an accepted-but-unratified deviation (see the reference table above), not a mandate to preserve. If the user genuinely wants 6-per-row, that is a separate change, ideally paired with ratifying `WDS-04`'s canonical home. |
| R-7 | "Análisis por periodo" meant something outside the repo (e.g. a Whimsical-only frame) | Low | Recorded in Intent as a finding; if the user identifies a real artifact, it enters as a scope amendment before `sdd-tasks` |
| R-8 | Estado/percentage arithmetic creeps into `apps/web` while restructuring | Low | ADR-024 guard, same as `WG5-11`: client may only format, label and apportion the sanctioned ring; review rejects bp/threshold math |

## Rollback Plan

Revert the PR(s). The change is confined to `apps/web` presentation plus one new component file — no migration,
no wire change, no persisted state, no route added (the `/semaforo` stub already exists). Reverting restores the
3-slice minis and the static badges with zero data cleanup. The three pieces are also independently revertible:
the wedge change (one argument), the selected-month marker (one prop), and the per-month semáforo (one
component + the DOM restructure) do not depend on each other.

## Dependencies

- **US-046** (shipped) — backend annual data.
- **US-047** (shipped) — 5-item donut, `SemaforoTag`, `lib/semaforo-estilos.ts`, and the `/semaforo` stub route
  with its `periodo` search param. **This change is a consumer of that stub, not its owner.**
- **US-049** (same sprint) — fills `/semaforo` content. If it slips, the 12 new links land on `WG5-09`'s
  explicit under-construction state, never a blank or 404.

## Success Criteria

- [ ] **CA-01** — All 12 minis render the same 4-item ring reading as the main chart, `Sin categoría` included;
      the `BUCKETS_5030` override and its interim comment are gone; the pinning test asserts **4** wedges with a
      **nonzero** `SinCategoria` fixture.
- [ ] **CA-02** — The month driving the main chart is visually distinct (larger Mint circle), derived from
      `viewModel.periodo`; today's `✓` + `aria-current="date"` still renders and is verified **distinct** from
      the selected marker when the two differ (D-1).
- [ ] **CA-03** *(verification-only)* — Clicking a month with data switches the main chart with no page reload
      and preserves the existing drill-down and bucket-selection reset. Proven by regression tests that survive
      the DOM restructure; **no wiring is rebuilt**.
- [ ] **CA-04** *(verification-only)* — Empty/future months remain visually distinct and non-navigable
      (`aria-disabled`, no keyboard/mouse activation). Proven by regression tests; **no behavior is rebuilt**.
- [ ] **CA-05** — Every month's semáforo is an independently keyboard-operable control navigating to
      `/semaforo?periodo={mes.periodo}`, **including empty/future months** (D-2); no interactive element is
      nested inside another, verified in the rendered AX tree.
- [ ] **CA-06** — A caption under the grid explains the month-click interaction and names the actually selected
      month dynamically.
- [ ] `pnpm web test`, `pnpm web typecheck` and `pnpm web lint` (with `eslint-jsx-a11y` at `error` on every
      touched file) are green.
- [ ] `apps/api`, `packages/api-client` and `apps/mobile` show **zero diff**.
- [ ] `SemaforoTag.tsx`, `SemaforoBadge.tsx`, `MiniDistribucionPie.tsx` and `DistribucionPie.tsx` show **zero
      diff**, and the code-level grid-columns test tracking the (accepted-but-unratified `WDS-04`) deviation is
      untouched and green.

## Next step

`sdd-spec` (delta on `web-app`, **new family `WTA-*`**, referencing `WG5-*`/`WPER-*`/`WDS-04` rather than
restating them) and `sdd-design` may run in parallel.

Design owns: the selected-vs-today visual language (D-1), the `MiniSemaforoTag` compact form and its ≥24×24
target (D-3), the `MesCelda` sibling-control layout and tab order (D-4), and the final Spanish copy for the
header and caption.
