# Mobile Resumen Screen Specification — Delta (US-050)

Modifies `mobile-resumen-screen` (issue #284, CA-01..CA-04). Scope is fixed by
`openspec/changes/us-050-mobile-dashboard/proposal.md` — the "Out of Scope"
and "Closed Questions" sections there are binding and are not restated as
requirements here (no chevrons/navigation on legend rows or the semáforo tag,
no tab bar, no deep links/persisted period/year navigation, no per-month
mini semáforo tag on the annual grid). MOB-05 (CLP string-safe formatting)
and MOB-06 (null-vs-0% percentage discipline) are unchanged by this change
and are referenced, not restated.

## MODIFIED Requirements

### Requirement: MOB-03 — Screen renders four explicit states, the data state composing the redesigned dashboard

The screen MUST render exactly one of: loading, empty (`sinIngreso: true`),
error, or data — and MUST NOT render partial/undefined content while
transitioning. The data state MUST compose the 4-item donut ring + 5-row
legend (MOB-08), the static semáforo tag (MOB-09), and the annual section
(MOB-10) — replacing the Sprint-3 three-bucket-only breakdown.

> Note: the base spec's MOB-03 required a per-bucket `estadoSemaforo`
> indicator; that indicator was already dead in shipped code (never
> rendered by `LeyendaGasto`/`ResumenScreen`) and is deliberately retired
> by this MODIFIED replacement, not silently dropped.

#### Scenario: Loading state while the request is in flight

- GIVEN the screen has just mounted
- WHEN the resumen request has not yet resolved
- THEN a loading indicator is shown
- AND no bucket data or error copy is shown
- AND the annual section still renders (it owns its own fetch/states,
  independently of the main chart's loading state — MOB-12)

#### Scenario: Empty state when there is no income

- GIVEN the API responds 200 with `sinIngreso: true`
- WHEN the screen renders the response
- THEN an empty-state message distinct from "0%" is shown in place of the
  chart card
- AND the annual section still renders (MOB-14 — deliberate mobile
  divergence from web's whole-screen short-circuit)

#### Scenario: Error state on any mapped failure

- GIVEN the client produced a typed error state (401, network, or parse —
  MOB-02)
- WHEN the screen renders that state
- THEN error copy appropriate to the failure type is shown
- AND no stale/partial bucket data, ring, or legend is shown
- AND the annual section still renders (it owns its own fetch/states,
  independently of the main chart's error state — MOB-12)

#### Scenario: Data state renders the ring, legend, semáforo tag, and annual section

- GIVEN the API responds 200 with `sinIngreso: false` and 4 buckets
  (`Necesidades`, `Deseos`, `Ahorro`, `SinCategoria`)
- WHEN the screen renders the response
- THEN `totalIngreso` is shown formatted as CLP (MOB-05)
- AND the donut ring shows 4 slices per MOB-08
- AND the legend shows 5 rows per MOB-08
- AND the semáforo tag renders `estadoGlobal` per MOB-09
- AND the annual section (MOB-10) renders below the chart card

## ADDED Requirements

### Requirement: MOB-08 — Chart card renders a 4-item donut ring and a 5-row legend, with SinCategoria diluting the spend-bucket shares

The donut ring MUST apportion its slices over the 4 canonical buckets
(`Necesidades`, `Deseos`, `Ahorro`, `SinCategoria`, per `BUCKETS_ANILLO`
semantics, US-047 WG5-13) using the ported largest-remainder apportionment,
not the 3-bucket-only apportionment. The legend MUST render exactly 5 rows in
this order: `Necesidades`, `Deseos` (labeled "Gustos"), `Ahorro` — each with
its ring `porcentaje` and signed CLP amount — then `Ingresos` (signed `+`,
`totalIngreso`) and `Sin categoría · {cantidadSinCategoria} tx` (signed `-`).
Money amounts in the legend MUST be formatted via the signed CLP formatter
(never `parseFloat`/`Number` on the amount — MOB-05's discipline applies to
this formatter too).

#### Scenario: SinCategoria with a nonzero total dilutes the three spend-bucket ring percentages

- GIVEN a resumen response where `SinCategoria.total` is nonzero alongside
  nonzero `Necesidades`/`Deseos`/`Ahorro` totals
- WHEN the ring computes its 4 slice percentages
- THEN `SinCategoria` receives its own nonzero slice
- AND the `Necesidades`/`Deseos`/`Ahorro` percentages are the SAME numbers
  shown in the legend rows for those buckets (no independent
  re-normalization to 3 buckets in the legend)
- AND all 4 slice percentages sum to exactly 100

#### Scenario: Legend renders 5 rows in the fixed order with signed amounts

- GIVEN a resumen response with `sinIngreso: false`, 4 buckets, and
  `cantidadSinCategoria: 3`
- WHEN the legend renders
- THEN the rows appear in order: Necesidades, Gustos, Ahorro, Ingresos, "Sin
  categoría · 3 tx"
- AND the Necesidades/Gustos/Ahorro/Sin-categoría rows show a `-` sign
  amount
- AND the Ingresos row shows a `+` sign amount equal to `totalIngreso`

#### Scenario: cantidadSinCategoria of zero still renders an explicit "0 tx" row

- GIVEN `cantidadSinCategoria: 0` in the resumen response
- WHEN the legend renders the "Sin categoría" row
- THEN the row shows "Sin categoría · 0 tx", never omitted and never blank

#### Scenario: No spending yields an empty ring without dividing by zero

- GIVEN all 4 bucket totals are `"0"`
- WHEN the ring renders
- THEN it shows a muted placeholder instead of computing a percentage split
- AND the Necesidades/Gustos/Ahorro rows (`leyendaPrincipal`) are absent,
  per the underlying `calcularDistribucionGasto([])` contract
- AND the Ingresos and Sin categoría rows (`leyendaComplemento`) still
  render regardless of spending — Sin categoría shows its explicit "0 tx" /
  $0, never absent

### Requirement: MOB-09 — The semáforo tag is a static, non-interactive indicator

The chart card's semáforo tag MUST render `estadoGlobal` ('verde'|'amarillo'|'rojo'|null)
as a visual indicator only. It MUST NOT be a `Pressable`/`TouchableOpacity`,
MUST NOT expose `accessibilityRole="button"` or `"link"`, MUST NOT have an
`onPress` handler, and MUST NOT render a chevron or any other
navigation affordance (proposal Out-of-Scope decision 1).

#### Scenario: Semáforo tag has no accessible action

- GIVEN the data state has rendered with `estadoGlobal: 'rojo'`
- WHEN the semáforo tag element is queried for its accessibility role
- THEN it is NOT `"button"` and NOT `"link"`
- AND it exposes no `onPress`/press handler
- AND no chevron icon is rendered next to it

#### Scenario: null estadoGlobal still renders a visible "sin datos" tag

- GIVEN `estadoGlobal: null`
- WHEN the semáforo tag renders
- THEN a distinct "sin datos" visual state is shown (never omitted)
- AND it remains non-interactive per the scenario above

### Requirement: MOB-10 — Annual section fetches and renders 12 monthly cells for the current year

The screen MUST fetch `GET /api/resumen/anual` (no `anio` query param, so the
backend resolves the current year) via a new `fetchResumenAnual` client
function mirroring `fetchResumen`'s `ApiResult`/`ApiError` shape and header
construction (`x-api-key` + session-aware `Authorization`), and MUST render
exactly 12 cells (one per `meses[]` entry, Enero→Diciembre) in a section that
owns its own loading/error/empty states independently of the main chart
card's state (MOB-12).

#### Scenario: Annual request includes required headers and targets the resolved-year endpoint

- GIVEN `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_KEY` are set
- WHEN the annual section requests the current year's breakdown
- THEN the request is `GET {EXPO_PUBLIC_API_BASE_URL}/api/resumen/anual`
- AND the request header `x-api-key` equals `EXPO_PUBLIC_API_KEY`

#### Scenario: Annual data state renders 12 cells with the selected month highlighted

- GIVEN the annual response resolves with `anio: 2026` and 12 `meses` entries
- WHEN the annual section renders
- THEN exactly 12 cells are shown, one per month
- AND the cell whose `periodo` equals the screen's currently selected period
  (MOB-13) is visually marked as selected
- AND cells for months other than the selected one are not marked selected

#### Scenario: A month without data renders as a non-tappable cell

- GIVEN a `meses[]` entry has `sinIngreso: true`
- WHEN that month's cell renders
- THEN the cell exposes no `onPress` handler (or an explicitly disabled
  press affordance that never fires `onSelectPeriodo`)
- AND tapping that cell does not change the main chart's displayed period

#### Scenario: Annual cells carry no per-month semáforo tag

- GIVEN any `meses[]` entry, with or without data
- WHEN that month's cell renders
- THEN no semáforo indicator is rendered on the cell (proposal Closed
  Question 3 — divergence from web's `MiniSemaforoTag`)

### Requirement: MOB-11 — Tapping an annual cell with data switches the main chart to that month

Tapping a `meses[]` cell whose `sinIngreso` is `false` MUST update the
screen's selected period (MOB-13) to that cell's `periodo` and cause the main
chart card (ring, legend, semáforo tag, `totalIngreso`) to re-render with
that month's data.

#### Scenario: Tapping a month with data re-renders the main chart with that month's totals

- GIVEN the main chart currently shows period `"2026-06"`
- AND an annual cell for `"2026-04"` has `sinIngreso: false`
- WHEN the user taps the `"2026-04"` cell
- THEN the screen's selected period becomes `"2026-04"`
- AND the main chart card re-renders showing `"2026-04"`'s `totalIngreso`,
  ring, legend, and semáforo state
- AND the `"2026-04"` cell is now the visually-marked selected cell (MOB-10)

### Requirement: MOB-12 — The annual section's fetch failure never blanks the main chart card

The annual section MUST own an independent `{loading|error|data}` state from
the main chart card's fetch. A failure or loading state in the annual
section MUST NOT replace, hide, or block the rendering of the main chart
card, and vice versa.

#### Scenario: Annual fetch failure leaves the main chart card intact

- GIVEN the main `/api/resumen` fetch has resolved successfully with data
- WHEN the `/api/resumen/anual` fetch fails (network, 401, or parse error)
- THEN the main chart card (ring, legend, semáforo tag, `totalIngreso`)
  continues to render normally
- AND the annual section shows its own error state in its place

#### Scenario: Annual section loading does not block the main chart card

- GIVEN the main `/api/resumen` fetch has resolved successfully with data
- WHEN the `/api/resumen/anual` fetch is still in flight
- THEN the main chart card is already visible
- AND the annual section shows its own loading indicator, not a blank screen

### Requirement: MOB-13 — Month selection is local UI state, defaulting to the current month and resetting on restart

The selected period MUST be held as local component state in
`app/index.tsx` (or an equivalent screen-owned state), initialized to
`undefined` so `fetchResumen()` is called without a `periodo` query param and
the backend resolves the current month. Selecting an annual cell (MOB-11)
MUST update this local state. No persistence mechanism (storage, deep link,
route param) MAY back this state — a fresh app launch MUST discard any prior
selection.

#### Scenario: Fresh mount defaults to the backend-resolved current month

- GIVEN the screen has just mounted with no prior selection
- WHEN the main resumen request fires
- THEN the request is `GET {EXPO_PUBLIC_API_BASE_URL}/api/resumen` with no
  `periodo` query param

#### Scenario: Selection does not survive an app restart

- GIVEN the user selected `"2026-03"` via the annual grid in a prior session
- WHEN the app is relaunched (a fresh mount, not a re-render)
- THEN the main chart requests the current month again (no `periodo` param),
  not `"2026-03"`

### Requirement: MOB-14 — The sinIngreso empty state replaces only the chart card, not the whole screen

When the main resumen response has `sinIngreso: true`, the screen MUST
render the empty-state message in place of the chart card (ring/legend/
semáforo tag) ONLY. The annual section (MOB-10) MUST continue to render and
fetch independently. This is a deliberate divergence from web's
whole-screen short-circuit on `sinIngreso`: on mobile the annual grid is the
only month-navigation affordance, so blanking it would strand the user on an
empty current month with no way to reach a month that does have data.

#### Scenario: sinIngreso month still shows a usable annual grid

- GIVEN the main resumen response has `sinIngreso: true` for the current
  month
- WHEN the screen renders
- THEN the chart card area shows the empty-state message, not a ring or
  legend
- AND the annual section renders its 12 cells as usual
- AND tapping an annual cell with data (MOB-11) switches the main chart away
  from the empty state

### Requirement: MOB-15 — The IDEAL 50/30/20 inset and the "Ver detalles ›" affordance are removed

The chart card MUST NOT render the small "IDEAL" reference pie inset that
the Sprint-3 screen drew bottom-right of the main pie, and MUST NOT render
the "Ver detalles ›" button below the legend. Neither wireframe M1 nor the
redesigned web dashboard renders these (proposal Closed Questions 2 and 4);
no replacement destination exists for "Ver detalles ›" now that navigation
is out of scope for this change.

#### Scenario: Data state renders without the IDEAL inset

- GIVEN the data state has rendered with `sinIngreso: false`
- WHEN the chart card is queried
- THEN no element labeled "IDEAL" or an ideal/target reference pie is present

#### Scenario: Data state renders without the "Ver detalles" button

- GIVEN the data state has rendered with `sinIngreso: false`
- WHEN the chart card is queried
- THEN no element with the text "Ver detalles ›" or an equivalent
  `accessibilityRole="button"` beneath the legend is present
