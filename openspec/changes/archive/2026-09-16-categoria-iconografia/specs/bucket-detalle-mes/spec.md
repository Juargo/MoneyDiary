# Delta for Bucket Detalle Mes

## MODIFIED Requirements

### Requirement: MBD-02 — Category groups carry ALL of the bucket's transactions, es-CL alphabetical, "Sin categoría" last (CA-02)

The response MUST expose `grupos`, one entry per category present in the period, plus a synthetic
Sin categoría group when the bucket contains null-categoria rows (and always for the SinCategoria
bucket itself). Each group MUST expose `categoriaId` (null for Sin categoría), `nombre` (the
category's name, or "Sin categoría" for the synthetic group), `icono` (the category's curated icon
name, or `null` when unset or for the synthetic Sin categoría group — `categoria-icono` CATICO-01),
`subtotal` (sum of the group's transaction `monto`, as a BigInt-safe string), `conteo` (transaction
count), and `transacciones` — the COMPLETE list of that group's transactions, each
`{id, fecha, descripcion, monto}` with `monto` equal to the cargo amount. The response MUST NOT
truncate or page transactions. Groups MUST be ordered by `nombre` using es-CL locale collation, with
the Sin categoría group ALWAYS last. Transactions within a group MUST follow the reader's
deterministic order (fecha asc, id asc).
(Previously: groups did not expose an `icono` field.)

#### Scenario: Groups carry all transactions with the agreed shape

- GIVEN a Deseos bucket month with 2 categories ("Comida" with 3 transactions, "Transporte" with 2)
- WHEN a client calls `GET /api/buckets/Deseos/detalle?periodo=<period>`
- THEN `grupos` has 2 entries, each with shape
  `{categoriaId, nombre, icono, subtotal, conteo, transacciones}`
- AND each `transacciones` entry exposes only `{id, fecha, descripcion, monto}` with `monto` equal
  to the cargo amount
- AND ALL 5 transactions are present — none truncated or paged

#### Scenario: Groups are ordered es-CL alphabetical with "Sin categoría" last

- GIVEN a bucket month containing categories "Zapatería", "Ñoquis", and Sin categoría rows
- WHEN a client calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN the group order is "Ñoquis", "Zapatería", then "Sin categoría" last

#### Scenario: Null-categoria rows in a real bucket fold into a synthetic Sin categoría group

- GIVEN a Necesidades bucket month with categorized transactions plus 2 uncategorized cargo rows
- WHEN a client calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN a synthetic group with `categoriaId` null and `nombre` "Sin categoría" carries those 2 rows
- AND `totalCategorias` counts that synthetic group

#### Scenario: The synthetic Sin categoría group always exposes a null icono

- GIVEN any period, real or synthetic Sin categoría group
- WHEN a client calls the detalle endpoint for a bucket containing a Sin categoría group
- THEN that group's `icono` is always `null`, regardless of any category's own icono elsewhere in
  the response
