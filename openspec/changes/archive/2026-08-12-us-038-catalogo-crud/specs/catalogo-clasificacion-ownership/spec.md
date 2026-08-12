# Delta for Catalog Ownership — CRUD Surface (US-038)

## ADDED Requirements

### Requirement: CAT038-01 — Category creation requires nombre and an assignable bucket

`POST /api/categorias` MUST require `nombre` (trimmed, 1–40 chars) and `bucket`.
`bucket` MUST be one of `Necesidades`/`Deseos`/`Ahorro`; `Ingreso` and
`SinCategoria` are computed states and MUST NOT be assignable. `nombre`
uniqueness per user MUST be case-insensitive.

#### Scenario: Valid category is created
- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos" }`
- THEN the response is `201` with the new category's real id

#### Scenario: Missing or non-assignable bucket is rejected
- GIVEN an authenticated user
- WHEN they POST with `bucket` omitted, or `bucket: "Ingreso"` / `"SinCategoria"`
- THEN the response is `400`

#### Scenario: Case-insensitive duplicate name is rejected
- GIVEN a user already owns a category named "Mascotas"
- WHEN they POST `{ nombre: "mascotas", bucket: "Deseos" }`
- THEN the response is `409`

### Requirement: CAT038-02 — GET /api/categorias returns the caller's catalog with nested patterns

`GET /api/categorias` MUST return only the caller's own `Categoria` rows,
each with its `patrones` nested. A category with zero patterns MUST be
returned with `patrones: []`.

#### Scenario: Zero-pattern category is valid and visible
- GIVEN a user owns a category with no patterns attached
- WHEN they GET `/api/categorias`
- THEN that category appears with `patrones: []`

#### Scenario: Response never includes another user's rows
- GIVEN user A and user B each own categories
- WHEN user A calls GET `/api/categorias`
- THEN only user A's rows appear

### Requirement: CAT038-03 — Category update supports rename and re-bucket, re-stamping history atomically

`PATCH /api/categorias/:id` MUST reject a rename that collides
case-insensitively with another of the caller's categories (`409`). When the
`bucket` actually changes, the update MUST, in the same DB transaction,
re-stamp `bucketId` on every `Transaccion` currently pointing at that
category, for any period.

#### Scenario: Re-bucket updates historical transactions atomically
- GIVEN a category "Delivery" with `bucket: Deseos` and past transactions
- WHEN the caller PATCHes `bucket: "Necesidades"`
- THEN the response is `200`, and `/api/resumen` and the bucket drill-down
  report those transactions under `Necesidades` immediately after

#### Scenario: Rename collides with an existing name
- GIVEN the caller owns "Ahorro" and "Inversiones"
- WHEN they PATCH "Inversiones" to `nombre: "ahorro"`
- THEN the response is `409`

#### Scenario: Updating another user's category is a 404, not a 403
- GIVEN user B's category id
- WHEN user A PATCHes that id
- THEN the response is `404`

### Requirement: CAT038-04 — Category deletion rejects in-use categories, cascades patterns otherwise

`DELETE /api/categorias/:id` MUST return `409` if any `Transaccion` (any
period) references the category. If not in use, the category's patterns
MUST be deleted together with the category in one DB transaction, returning
`204`.

#### Scenario: Deleting a category in use is rejected
- GIVEN a category referenced by at least one transaction
- WHEN the caller DELETEs it
- THEN the response is `409` and neither the category nor its patterns are removed

#### Scenario: Deleting an unused category cascades its patterns
- GIVEN a category with 3 patterns and zero transactions
- WHEN the caller DELETEs it
- THEN the response is `204` and both the category and its 3 patterns are gone

### Requirement: CAT038-05 — Pattern CRUD supports the three match types with per-user uniqueness and priority

`POST`/`PATCH /api/patrones` MUST require `matchType` in
`CONTAINS`/`STARTS_WITH`/`REGEX` and a `patron` (trimmed, 1–200 chars)
referencing one of the caller's own categories. `patron` text MUST be unique
per user, case-insensitively (`409`). `prioridad` is optional, integer
`1..999`, defaulting to `100`.

#### Scenario: Invalid matchType is rejected
- GIVEN an authenticated user
- WHEN they POST a pattern with `matchType: "FUZZY"`
- THEN the response is `400`

#### Scenario: Pattern targeting a foreign or missing category is rejected
- GIVEN a category id the caller does not own
- WHEN they POST a pattern with that `categoriaId`
- THEN the response is `404`

#### Scenario: Duplicate pattern text is rejected case-insensitively
- GIVEN the caller already owns a pattern with text "netflix"
- WHEN they POST `patron: "Netflix"` (any matchType)
- THEN the response is `409`

#### Scenario: prioridad defaults and is bounded
- GIVEN a new pattern with `prioridad` omitted
- WHEN it is created
- THEN it is stored with `prioridad: 100`; a request with `prioridad: 1000` returns `400`

### Requirement: CAT038-06 — Invalid REGEX is rejected at write time; malformed stored patterns never break matching

Creating or updating a `REGEX` pattern MUST attempt `new RegExp(patron)` and
return `400` if it throws. This write-time check MUST NOT alter the
existing runtime guarantee that `coincide()` degrades any malformed stored
pattern to no-match inside a `try/catch`, never throwing during
categorization.

