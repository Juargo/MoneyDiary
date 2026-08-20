# Delta for web-app

Source: `openspec/changes/us-053-web-detalle-mes-bucket/proposal.md` (US-053, issue #287).
New page requirements use fresh family **`WDM-*`** (Web Detalle Mes) — the `/buckets/:bucket` page is a
new surface, not a modification to the dashboard families. Scenario labels follow the repo precedent:
**(jsdom)** = DOM/text/accessible-name truth; **(Playwright)** = rendered geometry at a real viewport.

## ADDED Requirements

### Requirement: WDM-01 — Detalle MES-BUCKET page structure: breadcrumb, month selector, %/meta tag, usage bar, totals line (CA-01)

For a bucket with data, `/buckets/:bucket` MUST render: a breadcrumb `Dashboard / {bucket}` (back control
below `md`, per WCTM-04's fixed-destination rule); the reused `PeriodoSelector` (WPER-01..07/WMYP-01..08
semantics); a %/meta tag rendering `porcentajeBp`/`metaBp` ONLY through `aPorcentajeLabel`/`SIN_PORCENTAJE_LABEL`
(MBD-01, ADR-024); a usage bar whose markers are presentation-only positions of the wire's `porcentajeBp` and
`metaBp` (no `bandas`, no extra fetch — `ZonaBar` not reused); and a totals line (bucket total via
`formatearMontoCLP` + transaction count). The route's `validateSearch` MUST accept `periodo` and `destacar`.

#### Scenario: Header renders all CA-01 elements for a real bucket (jsdom)

- GIVEN `/buckets/Necesidades?periodo=2026-07` with `metaBp: 5000` and `porcentajeBp: 5500`
- WHEN the page renders
- THEN breadcrumb, `PeriodoSelector`, %/meta tag, usage bar, and totals line are all present

#### Scenario: T1 tablet header geometry renders correctly (Playwright)

- GIVEN the viewport is in the tablet tier (768–1023px)
- WHEN the page renders
- THEN the header matches the wireframe T1 variant, asserted by rendered geometry — never by className
  presence alone (the `WCTG-14`/`WG5-10` gap)

### Requirement: WDM-02 — In-page month navigation and deep-linkable `periodo` (CA-02)

The page's `PeriodoSelector` MUST change the viewed month in-page (prev/next/"Hoy" per WPER-02/03/04),
updating the URL `periodo` search param with no reload and no parallel state source (WPER-05). Arriving with
`?periodo=YYYY-MM` MUST render that month's data; absent `periodo` resolves to the current month (MBD-04).
Navigation MUST remain available on an empty month (WDM-05).

#### Scenario: Arrows change the month in-page and update the URL (jsdom)

- GIVEN `/buckets/Deseos?periodo=2026-07` renders
- WHEN the user activates prev
- THEN the URL `periodo` becomes `2026-06` and the page refetches and renders June data

#### Scenario: A deep link honours `periodo`; absent `periodo` defaults to the current month (jsdom)

- GIVEN a deep link `/buckets/Ahorro?periodo=2026-03`
- WHEN the page loads
- THEN it renders March 2026 data
- AND `/buckets/Ahorro` with no `periodo` renders the current calendar month (MBD-04)

### Requirement: WDM-03 — Category groups render the server's order with expand/collapse and "ver N más…" (CA-03)

Each group MUST render the server's `nombre`, `conteo`, and exact `subtotal` (BigInt-safe string, never
`Number()`/`parseFloat()`), in the server's exact order — es-CL alphabetical, "Sin categoría" last (MBD-02).
The client MUST NOT re-group, re-sort, or truncate the payload. Each group MUST show at most 3 transaction
rows by default; a group with more MUST render a "ver N más…" control (N = remaining rows) that expands to
reveal all rows and collapses back. The control MUST be a real button with `aria-expanded` (hand-rolled,
KISS — no new dependency).

#### Scenario: Default 3 rows, then "ver N más…" expands and collapses (jsdom)

- GIVEN a group with 5 transactions
- WHEN the page renders
- THEN 3 rows are visible and a "ver 2 más…" control renders
- WHEN the control is activated
- THEN all 5 rows show and the control toggles to collapse

#### Scenario: Rendered group order matches the payload verbatim (jsdom)

- GIVEN a payload whose groups arrive ordered Ñoquis, Zapatería, "Sin categoría"
- WHEN the page renders
- THEN the rendered order is identical — no client-side re-sort

