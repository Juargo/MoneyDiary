# Delta for Mobile Detalle Mes

## MODIFIED Requirements

### Requirement: MDET-03 — GrupoMovimientosMobile: expandable groups and SinCategoria destacado

M1 MUST render one `GrupoMovimientosMobile` per group from `aDetalleBucketMesViewModel`. Each group
MUST show a header with a bucket-colored icon badge (the group's `icono`, or the generic fallback
when null/absent — `categoria-icono` CATICO-06; always the fallback for the `SinCategoria` group),
categoría name, subtotal, and conteo. Groups with more than 10 rows MUST show the first 10 rows and a
`"Ver N más"` pressable that reveals the rest (`accessibilityState={{ expanded: false/true }}`). The
`SinCategoria` group ALWAYS carries the stable `testID="grupo-movimientos-sin-categoria"` on its root
container. When the URL param `destacar=sin-categoria` is present, an INNER highlight wrapper with
`testID="grupo-sin-categoria-destacado"` MUST be rendered INSIDE the `SinCategoria` group root and
carry a distinct visual style compared to other groups; this inner wrapper is ONLY rendered when
`destacar` is active. Both the stable root testID and the conditional inner testID MUST be asserted
independently in the test for the destacado scenario.
(Previously: the group header showed categoría name, subtotal, and conteo — no icon badge.)

#### Scenario: Group with 12 rows shows 10 + "Ver 2 más" collapsed (RNTL)

- GIVEN a group has 12 transaction rows
- WHEN the group first renders
- THEN exactly 10 rows are visible and a pressable with text `"Ver 2 más"` is shown
- AND `accessibilityState={{ expanded: false }}` is set on that pressable

#### Scenario: Tapping "Ver N más" expands to show all rows (RNTL)

- GIVEN the "Ver N más" pressable is visible
- WHEN the user presses it
- THEN all 12 rows are visible and the pressable text changes to `"Ver menos"`
- AND `accessibilityState={{ expanded: true }}` is set on that pressable

#### Scenario: A group at the threshold renders no pressable (RNTL)

- GIVEN a group has exactly 10 transaction rows
- WHEN the group first renders
- THEN all 10 rows are visible and no `"Ver N más"` pressable is rendered

#### Scenario: SinCategoria group is highlighted when destacar param is set (RNTL)

- GIVEN `useLocalSearchParams` returns `{ bucket: "SinCategoria", destacar: "sin-categoria" }`
- WHEN the screen renders
- THEN the SinCategoria group's root container carries `testID="grupo-movimientos-sin-categoria"` (always present)
- AND an INNER element with `testID="grupo-sin-categoria-destacado"` is rendered inside it with a distinct visual style — this inner wrapper is only present when `destacar` is active

#### Scenario: Groups without the destacar param render without highlight (RNTL)

- GIVEN `useLocalSearchParams` returns `{ bucket: "Necesidades" }` (no `destacar`)
- WHEN the screen renders
- THEN the SinCategoria group root still carries `testID="grupo-movimientos-sin-categoria"`
- AND no element with `testID="grupo-sin-categoria-destacado"` exists anywhere in the tree

#### Scenario: A group header renders its icono on a bucket-colored badge (RNTL)

- GIVEN a group whose category has `icono: "shopping-cart"`
- WHEN the group header renders
- THEN the badge shows the `shopping-cart` icon on the screen's bucket color token

#### Scenario: The SinCategoria group header always renders the generic fallback (RNTL)

- GIVEN the `SinCategoria` group (its `icono` is always `null`, MBD-02)
- WHEN its header renders
- THEN the badge shows the generic fallback icon
