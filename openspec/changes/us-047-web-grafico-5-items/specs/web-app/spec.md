# Delta for web-app

Source: `openspec/changes/us-047-web-grafico-5-items/proposal.md` (US-047, issue #281). Every requirement
below traces to a CA-0N from the issue (verbatim where quoted) or to a specific proposal decision named in
its own text. New requirements use a fresh family, **`WG5-*`** (Web dashboard main chart, 5 items) — the
proposal's own suggested prefix — rather than extending `WCAT-*` (bucket drill-down) or `WPER-*`/`WMYP-*`
(period selector), because those families already ship unchanged behavior this change only *consumes*, not
modifies.

Two scenario labels are used below, per the precedent this repo already established (`WCTG-14`,
`WCTM-01..06`) after jsdom-only coverage shipped a tablet requirement false:

- **(Playwright)** — the scenario's truth depends on rendered geometry (wedge count/shape, row order,
  position, layout variant) at a real viewport. `pnpm web test` (jsdom) CANNOT verify these.
- **(jsdom)** — the scenario's truth is DOM structure, text content, an accessible name/role, or a pure
  function's return value — verifiable by the existing Vitest/jsdom suite.

**Reused, unchanged families (not restated here):**
- **CA-01's month header** is fully satisfied by the existing `WPER-01..07` (prev/next/"Hoy", accessibility,
  styling) and `WMYP-01..08` (popover month/year picker). This change makes no change to that component or
  its requirements; `WG5-02` below only asserts that it stays page-level, unchanged.
- **CA-04's drill-down mechanics** for the 3 spend buckets and Sin categoría (panel swap, grouping,
  reclassify) are fully satisfied by the existing `WCAT-01..05`. This change adds no new drill-down
  behavior for those four rows; `WG5-06` below only asserts Ingresos' new (non-)interactive delta.

## ADDED Requirements

### Requirement: WG5-01 — Main chart renders as a 4-wedge donut, proportions from a client-side share-of-spending apportionment, not from `porcentajeBp` (CA-01, CA-06, ADR-024)

The dashboard's main chart MUST render as a ring (donut), replacing today's filled pie, with exactly 4
wedges — Necesidades, Deseos, Ahorro, Sin categoría — in that order. Wedge proportions MUST be derived from
`calcularDistribucionGasto`'s share-of-spending ratio: a largest-remainder apportionment computed
client-side over the raw BigInt totals of the 4 `BUCKETS_ANILLO` items. This is the same pre-existing
client-side derivation the app already performed before this change (previously over the 3 spend buckets
only); this change extends its input set to 4 by adding Sin categoría. It is a sanctioned presentation
derivation under ADR-024 — it changes neither the money shown nor how a transaction is classified, only how
already-shown totals are apportioned into wedge angles.

This wedge-proportion value is DISTINCT from `porcentajeBp` — the backend's income-share 50/30/20 metric.
`porcentajeBp` MUST continue to pass through verbatim, unmodified, but ONLY where it is used today:
`BucketViewModel.porcentajeLabel`. `porcentajeBp` is NOT the source of the ring's wedge angles, of the
legend's spend-bucket percentages (`WG5-03`), or of the IDEAL 50/30/20 inset's wedge ratios — the inset
derives its own ratios client-side from `dto.targets` (the wire's hardcoded 50/30/20 reference values,
documented "Hardcoded 50/30/20 reference targets", not period data), computed as
`Math.round((valores[bucket] / total) * 100)` in `DistribucionPie.tsx`'s `slicesIdeales`. This is a third,
pre-existing client-side percentage derivation, distinct from both the ring apportionment and from
`porcentajeBp`, unchanged by this change (design D-02). See `WG5-13` for the semantic consequence of
widening the ring's denominator to include Sin categoría.

Ingresos MUST NOT appear as a ring wedge — it is excluded by construction (its item never enters the ring's
data set), not filtered out at render time.

#### Scenario: The ring renders exactly 4 wedges, in the fixed bucket order (jsdom)

- GIVEN a period with data in all 4 spend-and-uncategorized items
- WHEN the dashboard's chart renders
- THEN the ring shows exactly 4 wedges, ordered Necesidades, Deseos, Ahorro, Sin categoría — never a
  5th wedge for Ingresos

#### Scenario: Wedge proportions equal `calcularDistribucionGasto`'s share-of-spending ratio, not `porcentajeBp` (jsdom)

