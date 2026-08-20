# Delta for web-app

Source: `openspec/changes/us-054-web-detalle-mes-ingresos/proposal.md` (US-054, issue #288).
New page requirements use fresh family **`WDI-*`** (Web Detalle Ingresos) — the `/ingresos` page is a new
surface, not a modification to the dashboard families (`WG5-*`) or the bucket-page family (`WDM-*`).
Scenario labels follow the repo precedent: **(jsdom)** = DOM/text/accessible-name truth; **(Playwright)** =
rendered geometry at a real viewport.

Capabilities with NO delta (proposal §Capabilities): `ingresos-detalle-mes` (MID-01..06, shipped and
archived by US-052) and `user-data-isolation` — the page consumes the wire contract as-is and the backend
is untouched. (US-053 precedent: a backend delta was only written where the backend's own contract changed;
here it does not — the endpoint merely gains a web consumer.)

## ADDED Requirements

### Requirement: WDI-01 — Ingresos page structure: breadcrumb, month + arrows, "N ingresos" tag, positive total, "Sin meta ni semáforo" note (CA-01)

For a month with income, `/ingresos` MUST render: a breadcrumb `Dashboard / Ingresos` whose back/Dashboard
control navigates to `/` carrying `search={{ periodo }}` — a hand-rolled typed `Link` (NOT `BotonVolver`,
whose typed `to` cannot carry search, US-053 D-09), to a fixed named destination, never `history.back()`
(WCTM-04's fixed-destination rule); the reused `PeriodoSelector` (WPER-01..07/WMYP-01..08 semantics); a tag
`{N} ingresos` from the wire's `conteo` (singular/plural per WCTG-03's grammatical-form precedent); the
month total via `formatearMontoConSigno(total, '+')` (positive sign — WG5-04's sign-by-kind rule); and the
static note `Sin meta ni semáforo: los ingresos no participan del 50/30/20 como gasto` (structural: the
wire carries no meta/porcentaje/estado, MID-03). The month label MUST derive from the search param —
`mesCompletoLabel(periodo ?? periodoActual())` — since the wire has no `periodo` echo (MID-01);
`periodoActual()` is a new pure helper in `domain/periodo.ts` (absent `periodo` → current calendar month,
MID-04). The route's `validateSearch` MUST narrow `periodo` via `normalizarPeriodo`. The back control MUST
meet the 24×24 CSS px floor and carry a non-empty accessible name (WCTM-04's a11y minimum).

#### Scenario: Header renders all CA-01 elements for a real month (jsdom)

- GIVEN `/ingresos?periodo=2026-07` with `conteo: 3` and `total: "1500000"`
- WHEN the page renders
- THEN breadcrumb (`Dashboard / Ingresos`), `PeriodoSelector`, `3 ingresos`, `+$1.500.000`, and the
  "Sin meta ni semáforo" note are all present

#### Scenario: T2 tablet header geometry renders correctly (Playwright)

- GIVEN the viewport is in the tablet tier (768–1023px)
- WHEN the page renders
- THEN the header matches the wireframe T2 variant, asserted by rendered geometry — never by className
  presence alone (the `WCTG-14`/`WG5-10` gap)

### Requirement: WDI-02 — Semantic `<table>` with Fecha / Descripción / Origen / Monto (CA-02)

The transaction list MUST render as a semantic `<table>` — the first in the web app — with columns Fecha,
Descripción, Origen, Monto. Every column header MUST be a `<th>` with `scope`, and the table MUST carry an
accessible name (caption or `aria-label`). Each row MUST render: the date via `aFechaCorta` (a new pure
helper in `domain/fecha.ts` — the 4th `.slice(0, 10)` occurrence, DRY rule of 3; the 3 legacy slice sites
migrate later, out of scope), the description verbatim, Origen as a tag showing the bank name verbatim or
`Manual` (MID-02), and Monto via `formatearMontoConSigno(monto, '+')` (positive, MID-05). Row order MUST be
the payload's order verbatim — the client MUST NOT re-sort (MID-01 authoritative).

#### Scenario: The table renders all four columns with the Origen tag and signed Monto (jsdom)

- GIVEN a payload with rows from BCI and a Manual row
- WHEN the page renders
- THEN each row shows its `aFechaCorta` date, the description verbatim, an Origen tag (`BCI`, `Manual`),
  and a `+`-signed Monto

#### Scenario: The list is a real table with scoped headers and an accessible name (jsdom)

- GIVEN the rendered page
- WHEN the accessible tree is inspected
- THEN a `table` role is present with `<th scope>` headers for Fecha, Descripción, Origen, Monto and an
  accessible name

#### Scenario: Rendered row order matches the payload verbatim (jsdom)

- GIVEN a payload whose rows arrive day-3 first, then day-15 in `id` asc order
- WHEN the page renders
- THEN the rendered order is identical — no client-side re-sort

### Requirement: WDI-03 — In-page month navigation and deep-linkable `periodo` (CA-03)

The page's `PeriodoSelector` MUST change the viewed month in-page (prev/next/"Hoy" per WPER-02/03/04),
updating the URL `periodo` search param with no reload and no parallel state source (WPER-05) via a
functional search updater (US-053 D-04). The page MUST never leave `/ingresos`. Arriving with
`?periodo=YYYY-MM` MUST render that month's data; absent `periodo` resolves to the current month (MID-04).
Navigation MUST remain available on an empty month (WDI-04).

#### Scenario: Arrows change the month in-page and update the URL (jsdom)

- GIVEN `/ingresos?periodo=2026-07` renders
- WHEN the user activates prev
- THEN the URL `periodo` becomes `2026-06`, the page stays on `/ingresos`, and it refetches and renders
  June data

#### Scenario: A deep link honours `periodo`; absent `periodo` defaults to the current month (jsdom)

- GIVEN a deep link `/ingresos?periodo=2026-03`
- WHEN the page loads
- THEN it renders March 2026 data
- AND `/ingresos` with no `periodo` renders the current calendar month (MID-04)

### Requirement: WDI-04 — Explicit empty-month state (decision 4)

WHEN the viewed month has zero income rows (MID-01: 200, `total` `"0"`, `conteo` 0, `transacciones` `[]`),
the page MUST render the header (zeroed total as `$0` — `formatearMontoConSigno`'s zero rule renders no
sign prefix — plus `0 ingresos`) AND `Empty` with the custom copy `Sin ingresos en {mes}`, with
`PeriodoSelector` navigation preserved. The dashboard's `sinIngreso` branch MUST NOT render here — the wire
has no such flag; an empty income month is a success, not an error.

#### Scenario: An empty income month renders zeros, the copy, and live navigation (jsdom)

- GIVEN `conteo: 0`, `total: "0"`, `transacciones: []` for `2026-07`
- WHEN `/ingresos?periodo=2026-07` renders
- THEN the header shows `$0` and `0 ingresos`, `Sin ingresos en julio 2026` renders, no table rows render,
  and the month arrows remain operable

### Requirement: WDI-05 — Loading, error, and retry states (CA-05)

The page MUST render the app's existing loading state while `useIngresosMes` (queryKey
`['ingresos-mes', periodo ?? 'actual']`) is pending, and MUST render the existing error state with a retry
control when the query fails — network error, 401, or a response body rejected by the `esIngresosMesDto`
guard (`esMontoStringValido` + `esFechaValida`, WAC-02's fail-closed precedent).

#### Scenario: A failed query renders the error state with retry (jsdom)

- GIVEN `useIngresosMes` resolves to an error (e.g. `tag: 'network'`)
- WHEN the page renders
- THEN the existing error state renders with a retry control that refetches on activation

### Requirement: WDI-06 — Thin client: labels only, typed route, no income mutation surface (CA-05, ADR-024)

The page MUST NOT perform business logic beyond labels and formatting: the view-model
(`ingresos-mes-view-model.ts`) MUST be a pure passthrough mapping the DTO to display values (`aFechaCorta`,
Origen tag text, `formatearMontoCLP`/`formatearMontoConSigno`) — no re-sort, no totals recomputation, no
classification logic (ADR-024; the WG5-11/WDM-08 boundary). The DTO MUST be re-exported per ADR-008 with
the `esIngresosMesDto` runtime guard, and the route MUST be typed (`validateSearch` via `normalizarPeriodo`).
The page MUST NOT offer edit or reclassify of incomes (out of scope; no catalog prefetch is needed).

#### Scenario: The view-model only labels; order is the wire's (jsdom)

- GIVEN the page's view-model and source
- WHEN they are inspected
- THEN the only derivations are display labels/formatting, the row order passes through verbatim, and no
  re-sort or totals recomputation exists

#### Scenario: No edit or reclassify affordance exists on the page (jsdom)

- GIVEN the rendered page
- WHEN its interactive elements are enumerated
- THEN the only interactive controls are the period navigation, the breadcrumb/back link, and retry — no
  per-row edit/reclassify control

### Requirement: WDI-07 — a11y: the first semantic table exposes a proper accessible contract; new files join the scoped lint gate (CA-05, ADR-018)

The new files (`IngresosMesPage.tsx`, `IngresosMesTable.tsx`, `routes/_authenticated/ingresos.tsx`) MUST be
added to the existing scoped `eslint-jsx-a11y` `error`-severity override (the WCFG-12/WCTG-12/WG5-12
precedent). The table MUST expose an accessible name (caption or `aria-label`), real `<th scope>` headers,
and rows addressable by role — asserted by unit tests via testing-library role/name queries (repo precedent,
D-09; `vitest-axe` is not a dependency). The table and `PeriodoSelector` MUST remain keyboard-operable with
a visible focus ring (WCAG 2.2 AA, ADR-018). The T2 tablet table geometry MUST be asserted by rendered
geometry at a real viewport (WG5-10), never by className presence alone.

#### Scenario: The scoped lint gate is clean (jsdom)

- GIVEN the new Ingresos page files
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

#### Scenario: The table exposes a correct accessible contract (jsdom)

- GIVEN the rendered table with rows
- WHEN testing-library queries it by role and accessible name
- THEN it resolves the table via its accessible name, every column header has a `scope`, and each row is
  addressable by its role (repo precedent, D-09 — no `vitest-axe` dependency)

#### Scenario: T2 tablet table geometry renders correctly (Playwright)

- GIVEN the viewport is in the tablet tier (768–1023px)
- WHEN the table renders
- THEN the columns and Origen tags match the wireframe T2 variant, asserted by rendered geometry — never
  by className presence alone

### Requirement: WDI-08 — e2e: ingresos-mes flows run against the dedicated stub (verification-only)

*(Verification-only. `ingresos-mes.e2e.ts` MUST cover: legend arrival (CA-04), in-page month navigation
with URL updates (CA-03), and the empty month (decision 4). The `**/api/ingresos/mes*` stub's prefix is
distinct from `**/api/resumen*`, so no LIFO collision exists between the two stub families — but fixture
registration order MUST still keep the specific ingresos stub registered after any broader dashboard stubs
in the same test, so the more specific match always wins.)*

#### Scenario: The ingresos stub wins over any broader dashboard stub (Playwright/e2e)

- GIVEN a test registering both `**/api/ingresos/mes*` and a broader dashboard stub
- WHEN the test exercises `/ingresos`
- THEN the ingresos stub serves the response — fixture order keeps the specific stub registered after the
  broad one

## MODIFIED Requirements

### Requirement: WG5-03 — Legend renders exactly 5 rows, in a fixed order, with a divider between spend items and the remainder (CA-02)

The legend MUST render exactly 5 rows in this fixed order: Necesidades, Deseos, Ahorro (each shaped
`name · % · CLP amount` with a color dot and a chevron, clickable), a visual divider, Ingresos (shaped
`name · CLP amount` — no `%` — clickable, navigating to `/ingresos` per `WG5-06`), and Sin categoría (shaped
`name · N tx · CLP amount` with a chevron, clickable), where `N` is `cantidadSinCategoria` from the wire
response. The 3 spend-bucket percentages MUST be the same ring-share value the ring itself uses for that
bucket (`WG5-01`) — `calcularDistribucionGasto`'s client-side share-of-spending apportionment over the 4
`BUCKETS_ANILLO` totals, not `porcentajeBp`. The legend performs no independent percentage computation of
its own; it reuses the ring's own value. Activating a clickable row MUST navigate to that bucket's Detalle
MES-BUCKET page (`WCAT-01`, `WDM-06`) — never swap an inline panel.

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
(Previously: the Ingresos row was NOT clickable — no interactive role, no navigation; US-054 makes it a
navigation target to `/ingresos` (`WG5-06`).)

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

#### Scenario: The Ingresos row has no percentage but navigates to `/ingresos` (jsdom)

- GIVEN the Ingresos row
- WHEN it renders
- THEN it shows only the name and the CLP amount (no `%`), and activating it (mouse or keyboard) navigates
  to `/ingresos` carrying the current `periodo` (`WG5-06`) — it is a real interactive/focusable control

#### Scenario: The Sin categoría row shows its transaction count from `cantidadSinCategoria` (jsdom)

- GIVEN a period where the backend reports `cantidadSinCategoria: 7`
- WHEN the Sin categoría legend row renders
- THEN it shows the name, `7` as its transaction count, its CLP amount, and a chevron, and activating it
  navigates to `/buckets/SinCategoria` with the current `periodo` plus `destacar` (`WDM-04`, `WDM-06`)

### Requirement: WG5-06 — Ingresos navigates to its Detalle MES-INGRESOS page; the US-047 interim comment is removed (CA-04)

The Ingresos legend row MUST be clickable, MUST be a focusable interactive element, and MUST navigate to
`/ingresos` carrying the current `periodo` search param (`WDI-01..08`). The US-047 interim comment at the
row's implementation site — which claimed no Ingresos drill-down endpoint exists — MUST be removed: the
endpoint exists (US-052, `ingresos-detalle-mes` MID-01..06). The pie has no Ingresos wedge and
`IngresoCard` is untouched — the legend row is the ONLY Ingresos click surface (CA-04).
(Previously: the Ingresos legend row MUST NOT be clickable, MUST NOT be a focusable interactive element,
and MUST NOT trigger any navigation, and the interim (no drill-down endpoint yet) was documented as a
comment at the row's implementation site.)
(Previously: the 4 clickable rows' behavior was an inline panel drill-down "unchanged" by US-049; this
change turns that drill-down into navigation, so the Ingresos exclusion is restated against navigation.)

#### Scenario: Activating the Ingresos row navigates to `/ingresos` (jsdom)

- GIVEN the Ingresos legend row
- WHEN the user clicks it, or tabs to it and presses Enter/Space
- THEN the URL becomes `/ingresos` with the current `periodo` — the row carries an interactive role and is
  reached by Tab

#### Scenario: Sin categoría, the 3 spend buckets, and Ingresos all navigate (jsdom)

- GIVEN the same legend render
- WHEN the user clicks the Sin categoría row, any spend-bucket row, or the Ingresos row
- THEN the spend buckets and Sin categoría navigate to their Detalle MES-BUCKET pages (`WCAT-01`/`WDM-06`)
  and Ingresos navigates to `/ingresos` (`WG5-06`) — navigation is the only drill-down behavior these rows
  have after this change

### Requirement: WG5-12 — New/touched files pass `eslint-jsx-a11y` at `error` scope; the donut, legend, and semáforo tag are keyboard-operable and accessible (CA-06, WCAG 2.2 AA, ADR-018)

Every file this change touches (`DistribucionPie.tsx`, `LeyendaGasto.tsx`, `SemaforoBadge.tsx`,
`SemaforoTag.tsx`, `ResumenScreen.tsx`, `routes/_authenticated/semaforo*.tsx` — glob, per the design's
`D-05`/`D-08` file lists) MUST be added to `eslint.config.js`'s scoped `error`-severity
`eslint-jsx-a11y` override, per the
existing US-042/043/063 precedent (`WCFG-12`, `WCTM-*`) and this change's own file lists in design
`D-05`/`D-08`.
The donut ring's `<svg>` MUST expose an accessible name/description (role and aria pattern consistent with
the existing `SemaforoBadge`'s `role="img"` + `aria-label` convention — never color alone). The 3
spend-bucket rows, the Sin categoría row, and the Ingresos row MUST remain keyboard-operable
(Tab/Enter/Space), matching their `<button>` semantics — the Ingresos row is now a real interactive control
(`WG5-06`). The semáforo tag MUST be keyboard-operable (Tab/Enter/Space) with a visible focus ring.
(Previously: only the 3 spend-bucket rows and the Sin categoría row were keyboard-operable; the Ingresos
row was excluded from Tab order under WG5-06's not-clickable rule. US-054 adds the Ingresos page's own
files to the same scoped override — WDI-07.)

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
- WHEN they reach a spend-bucket row, the Sin categoría row, the Ingresos row, or the semáforo tag, and
  activate it with Enter or Space
- THEN each behaves identically to its mouse-click behavior, with a visible focus ring at every step — the
  Ingresos row is reached by Tab and navigates to `/ingresos` on activation (`WG5-06`)