### Requirement: WDM-04 — Sin categoría group highlight via `?destacar=` and structural no-%/meta (CA-04, decision 2, MBD-03)

WHEN the page is reached with the `destacar` search param, the Sin categoría group MUST render visually
highlighted. The %/meta TAG MUST NOT render only for the SinCategoria bucket (`metaBp` null); the usage
BAR MUST NOT render whenever `porcentajeBp` is null — a no-income month (`porcentajeBp: null`, `metaBp`
non-null) keeps the tag rendered as `SIN_PORCENTAJE_LABEL` (MBD-03, WDM-01).

#### Scenario: Arrival with `destacar` highlights the Sin categoría group (jsdom)

- GIVEN navigation from the dashboard's Sin categoría chart item carrying a `destacar` search param
- WHEN the page renders
- THEN the Sin categoría group carries the highlight; a plain arrival (no `destacar`) renders no highlight

#### Scenario: SinCategoria bucket renders no %/meta and no usage bar (jsdom)

- GIVEN `/buckets/SinCategoria` with null `metaBp`/`porcentajeBp`
- WHEN the page renders
- THEN no %/meta tag and no usage bar render

### Requirement: WDM-05 — Explicit empty-month state (decision 4)

WHEN the viewed bucket has zero transactions for the viewed month (MBD-01: 200, zeroed totals, empty
`grupos`), the page MUST render the explicit empty state — the header with zeroed totals PLUS the copy
`Sin movimientos en {mes}` — with `PeriodoSelector` navigation preserved. A broken/empty group list MUST
NOT render.

#### Scenario: An empty bucket month renders zeros, the copy, and live navigation (jsdom)

- GIVEN Ahorro has zero transactions in `2026-07`
- WHEN `/buckets/Ahorro?periodo=2026-07` renders
- THEN the header shows 0 total and 0 transactions, `Sin movimientos en julio 2026` renders, no groups
  render, and the month arrows remain operable

### Requirement: WDM-06 — Dashboard wiring: pie/legend navigate; US-047 interim panel retired (CA-05)

Clicking a spend-bucket or Sin categoría pie wedge or legend row MUST navigate to `/buckets/{bucket}`
carrying the current `periodo` search param — never swap an inline panel (WCAT-01). The Sin categoría item
MUST additionally carry `destacar` (WDM-04). The US-047 interim panel MUST be retired: `ResumenScreen` MUST
have no bucket-selection state and no inline detail panel.

#### Scenario: A spend-bucket row navigates without `destacar` (jsdom)

- GIVEN the dashboard is viewing `2026-07`
- WHEN the user clicks the Deseos legend row
- THEN the URL becomes `/buckets/Deseos?periodo=2026-07` (no `destacar`) and no panel swaps

#### Scenario: The Sin categoría row navigates carrying `destacar` (jsdom)

- GIVEN the dashboard is viewing `2026-07`
- WHEN the user clicks the Sin categoría row
- THEN the URL becomes `/buckets/SinCategoria?periodo=2026-07&destacar=…` and the group highlights on arrival

### Requirement: WDM-07 — Reclassify is ported per row with a new invalidation key (decision 1)

The page MUST port `ReclasificarCategoriaControl` per transaction row with the WCAT-04/05 behavior
unchanged (live catalog, cross-bucket confirmation, a11y). `useReclasificarCategoria` MUST invalidate
`['detalle-bucket-mes', bucket, clave]` on success, REPLACING the retired `['detalle-bucket', bucket, clave]`
(design D-05/D-08: the flat chain is deleted, so the old key would match zero queries) — the set becomes
`['resumen', clave]`, `['detalle-bucket-mes', bucket, clave]`, `['resumen-anual']` (net: 3 keys, no dead
invalidation) — so a successful reclassify on the page refreshes the page's own query.

#### Scenario: A successful reclassify invalidates the page's key (jsdom)

- GIVEN a transaction row on `/buckets/Deseos`
- WHEN a reclassify mutation succeeds
- THEN `['detalle-bucket-mes', 'Deseos', clave]` is invalidated and the page's groups re-render with fresh
  data; the pre-existing resumen keys invalidate as before

### Requirement: WDM-08 — ADR-024: no client % arithmetic beyond `aPorcentajeLabel`; markers are presentation-only (decision 5)