- GIVEN the raw BigInt totals for the 4 `BUCKETS_ANILLO` items
- WHEN the ring's wedge angles are computed
- THEN each wedge's arc is proportional to that item's share of the combined ring total, apportioned via
  `calcularDistribucionGasto`'s existing largest-remainder rule so the four wedges sum to exactly 100 —
  never derived from `porcentajeBp`

#### Scenario: Ingresos never appears as a ring wedge, even when it is the largest amount (jsdom)

- GIVEN a period where `totalIngreso` is larger than any spend bucket's total
- WHEN the ring renders
- THEN it still shows only the 4 wedges above — Ingresos has no ring representation at any amount

### Requirement: WG5-02 — `PeriodoSelector` stays page-level and unchanged; the semáforo tag renders in the chart card's own header row — an accepted deviation from the wireframe's single combined row (CA-01, CA-03)

`PeriodoSelector` MUST remain exactly where it already lives — at the page level in `ResumenPage`, governed
unchanged by `WPER-01..07`/`WMYP-01..08` — and MUST NOT be relocated into the chart card; this change makes
no change to that component or its requirements. This is an intentional, accepted deviation from the
wireframe: the wireframe draws the month label and the semáforo tag on a single combined row above the
chart, but this change does not relocate `PeriodoSelector` to achieve that literal layout. Instead, the
semáforo tag (`WG5-07`) renders in the chart card's OWN header row, next to the card's title, per the
design's component placement. The net reading — a period control above the card, and a semáforo tag on the
card's own header — is the approved interim layout for this change; a future US may revisit the exact
wireframe row composition, but this change MUST NOT attempt the relocation.

#### Scenario: `PeriodoSelector` remains page-level, unchanged (jsdom)

- GIVEN the redesigned dashboard
- WHEN the page and the chart card render
- THEN `PeriodoSelector` renders once, at the page level, exactly as `WPER-01..07`/`WMYP-01..08` already
  specify — no forked copy, no relocation into the chart card, no divergent behavior introduced by this
  change

#### Scenario: The semáforo tag renders in the chart card's header row, not the page-level selector row (jsdom)

- GIVEN the redesigned chart card
- WHEN it renders
- THEN the semáforo tag (`WG5-07`) appears in the card's own header row, next to the card's title — this
  is the accepted layout deviation from the wireframe's single combined row, not a defect

### Requirement: WG5-03 — Legend renders exactly 5 rows, in a fixed order, with a divider between spend items and the remainder (CA-02)

The legend MUST render exactly 5 rows in this fixed order: Necesidades, Deseos, Ahorro (each shaped
`name · % · CLP amount` with a color dot and a chevron, clickable), a visual divider, Ingresos (shaped
`name · CLP amount` — no `%` — not clickable), and Sin categoría (shaped `name · N tx · CLP amount` with a
chevron, clickable), where `N` is `cantidadSinCategoria` from the wire response. The 3 spend-bucket
percentages MUST be the same ring-share value the ring itself uses for that bucket (`WG5-01`) —
`calcularDistribucionGasto`'s client-side share-of-spending apportionment over the 4 `BUCKETS_ANILLO`
totals, not `porcentajeBp`. The legend performs no independent percentage computation of its own; it reuses
the ring's own value.

The Sin categoría legend row's `%`-omission is scoped to the LEGEND row only. The ring's on-wedge label
follows the same uniform `≥5 %` rule for all 4 wedges (pre-existing `showLabels` behavior in `DistribucionPie.tsx`, kept unchanged per design D-08) — the Sin categoría wedge shows its
on-wedge percentage exactly like any other wedge when its share is `≥5 %`; only the legend row drops the
`%` in favor of the transaction count.

The divider between the spend-bucket rows and the Ingresos/Sin categoría rows is viewport-conditional: it
MUST render at the desktop tier (`lg:` and above, ≥1024px) and MUST NOT render at the T1 tablet tier
(768–1023px) or below — a CSS-only conditional (e.g. `hidden lg:block`), never JS branching. This mirrors a
documented wireframe difference between the T1 tablet mock (no divider) and the desktop mock (divider
present); see `WG5-10` for the rendered-geometry proof.

#### Scenario: Exactly 5 rows render in the fixed order (jsdom)

- GIVEN a period with data across all items
- WHEN the legend renders
- THEN it shows exactly 5 rows in order: Necesidades, Deseos, Ahorro, [divider], Ingresos, Sin categoría

