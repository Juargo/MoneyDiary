# Delta for mobile-resumen-screen

Source: `openspec/changes/us-056-mobile-detalle-mes/proposal.md` (US-056, issue #290).
Scoped to `apps/mobile` only — no backend, no contract, no migration.
This is the ONLY modification to `openspec/specs/mobile-resumen-screen/spec.md` for this change.
Scenario labels: **(RNTL)** = jest-expo + React Native Testing Library; **(Maestro)** = manual/device-only.

## MODIFIED Requirements

### Requirement: MOB-08 — Chart card renders a 4-item donut ring and a 5-row legend, with each legend row a pressable navigation target

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

Each of the 5 legend rows MUST be a `Pressable` (`accessibilityRole="button"`)
with an explicit Spanish accessibility label and a `testID` following the
`"leyenda-fila-{key}"` pattern (e.g. `testID="leyenda-fila-Necesidades"`,
`testID="leyenda-fila-Deseos"`, `testID="leyenda-fila-Ahorro"`, `testID="leyenda-fila-ingreso"`,
`testID="leyenda-fila-SinCategoria"`). Pressing a spend-bucket row MUST call
the `onNavegar` callback with the exact path string (e.g. `/bucket/Necesidades?periodo=2026-07`).
Pressing the `SinCategoria` row MUST call `onNavegar` with the exact string
`/bucket/SinCategoria?destacar=sin-categoria&periodo=${periodo}`.
Pressing the `Ingresos` row MUST call `onNavegar` with the exact string
`/ingresos?periodo=${periodo}`.
The `onNavegar` callback (required prop, passed from `index.tsx` as `router.push`) is
what actually calls `router.push` at the route level — tests on `LeyendaGasto`
assert `onNavegar` was called with the EXACT path string; tests on `index.tsx`
assert `router.push` receives it. The `periodo` threaded to each push MUST be
the dashboard's currently selected period from `app/index.tsx` local state
(MOB-13) — not always the backend-resolved current month. The donut SVG
ring (`accessibilityLabel="Distribución del gasto"`) remains decorative and
MUST NOT have per-slice press handlers (D-01).

(Previously: legend rows rendered `porcentaje` + signed CLP and were explicitly
non-interactive — US-050 binding decision 2 mandated no pressability, no
chevrons, no navigation. This MODIFIED requirement reverses that decision for
the 5 legend rows ONLY, adding `Pressable` wrappers and three navigation
targets while leaving the donut SVG itself decorative and unpressable.)

#### Scenario: SinCategoria with a nonzero total dilutes the three spend-bucket ring percentages (RNTL)

- GIVEN a resumen response where `SinCategoria.total` is nonzero alongside
  nonzero `Necesidades`/`Deseos`/`Ahorro` totals
- WHEN the ring computes its 4 slice percentages
- THEN `SinCategoria` receives its own nonzero slice
- AND the `Necesidades`/`Deseos`/`Ahorro` percentages are the SAME numbers
  shown in the legend rows for those buckets (no independent
  re-normalization to 3 buckets in the legend)
- AND all 4 slice percentages sum to exactly 100

#### Scenario: Legend renders 5 rows in the fixed order with signed amounts (RNTL)

- GIVEN a resumen response with `sinIngreso: false`, 4 buckets, and
  `cantidadSinCategoria: 3`
- WHEN the legend renders
- THEN the rows appear in order: Necesidades, Gustos, Ahorro, Ingresos, "Sin
  categoría · 3 tx"
- AND the Necesidades/Gustos/Ahorro/Sin-categoría rows show a `-` sign
  amount
- AND the Ingresos row shows a `+` sign amount equal to `totalIngreso`

#### Scenario: cantidadSinCategoria of zero still renders an explicit "0 tx" row (RNTL)

- GIVEN `cantidadSinCategoria: 0` in the resumen response
- WHEN the legend renders the "Sin categoría" row
- THEN the row shows "Sin categoría · 0 tx", never omitted and never blank

#### Scenario: No spending yields an empty ring without dividing by zero (RNTL)

- GIVEN all 4 bucket totals are `"0"`
- WHEN the ring renders
- THEN it shows a muted placeholder instead of computing a percentage split
- AND the Necesidades/Gustos/Ahorro rows (`leyendaPrincipal`) are absent,
  per the underlying `calcularDistribucionGasto([])` contract
- AND the Ingresos and Sin categoría rows (`leyendaComplemento`) still
  render regardless of spending — Sin categoría shows its explicit "0 tx" /
  $0, never absent

#### Scenario: Tapping a spend-bucket legend row navigates to M1 with the current periodo (RNTL)

- GIVEN the dashboard is showing `periodo="2026-07"` (local state, MOB-13)
- AND the legend row for `Necesidades` has `testID="leyenda-fila-Necesidades"`
- WHEN the user presses that row
- THEN `onNavegar` is called with the exact string `/bucket/Necesidades?periodo=2026-07` — the currently-selected period, not a hardcoded current month

#### Scenario: Tapping Gustos (Deseos) row navigates to M1 for the Deseos bucket (RNTL)

- GIVEN the dashboard is showing `periodo="2026-06"`
- WHEN the user presses the row labeled `"Gustos"` (`testID="leyenda-fila-Deseos"`)
- THEN `onNavegar` is called with the exact string `/bucket/Deseos?periodo=2026-06` — the wire key `Deseos` (not the display label `Gustos`) is used as the route segment; a display-label-as-segment implementation fails this scenario

#### Scenario: Tapping Sin categoría row navigates to M1 with destacar param (RNTL)

- GIVEN the dashboard is showing `periodo="2026-05"`
- WHEN the user presses the `"Sin categoría · N tx"` row (`testID="leyenda-fila-SinCategoria"`)
- THEN `onNavegar` is called with the exact string `/bucket/SinCategoria?destacar=sin-categoria&periodo=2026-05`

#### Scenario: Tapping Ingresos row navigates to M2 with the current periodo (RNTL)

- GIVEN the dashboard is showing `periodo="2026-07"`
- WHEN the user presses the `"Ingresos"` row (`testID="leyenda-fila-ingreso"`)
- THEN `onNavegar` is called with the exact string `/ingresos?periodo=2026-07`

#### Scenario: Donut SVG has no per-slice press handler (RNTL)

- GIVEN the chart card has rendered with 4 non-zero slices
- WHEN the SVG element with `accessibilityLabel="Distribución del gasto"` is inspected
- THEN no child element inside the SVG has an `onPress` handler
- AND the SVG `accessibilityLabel` remains `"Distribución del gasto"` unchanged

#### Scenario: All 5 legend rows carry accessibilityRole="button" (RNTL)

- GIVEN the data state has rendered with income data present
- WHEN all legend row elements are queried by `testID` regex `/^leyenda-fila-/` (RNTL accepts string-exact or regex — glob is not a valid query form)
- THEN exactly 5 elements are found and each has `accessibilityRole="button"`