The page MUST NOT perform any percentage computation beyond `aPorcentajeLabel` (bp → display label). Usage-bar
marker positions MUST be presentation-only positions derived from the wire's `porcentajeBp`/`metaBp` — no
ratio recomputation, no threshold logic, no client-side business-rule duplication (the WG5-11 boundary,
extended to this page).

#### Scenario: The only bp derivation is `aPorcentajeLabel` (jsdom)

- GIVEN the page's source
- WHEN it is inspected
- THEN the only bp→label derivation is `aPorcentajeLabel`/`SIN_PORCENTAJE_LABEL`, and marker positions are
  computed directly from the wire values as presentation

## MODIFIED Requirements

### Requirement: WCAT-01 — Clicking a bucket shows only that bucket's transactions

Clicking a pie slice or legend entry MUST navigate to that bucket's Detalle MES-BUCKET page
(`/buckets/{bucket}`, WDM-06), carrying the current `periodo` search param, so the page shows ONLY the
clicked bucket's transactions for the selected period — not all buckets at once. The dashboard MUST NOT
swap an inline panel.
(Previously: clicking swapped the dashboard's right inline panel (US-047 interim) to show the bucket's
transactions; the panel is retired by this change.)

#### Scenario: Clicking Deseos shows only Deseos transactions

- GIVEN the dashboard is viewing period `2026-07`
- WHEN the user clicks the Deseos pie slice
- THEN the URL becomes `/buckets/Deseos?periodo=2026-07` and the page shows only Deseos transactions, none
  from other buckets

### Requirement: WCAT-02 — The page's groups come from the backend, ordered without a hardcoded enum

The Detalle MES-BUCKET page MUST render the bucket's transactions grouped by `categoria`, with grouping and
ordering provided by the backend (`bucket-detalle-mes` MBD-02) — the client MUST NOT re-group or re-sort.
Each group header MUST show the categoría name, its transaction count, and its exact subtotal (from
string/BigInt amounts, never `Number()`/`parseFloat()`). Rows with no categoría render under a
"Sin categoría" group. Group order MUST be data-driven — alphabetical by categoría `nombre` — with the
"Sin categoría" group always rendered last, regardless of its count. The ordering MUST NOT read a static
`ORDEN_CATEGORIAS` enum (retired by this change, §7); a user-created or renamed categoría MUST sort
correctly with no ordering-code change.
(Previously: group order was implicit, driven by the hardcoded `ORDEN_CATEGORIAS.indexOf` enum in
`domain/categoria.ts`; that enum is retired by this change, §7.)
(Previously: this requirement governed the retired US-047 panel's client-side grouping of the flat US-017
endpoint; the page now renders the grouped endpoint verbatim (WDM-03), and the guarantees move to the
server contract MBD-02.)

#### Scenario: Necesidades page groups by its 5 categorías

- GIVEN Necesidades has transactions in Supermercado, Farmacia, and Transporte this period
- WHEN the page renders
- THEN exactly those 3 categoría groups appear, each with its own count and exact subtotal

#### Scenario: Subtotal precision survives large amounts

- GIVEN a group contains a transaction beyond `Number.MAX_SAFE_INTEGER`
- WHEN the group's subtotal is computed
- THEN every digit is preserved (BigInt/integer arithmetic, not float)

#### Scenario: A newly created categoría sorts alphabetically with no code change

- GIVEN a user creates categoría "Zapatería" in Deseos alongside existing "Delivery" and "Streaming"
- WHEN the Deseos page renders
- THEN groups appear alphabetically (`Delivery`, `Streaming`, `Zapatería`), with no ordering constant updated

#### Scenario: Sin categoría group always renders last

- GIVEN a bucket page whose payload has both categorized and uncategorized groups
- WHEN the page renders
- THEN the "Sin categoría" group appears after every named categoría group, per the server's order (MBD-02)

### Requirement: WCAT-03 — Empty states are explicit on the page and preserved on the dashboard

If the viewed bucket has zero transactions for the viewed period, the Detalle MES-BUCKET page MUST render
the explicit month empty state — header with zeroed totals plus the copy `Sin movimientos en {mes}`, with
month navigation preserved (WDM-05). The dashboard's existing period-empty state for a zero-transaction
period MUST remain unchanged.
(Previously: the empty state lived in the retired US-047 inline panel — "the panel shows the existing 'no
movements' empty state"; the page's explicit month empty state is new.)

#### Scenario: A bucket with zero transactions this period shows the explicit empty state