#### Scenario: Each spend-bucket row shows name, percentage, amount, and a chevron, and is clickable (jsdom)

- GIVEN the Necesidades row
- WHEN it renders
- THEN it shows the bucket name, its ring-share percentage (the same value driving its wedge, `WG5-01`),
  its CLP amount, a color dot, and a chevron, and activating it triggers the existing drill-down (`WCAT-01`)

#### Scenario: The Ingresos row has no percentage and is not clickable (jsdom)

- GIVEN the Ingresos row
- WHEN it renders
- THEN it shows only the name and the CLP amount (no `%`, no chevron) and is not a `<button>` or other
  interactive/focusable control

#### Scenario: The Sin categoría row shows its transaction count from `cantidadSinCategoria` (jsdom)

- GIVEN a period where the backend reports `cantidadSinCategoria: 7`
- WHEN the Sin categoría legend row renders
- THEN it shows the name, `7` as its transaction count, its CLP amount, and a chevron, and activating it
  triggers the existing drill-down (`WCAT-01`) exactly like a spend-bucket row

### Requirement: WG5-04 — Sign prefix is a pure client-side derivation by item kind; backend magnitudes stay unsigned (CA-02, ADR-024)

Amount rendering MUST prefix `−` for the 3 spend buckets and Sin categoría, and `+` for Ingresos. This sign
MUST be chosen by the view-model from the item's kind (spend/uncategorized vs. income) — never read off the
wire, since the backend continues to send unsigned magnitudes for every amount field (`total`,
`totalIngreso`). No other client-side derivation beyond sign prefix, CLP formatting, and labels is permitted
on these amounts (ADR-024 guard, same boundary `WG5-01` states for percentages/estado).

#### Scenario: Spend buckets and Sin categoría render a minus sign (jsdom)

- GIVEN the Necesidades, Deseos, Ahorro, and Sin categoría rows
- WHEN their amounts render
- THEN each is prefixed with `−`, even though the backend's `total`/equivalent field for each is an
  unsigned magnitude

#### Scenario: Ingresos renders a plus sign (jsdom)

- GIVEN the Ingresos row
- WHEN its amount renders
- THEN it is prefixed with `+`, derived from the row being the Ingresos kind — not from any sign present on
  `totalIngreso` itself (which stays unsigned on the wire)

### Requirement: WG5-05 — `esResumenMesDto` gains a `cantidadSinCategoria` guard, and the view-model maps a real zero as a real zero, never an omission (CA-02)

`esResumenMesDto` (`apps/web/src/api/client.ts`) does not currently validate `cantidadSinCategoria` — a
payload missing the field, or carrying it as the wrong type, passes the guard unchanged today. Extending
`esResumenMesDto` to require `typeof cantidadSinCategoria === 'number'` (alongside the pre-existing
`totalIngreso` check) IS IN SCOPE of this change, since the legend now depends on the field and a payload
that silently lacks it must be rejected the same way any other structurally invalid `ResumenMesDto` already
is. Once a valid payload is guaranteed, the view-model MUST map `cantidadSinCategoria` and `totalIngreso`
into the legend's Sin categoría and Ingresos rows respectively, and `cantidadSinCategoria: 0` MUST map to a
genuine, rendered zero — the view-model MUST treat a valid zero as data, not as a signal that the field is
absent, and MUST NOT silently render a row that looks identical to an omitted one.

#### Scenario: A payload missing `cantidadSinCategoria`, or carrying the wrong type, is rejected by the DTO guard (jsdom)

- GIVEN a `/api/resumen` payload that omits `cantidadSinCategoria`, or sends it as a non-number
- WHEN `esResumenMesDto` validates the payload
- THEN it returns `false`, and the existing error path (the same one `WAC-02` already exercises for other
  malformed fields) handles it — no new error-handling code is introduced

#### Scenario: `cantidadSinCategoria: 0` is mapped as a real zero, not treated as an omitted field (jsdom)

- GIVEN a period where every transaction is categorized (`cantidadSinCategoria: 0`)
- WHEN the legend renders
- THEN the Sin categoría row still renders, showing `0` transactions and its (zero) amount — the
  view-model treats the valid zero as data, and the row is never omitted

### Requirement: WG5-06 — Ingresos has no drill-down in this change; the interim is documented in code (CA-04)