#### Scenario: Invalid REGEX is rejected on write
- GIVEN a `REGEX` pattern payload with an unbalanced `(`
- WHEN the caller creates or updates it
- THEN the response is `400`

#### Scenario: A pre-existing malformed REGEX still degrades safely
- GIVEN a stored `REGEX` pattern that predates this validation and does not compile
- WHEN categorization evaluates it against a transaction description
- THEN it is treated as no-match and categorization does not throw

### Requirement: CAT038-07 — Every catalog endpoint enforces ownership isolation with anti-enumeration 404

All 7 endpoints MUST require a valid session and `x-api-key`, and MUST
filter by `userId` in the SQL `WHERE` for every query and mutation. A
request targeting another user's category or pattern id MUST return `404`
("does not exist" and "is not yours" are indistinguishable).

#### Scenario: User B gets 404 reading, renaming, re-bucketing or deleting user A's rows
- GIVEN user A's real category or pattern id
- WHEN user B calls PATCH or DELETE on that id
- THEN the response is `404`, never `403`

### Requirement: CAT038-08 — Catalog mutations are read-only for demo sessions

Every catalog-mutation use case MUST require `esDemo` as an input and MUST
return `403` with `code: "DEMO_SOLO_LECTURA"` when the calling session is a
demo session. `GET /api/categorias` MUST remain available to demo sessions.

#### Scenario: Demo session cannot mutate the catalog
- GIVEN a demo session
- WHEN it calls any of the 6 write endpoints
- THEN the response is `403` with `code: "DEMO_SOLO_LECTURA"`

#### Scenario: Demo session can still read the catalog
- GIVEN a demo session
- WHEN it calls GET `/api/categorias`
- THEN the response is `200` with the demo user's own catalog

### Requirement: CAT038-09 — Generated API contracts stay in sync with the CRUD surface

`openapi.json` MUST document all 7 endpoints and pass `openapi:check`.
`@moneydiary/api-client`'s generated types MUST be regenerated and pass its
CI drift gate. Money fields on new/modified endpoints MUST remain
BigInt-safe strings.

#### Scenario: Contract generation stays green
- GIVEN the 7 endpoints and their Zod schemas are implemented
- WHEN `openapi:check` and the `api-client` CI job run
- THEN both pass with zero drift

## MODIFIED Requirements

### Requirement: CAT037-04 — Reclassification resolves and persists the caller's own categoría, unconstrained by any closed name set

The reclassify write path MUST resolve the target `Categoria` by the
caller's own `(userId, nombre)` pair and MUST persist and return that row's
real, per-user id. No runtime path in the reclassify flow MUST resolve a
`categoriaId` through a static global id map or reject a nombre solely for
not belonging to a closed/enumerated set — ownership of the row is the only
validity test. A nombre absent from the caller's own catalog MUST return
`400` with a generic "category not found in your catalog" message, never an
enumerated list of valid names.
(Previously: resolved by (userId, nombre) but implementations also enforced
a closed 8-name set; the enumerated-message error is retired.)

#### Scenario: Reclassify persists the caller's own categoría row
- GIVEN user A reclassifies one of their own transactions to categoría "Transporte"
- WHEN the write completes
- THEN the transaction's `categoriaId` equals user A's own "Transporte" row id

#### Scenario: Two users reclassifying to the same nombre get different ids
- GIVEN user A and user B each reclassify a transaction to their own categoría named "Ahorro"
- WHEN both writes complete
- THEN the two persisted `categoriaId` values differ

#### Scenario: Reclassify to a user-created custom category succeeds
- GIVEN user A has created a custom category "Mascotas" not in the original template
- WHEN they reclassify a transaction with `{ categoria: "Mascotas" }`
- THEN the response is `200` and the transaction's `categoriaId` is that custom category's own id

#### Scenario: Reclassify to a nombre outside the caller's catalog is a generic 400
- GIVEN a nombre that does not exist in the caller's own catalog
- WHEN they call reclassify with that nombre
- THEN the response is `400` with a generic "not found in your catalog" message, not an enumerated list

### Requirement: CAT037-06 — Read paths resolve categoría by nombre; ownership is the sole authority, not name membership

Every read repository that folds a raw `categoriaId` back to a domain
category MUST resolve the fold by the stored row's `nombre`, sourced from a
`userId`-scoped query. No runtime read path MUST reject or null out a
category solely because its `nombre` falls outside the original 8-value
template — a row returned by an ownership-scoped query is valid by
construction. The legacy global id/name map MAY still seed the template only.
(Previously: resolved by nombre, but a defensive guard folded any nombre
outside the closed enum to `null`, hiding user-created categories.)

#### Scenario: A non-seed user's categorized transactions still show their category
- GIVEN a demo user with a transaction classified into their own "Streaming" categoría
- WHEN that user requests movimientos or detalle-bucket for the period
- THEN the response's `categoria` field for that row is `{ nombre: "Streaming", ... }`

#### Scenario: A second user sees categories on the dashboard
- GIVEN a second non-seed user with categorized transactions in the current period
- WHEN they request `/api/resumen` and the bucket detail views
- THEN categorized transactions show their real categoría

#### Scenario: A user-created category name is never folded to null
- GIVEN a user has renamed or created a category with a name absent from the original 8-value template (e.g. "Mascotas")
- WHEN transactions classified into it are read via dashboard, movimientos, or detalle-bucket
- THEN they show `{ nombre: "Mascotas", ... }`, never a `null` category