- GIVEN Ahorro has zero transactions for the viewed month
- WHEN the user opens `/buckets/Ahorro?periodo=<month>`
- THEN the header shows zeroed totals, `Sin movimientos en {mes}` renders, and month navigation remains
  available

### Requirement: WCAT-04 — Reclassify control is active, data-driven, and updates data on success

The per-row reclassify control MUST no longer be a disabled placeholder: activating it MUST let the user
choose a categoría (offered as ALL of the caller's own categorías, grouped by bucket, sourced from
`useCategorias()` — the live query this change introduces — never a hardcoded list) and call the
`categorias-api` reclassify endpoint. `ReclasificarCategoriaControl` MUST derive the destination bucket
from the chosen categoría's own `bucket` field in the DTO, not a static name→bucket map. When the chosen
categoría's bucket differs from the transaction's current bucket, the control MUST show a confirmation
naming the exact money move (e.g. "Esto mueve $X de Deseos a Necesidades") before committing; same-bucket
reclassification MUST commit immediately without a confirmation step. On success, the page's group list
AND the resumen (pie/traffic-light) MUST refresh to reflect the new categoría/bucket (the page's own query
refreshes via the new invalidation key, WDM-07). The SinCategoria "Clasificar" CTA MUST behave the same
way via the same control. A categoría created, renamed, or deleted through `/configuracion/categorias`
MUST be reflected here with no code change (`domain/categoria.ts`'s hardcoded exports are removed, §7).
(Previously: the dropdown and bucket-move logic were backed by `domain/categoria.ts`'s hardcoded
`ORDEN_CATEGORIAS`/`CATEGORIA_BUCKET`, which could offer a deleted categoría, omit a newly created one, or
misfire/skip the cross-bucket confirmation after a re-bucket, §7.)
(Previously: this requirement named "the panel's transaction list" as the refresh target; the control is
ported to the Detalle MES-BUCKET page unchanged — its render site is the page's group list.)

#### Scenario: A successful within-bucket reclassify updates the group counts

- GIVEN a transaction shown under "Delivery" in the Deseos page's group list
- WHEN the user reclassifies it to "Streaming" via the control
- THEN it commits immediately (no confirmation dialog), moves to the "Streaming" group, and both groups'
  counts/subtotals update, with no change to the Deseos pie slice

#### Scenario: A cross-bucket reclassify requires confirmation and then updates the resumen

- GIVEN a transaction shown under Deseos is being reclassified to a Necesidades categoría
- WHEN the user selects the target categoría
- THEN a confirmation naming the money move is shown before anything commits
- WHEN the user confirms
- THEN the transaction disappears from the Deseos page and the resumen/traffic-light reflects the updated
  bucket totals

#### Scenario: Cancelling a cross-bucket confirmation leaves the UI unchanged

- GIVEN the cross-bucket confirmation dialog is showing
- WHEN the user cancels (or presses Escape)
- THEN no request is sent and the transaction stays in its original group

#### Scenario: A failed reclassify leaves the UI unchanged

- GIVEN the reclassify endpoint returns an error (e.g. cross-tenant/invalid categoría)
- WHEN the user attempts the reclassify
- THEN the transaction stays in its original group and an error is communicated to the user

#### Scenario: A just-created categoría is offered by the dropdown immediately

- GIVEN a user creates categoría "Mascotas" via `/configuracion/categorias`
- WHEN they open a bucket's Detalle MES-BUCKET page and open the reclassify control on any transaction
- THEN "Mascotas" appears in the dropdown, grouped under its bucket, via the existing `['categorias']` cache
  — no code change

#### Scenario: A deleted categoría is no longer offered

- GIVEN a user deletes categoría "Delivery" via `/configuracion/categorias`
- WHEN they return to the Detalle MES-BUCKET page and open the reclassify control
- THEN "Delivery" no longer appears in the dropdown

#### Scenario: A re-bucketed categoría triggers the confirmation correctly

- GIVEN a user moves categoría "Supermercado" from Necesidades to Deseos via the edit screen
- WHEN they reclassify a Necesidades transaction to "Supermercado" on the Detalle MES-BUCKET page
- THEN the cross-bucket confirmation fires (Necesidades→Deseos), because the dropdown derives the bucket
  from the live DTO, not a stale map

### Requirement: WCTG-09 — Invalidation matrix is asymmetric by mutation kind, with the exclusion enforced (CA-05, §6)

Two profiles apply. **Profile A** (all three pattern mutations: create/update/delete a pattern) MUST
invalidate ONLY `['categorias']`. **Profile B** (all three category mutations: create/rename/re-bucket/
delete a category) MUST invalidate `['categorias']` PLUS the three broad dashboard prefix keys
`['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']` (no period/bucket segment appended). A pattern
mutation MUST NOT invalidate any of the three dashboard keys — the exclusion now names the renamed
`['detalle-bucket-mes']` key — this exclusion is deliberate (pattern CRUD has zero effect on any persisted
transaction) and MUST be its own asserted, testable behavior, not an implied absence. After a successful
delete from the edit screen, the user MUST be navigated back to the list.
(Previously: the bucket-drill-down key was named `['detalle-bucket']` literally; US-053 retires the flat
`detalle-bucket` web chain (design D-08) and the matrix must refresh the new month-scoped page instead, so
the key is renamed `['detalle-bucket-mes']` — the same rename `invalidarCatalogoYDashboard` lands in PR3.)

#### Scenario: A pattern mutation invalidates only the catalog

- GIVEN a pattern is added, edited, or deleted
- WHEN the mutation resolves
- THEN `['categorias']` is invalidated

#### Scenario: A pattern mutation does NOT invalidate the dashboard (the exclusion, renamed key)

- GIVEN a pattern is added, edited, or deleted
- WHEN the mutation resolves
- THEN `['resumen']`, `['resumen-anual']`, and `['detalle-bucket-mes']` are NOT invalidated — asserted
  explicitly, not inferred from their absence in a different test

#### Scenario: A category mutation invalidates the catalog and all three dashboard keys (renamed)

- GIVEN a category is created, renamed, re-bucketed, or deleted
- WHEN the mutation resolves
- THEN `['categorias']`, `['resumen']`, `['resumen-anual']`, and `['detalle-bucket-mes']` are all
  invalidated

### Requirement: WPER-05 — Changing the period routes through the URL param; the selection-reset effect is retired

Any period change performed through prev, next, or "Hoy" MUST route through the URL search param path — on
the dashboard and on the Detalle MES-BUCKET page's `PeriodoSelector` — with no parallel state source
introduced for period (WDM-02). The US-047 bucket-selection-reset effect in `ResumenScreen` is retired with
the panel: there is no selection state left to reset (WDM-06).
(Previously: the requirement existed to keep the pre-existing bucket-selection-reset effect firing
unchanged; the effect is gone with the interim panel — the URL-param routing clause survives.)

#### Scenario: A period change always updates the URL param, nowhere else

- GIVEN the dashboard (or the Detalle MES-BUCKET page) is viewing `2026-07`
- WHEN the user navigates via prev, next, or "Hoy"
- THEN the URL `periodo` param changes, a refetch occurs, and no parallel state source holds the period

### Requirement: WG5-03 — Legend renders exactly 5 rows, in a fixed order, with a divider between spend items and the remainder (CA-02)

The legend MUST render exactly 5 rows in this fixed order: Necesidades, Deseos, Ahorro (each shaped
`name · % · CLP amount` with a color dot and a chevron, clickable), a visual divider, Ingresos (shaped
`name · CLP amount` — no `%` — not clickable), and Sin categoría (shaped `name · N tx · CLP amount` with a
chevron, clickable), where `N` is `cantidadSinCategoria` from the wire response. The 3 spend-bucket
percentages MUST be the same ring-share value the ring itself uses for that bucket (`WG5-01`) —
`calcularDistribucionGasto`'s client-side share-of-spending apportionment over the 4 `BUCKETS_ANILLO`
totals, not `porcentajeBp`. The legend performs no independent percentage computation of its own; it reuses
the ring's own value. Activating a clickable row MUST navigate to that bucket's Detalle MES-BUCKET page
(`WCAT-01`, `WDM-06`) — never swap an inline panel.

The Sin categoría legend row's `%`-omission is scoped to the LEGEND row only. The ring's on-wedge label
follows the same uniform `≥5 %` rule for all 4 wedges (pre-existing `showLabels` behavior in
`DistribucionPie.tsx`, kept unchanged per design D-08) — the Sin categoría wedge shows its
on-wedge percentage exactly like any other wedge when its share is `≥5 %`; only the legend row drops the
`%` in favor of the transaction count.

The divider between the spend-bucket rows and the Ingresos/Sin categoría rows is viewport-conditional: it
MUST render at the desktop tier (`lg:` and above, ≥1024px) and MUST NOT render at the T1 tablet tier
(768–1023px) or below — a CSS-only conditional (e.g. `hidden lg:block`), never JS branching. This mirrors a
documented wireframe difference between the T1 tablet mock (no divider) and the desktop mock (divider
present); see `WG5-10` for the rendered-geometry proof.
(Previously: activating a clickable row swapped the dashboard's inline US-047 panel; this change retires
the panel — rows now navigate to the Detalle MES-BUCKET page.)

#### Scenario: Exactly 5 rows render in the fixed order (jsdom)

- GIVEN a period with data across all items
- WHEN the legend renders
- THEN it shows exactly 5 rows in order: Necesidades, Deseos, Ahorro, [divider], Ingresos, Sin categoría

#### Scenario: Each spend-bucket row shows name, percentage, amount, and a chevron, and is clickable (jsdom)

- GIVEN the Necesidades row
- WHEN it renders
- THEN it shows the bucket name, its ring-share percentage (the same value driving its wedge, `WG5-01`),
  its CLP amount, a color dot, and a chevron, and activating it navigates to `/buckets/Necesidades` with
  the current `periodo` (`WCAT-01`, `WDM-06`)

#### Scenario: The Ingresos row has no percentage and is not clickable (jsdom)

- GIVEN the Ingresos row
- WHEN it renders
- THEN it shows only the name and the CLP amount (no `%`, no chevron) and is not a `<button>` or other
  interactive/focusable control

#### Scenario: The Sin categoría row shows its transaction count from `cantidadSinCategoria` (jsdom)

- GIVEN a period where the backend reports `cantidadSinCategoria: 7`
- WHEN the Sin categoría legend row renders
- THEN it shows the name, `7` as its transaction count, its CLP amount, and a chevron, and activating it
  navigates to `/buckets/SinCategoria` with the current `periodo` plus `destacar` (`WDM-04`, `WDM-06`)

### Requirement: WG5-06 — Ingresos has no drill-down in this change; the interim is documented in code (CA-04)

Unlike the 3 spend buckets and Sin categoría — whose click-to-navigate behavior is fully governed by
`WCAT-01..05` and `WDM-06` — the Ingresos legend row MUST NOT be clickable, MUST NOT be a focusable
interactive element, and MUST NOT trigger any navigation. The interim nature of this decision (no Ingresos
drill-down exists yet) MUST be documented as a comment at the Ingresos row's implementation site, not left
implicit.
(Previously: the 4 clickable rows' behavior was an inline panel drill-down "unchanged" by US-049; this
change turns that drill-down into navigation, so the Ingresos exclusion is restated against navigation.)

#### Scenario: Activating the Ingresos row (mouse or keyboard) does nothing (jsdom)

- GIVEN the Ingresos legend row
- WHEN the user clicks it, or tabs to it and presses Enter/Space
- THEN no navigation occurs, and — for the keyboard case — the row is skipped by Tab entirely, since it
  carries no interactive role

#### Scenario: Sin categoría and the 3 spend buckets navigate instead (jsdom)

- GIVEN the same legend render
- WHEN the user clicks the Sin categoría row or any spend-bucket row
- THEN the row navigates to its bucket's Detalle MES-BUCKET page exactly as `WCAT-01`/`WDM-06` specify —
  navigation is the only drill-down behavior those 4 rows have after this change

### Requirement: WTA-03 — Existing data-month navigation survives the DOM restructure (regression, CA-03)

*(Verification-only. `MesCelda` click → `onSelectPeriodo` → `WPER-*`/`WMYP-*` plumbing already switches the
main chart, no reload, preserving drill-down via the URL-param period state; the US-047 bucket-selection
reset is retired with the panel (WDM-06). This change restructures `MesCelda`'s DOM (`WTA-05`); this
requirement pins that behavior against regression — no wiring is rebuilt.)*

A data-month click/keyboard-activation MUST switch the viewed period and re-render the main chart with no
reload, preserving existing drill-down (now navigation per `WCAT-01`); there is no bucket-selection state
to reset (panel retired, `WDM-06`).
(Previously: the requirement preserved "existing drill-down and bucket-selection reset"; the selection
state was retired with the US-047 panel.)

#### Scenario: Clicking a data month switches the main chart without reload (jsdom)

- GIVEN a month cell with data, not selected
- WHEN the user clicks or keyboard-activates it
- THEN the main chart re-renders for that month via the URL period param, no reload, with no selection
  state to clear (`WDM-06`)