Unlike the 3 spend buckets and Sin categoría — whose click-to-drill-down behavior is unchanged and fully
governed by `WCAT-01..05` — the Ingresos legend row MUST NOT be clickable, MUST NOT be a focusable
interactive element, and MUST NOT trigger any panel change or navigation. The interim nature of this
decision (no Ingresos drill-down exists yet) MUST be documented as a comment at the Ingresos row's
implementation site, not left implicit.

#### Scenario: Activating the Ingresos row (mouse or keyboard) does nothing (jsdom)

- GIVEN the Ingresos legend row
- WHEN the user clicks it, or tabs to it and presses Enter/Space
- THEN no panel change occurs, no navigation occurs, and — for the keyboard case — the row is skipped by
  Tab entirely, since it carries no interactive role

#### Scenario: Sin categoría and the 3 spend buckets are unaffected by the Ingresos interim (jsdom)

- GIVEN the same legend render
- WHEN the user clicks the Sin categoría row or any spend-bucket row
- THEN the existing inline drill-down panel swap fires exactly as `WCAT-01` already specifies — this
  change adds no new drill-down behavior for those 4 rows

### Requirement: WG5-07 — The semáforo is a clickable tag at the chart's top-right, navigating to `/semaforo` — a TRANSVERSAL rule for every chart, not only this one (CA-03)

The semáforo indicator MUST render as a clickable tag (`Semáforo: {estado} ›`, using the same Spanish
state label `SemaforoBadge` already exposes — `Verde`/`Amarillo`/`Rojo`) positioned at the dashboard main
chart's top-right, replacing today's static, non-interactive badge. Activating it (click or keyboard) MUST
navigate to `/semaforo`. This is a TRANSVERSAL rule: the semáforo is a clickable entry point on ANY chart
that renders it, not a decorative badge scoped to this one card — a future chart that renders a semáforo
indicator MUST make it a clickable tag with the same navigation target, not reintroduce a static badge.

#### Scenario: The tag renders at the chart's top-right with the state-labeled copy (jsdom)

- GIVEN a period with `estadoGlobal: 'verde'`
- WHEN the dashboard's main chart renders
- THEN a clickable tag reading `Semáforo: Verde ›` (or the equivalent for the current state) renders at the
  chart's top-right

#### Scenario: Activating the tag navigates to `/semaforo`, by mouse or keyboard (jsdom)

- GIVEN the semáforo tag is rendered
- WHEN the user clicks it, or tabs to it and activates it with Enter/Space
- THEN the app navigates to `/semaforo`

### Requirement: WG5-08 — A `null` `estadoGlobal` renders the tag as "Semáforo: Sin datos ›", still a navigable link, mirroring the existing "Sin datos" precedent (CA-03)

WHEN `estadoGlobal` is `null` (e.g. an empty-data period), the semáforo tag MUST still render as a
navigable `<Link>` — never omitted from the layout, never disabled, never a non-interactive element —
using the existing "Sin datos" treatment `SemaforoBadge` already applies for a `null` state. Activating it
MUST navigate to `/semaforo` exactly like any other state, per `WG5-07`; the destination page owns
explaining the no-data state, not the tag. Its accessible name MUST reflect the "Sin datos" label so
assistive technology conveys the same information as the visible text. This mirrors the existing SIN_DATOS
badge precedent (a distinct, always-rendered state, never coerced into a colored state) — extended here to
keep the tag a single, always-navigable control rather than introducing a disabled or hidden variant.

#### Scenario: An empty period renders a navigable "Sin datos" tag that still navigates to `/semaforo` (jsdom)

- GIVEN a period where `estadoGlobal` is `null`
- WHEN the dashboard's main chart renders
- THEN the semáforo tag renders showing `Semáforo: Sin datos ›`, exposes an accessible name reflecting
  "Sin datos", and activating it (click or keyboard) navigates to `/semaforo` exactly as any other state

### Requirement: WG5-09 — The `/semaforo` stub route renders an explicit "under construction" state, never blank or a 404 (CA-03 risk mitigation)

This change MUST introduce a new `/semaforo` route (a thin-container route per the existing
`buckets.$bucket.tsx` precedent) that renders an explicit, non-blank "en construcción" state. Its content is
out of scope for this change (US-049 fills it) — this requirement only governs that the route exists, is
session-protected like every other `_authenticated` route, and never presents a dead-end (blank page or
404) between this change shipping and US-049 landing.

#### Scenario: Navigating to `/semaforo` shows an explicit non-blank stub, not a 404 (jsdom)

- GIVEN an authenticated session
- WHEN the user navigates to `/semaforo` (via the semáforo tag or directly)
- THEN a specified "en construcción" state renders — not a blank page, not a 404

#### Scenario: `/semaforo` is session-protected like every other authenticated route (jsdom)

- GIVEN no active session
- WHEN the browser navigates to `/semaforo`
- THEN it redirects to `/login?redirect=/semaforo`, via the existing `_authenticated` guard — no new guard
  code is introduced

### Requirement: WG5-10 — The T1 tablet variant renders correctly, verified by rendered geometry at a real viewport, never by className presence alone (CA-05)

The dashboard main chart card MUST render a T1 tablet layout variant within the tablet tier this spec
already establishes elsewhere (`WCTM-01`: 768–1023px, expressed as literal `md:`-prefixed utilities on the
chart card, no new entry in `layout.ts`, no `AppShell` change). Verification MUST assert against real
rendered geometry/layout at a tablet viewport width — asserting only that a `md:`-prefixed class string is
present in the markup does NOT prove the variant is in effect at that width, the exact gap that shipped
`WCTG-14` false.

#### Scenario: The tablet variant renders at a representative tablet width (Playwright)

- GIVEN the viewport is within the tablet tier (768–1023px)
- WHEN the dashboard's main chart card renders
- THEN it matches the wireframe's tablet (T1) layout variant, asserted by rendered/computed geometry at
  that real viewport — including that the legend's divider between the spend-bucket rows and
  Ingresos/Sin categoría is NOT rendered (absent from the visual/accessible tree) at this viewport,
  distinguishing T1 from the desktop layout, where it is rendered (`WG5-03`)

#### Scenario: A `md:`-prefixed class existing in markup is not sufficient proof of the tablet variant (Playwright, anti-pattern named)

- GIVEN a hypothetical implementation where both the desktop and tablet class variants exist simultaneously
  in the rendered markup, one inactive at the current viewport
- WHEN the T1 variant is verified
- THEN the assertion is made against rendered/computed layout at a real viewport — never against the mere
  presence of a `md:`-prefixed string in the DOM, which is exactly the class of gap that shipped `WCTG-14`
  false and MUST NOT be repeated here

#### Scenario: The divider stays absent at the mobile viewport too (Playwright)

- GIVEN the viewport is at the mobile tier (360px)
- WHEN the dashboard's main chart card renders
- THEN the legend's divider between the spend-bucket rows and Ingresos/Sin categoría is NOT rendered
  (absent from the visual/accessible tree, zero-area bounding box) at this viewport too — closing the gap
  where `WG5-03`'s "T1 or below" divider-absence text otherwise has no mobile-viewport geometry proof,
  only the tablet one above

### Requirement: WG5-11 — No estado arithmetic, and no percentage computation beyond the sanctioned ring apportionment, exists in `apps/web` for this chart (CA-06, ADR-024)

The ring, legend, and semáforo tag introduced/modified by this change MUST consume `estadoGlobal`/
`estadoSemaforo` verbatim from the wire — no threshold comparison or estado derivation MUST exist
client-side for these values. Percentage handling is scoped precisely to three named exceptions and no
more:

1. The ring's wedge angles and the legend's 3 spend-bucket percentages are the pre-existing, sanctioned
   `calcularDistribucionGasto` share-of-spending apportionment (`WG5-01`/`WG5-03`; an ADR-024
   presentation-only derivation, extended in this change to 4 items including Sin categoría — see
   `WG5-13`).
2. `porcentajeBp` MUST continue to pass through verbatim wherever it is consumed today
   (`BucketViewModel.porcentajeLabel`), with no recomputation.
3. The IDEAL 50/30/20 inset's wedge ratios are a pre-existing, sanctioned client-side derivation over
   `dto.targets` — the wire's hardcoded 50/30/20 reference values, not period totals — computed as
   `Math.round((valores[bucket] / total) * 100)` in `DistribucionPie.tsx`'s `slicesIdeales`. It is NOT
   derived from `porcentajeBp` and is unchanged by this change (design D-02).

No other client-side percentage or estado arithmetic beyond these three named exceptions is permitted. The
only other client-side derivations permitted on chart data are: sign prefix (`WG5-04`), CLP formatting, and
display labels.

#### Scenario: Ring/legend percentages trace to the sanctioned apportionment, `porcentajeLabel` traces to `porcentajeBp` verbatim, the IDEAL inset traces to `targets`, and estado is never recomputed (jsdom)

- GIVEN the backend response for a period
- WHEN the ring's wedge proportions and the legend's spend-bucket percentages are rendered
- THEN each traces to `calcularDistribucionGasto`'s client-side share-of-spending apportionment over raw
  totals (`WG5-01`), never to `porcentajeBp`
- WHEN `BucketViewModel.porcentajeLabel` renders
- THEN it traces directly to `porcentajeBp` verbatim, with no recomputation
- WHEN the IDEAL 50/30/20 inset's wedge ratios render
- THEN each traces to the pre-existing client-side ratio computed over `dto.targets` (the hardcoded
  reference values), never to `porcentajeBp` and never to period totals
- WHEN the semáforo tag's state label renders
- THEN it traces directly to `estadoGlobal` verbatim — with no intermediate bp-threshold or
  percentage-computation logic in `apps/web` beyond the three named exceptions above

### Requirement: WG5-12 — New/touched files pass `eslint-jsx-a11y` at `error` scope; the donut, legend, and semáforo tag are keyboard-operable and accessible (CA-06, WCAG 2.2 AA, ADR-018)

Every file this change touches (`DistribucionPie.tsx`, `LeyendaGasto.tsx`, `SemaforoBadge.tsx`,
`SemaforoTag.tsx`, `ResumenScreen.tsx`, `routes/_authenticated/semaforo*.tsx` — glob, matching design D-10 verbatim) MUST be added to
`eslint.config.js`'s scoped `error`-severity `eslint-jsx-a11y` override, per the existing
US-042/043/063 precedent (`WCFG-12`, `WCTM-*`) and this change's own file list in design `D-10`. The donut
ring's `<svg>` MUST expose an accessible name/description (role
and aria pattern consistent with the existing `SemaforoBadge`'s `role="img"` + `aria-label` convention —
never color alone). The 3 spend-bucket rows and the Sin categoría row MUST remain keyboard-operable
(Tab/Enter/Space), matching their existing `<button>` semantics. The semáforo tag MUST be keyboard-operable
(Tab/Enter/Space) with a visible focus ring.

#### Scenario: The scoped lint gate is clean on every touched file

- GIVEN the files this change touches
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

#### Scenario: The donut ring exposes an accessible name, not color alone (jsdom)

- GIVEN the rendered donut ring
- WHEN it is inspected via the accessibility tree
- THEN it exposes a role and accessible name/description conveying its meaning — not conveyed by color
  alone

#### Scenario: A keyboard-only user can operate every clickable legend row and the semáforo tag (jsdom)

- GIVEN a keyboard-only user tabs through the chart card
- WHEN they reach a spend-bucket row, the Sin categoría row, or the semáforo tag, and activate it with
  Enter or Space
- THEN each behaves identically to its mouse-click behavior, with a visible focus ring at every step — and
  the Ingresos row is never reached by Tab (`WG5-06`)

### Requirement: WG5-13 — Sin categoría entering the ring denominator dilutes the three spend-bucket ring percentages (R-5, CA-06, ADR-024)

Since `BUCKETS_ANILLO` now includes Sin categoría, `calcularDistribucionGasto`'s largest-remainder
apportionment sums across 4 items instead of 3. This MUST be treated as a deliberate, product-approved
semantic change: the Necesidades/Deseos/Ahorro ring percentages (and the matching legend percentages,
`WG5-03`) numerically shrink relative to the previous 3-slice chart whenever Sin categoría carries a
nonzero total, because the same three amounts now share a denominator that also contains a fourth item.
This dilution MUST NOT be treated as a regression to fix — it is the intended reading: a wedge showing 20%
now means "20% of everything in the ring, including what's unclassified," not "20% of my three spend
buckets." This requirement does not change `porcentajeBp` or the 50/30/20 IDEAL inset, which are unaffected
(`WG5-01`, `WG5-11`).

#### Scenario: A period with a non-zero Sin categoría total shows lower ring percentages for the three spend buckets than before this change (jsdom)

- GIVEN a period where Sin categoría carries a non-zero total alongside the three spend buckets
- WHEN the ring's wedge proportions and the legend's spend-bucket percentages are computed
- THEN each of the three spend buckets' shares is smaller than it would be if the denominator excluded Sin
  categoría — this is the intended dilution, not a bug
