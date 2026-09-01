# Delta for catalogo-clasificacion-ownership

Source: `openspec/changes/categoria-unica-por-bucket/proposal.md` (ADR-042). Uniqueness moves from
`(userId, nombre)` to `(userId, bucketId, nombre)`; the reclassify wire contract cuts over from `nombre`
to `categoriaId` (hard cutover, no transition alias). Case-insensitivity is unchanged and remains a
recorded non-goal (app-layer gate stays looser-than-DB, as today). `PatronClasificacion` uniqueness, the
`(prioridad, patron, id)` tiebreak, and the composite FK are untouched.

## MODIFIED Requirements

### Requirement: CAT038-01 — Category creation requires nombre and an assignable bucket

`POST /api/categorias` MUST require `nombre` (trimmed, 1–40 chars) and `bucket`. `bucket` MUST be one of
`Necesidades`/`Deseos`/`Ahorro`; `Ingreso` and `SinCategoria` are computed states and MUST NOT be
assignable. `nombre` uniqueness MUST be scoped to `(userId, bucket)`, case-insensitive: a user MAY create
a categoría whose `nombre` already exists in one of their OTHER buckets, and MUST NOT create one whose
`nombre` already exists in the SAME bucket (`409 NOMBRE_DUPLICADO`). `bucket` travels through `application`
as a validated bucket NAME (never `bucketId`, ADR-005); only the persistence adapter resolves it.
(Previously: `nombre` uniqueness per user was global — case-insensitive across ALL buckets, blind to
bucket membership.)

#### Scenario: Valid category is created

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos" }`
- THEN the response is `201` with the new category's real id

#### Scenario: Missing or non-assignable bucket is rejected

- GIVEN an authenticated user
- WHEN they POST with `bucket` omitted, or `bucket: "Ingreso"` / `"SinCategoria"`
- THEN the response is `400`

#### Scenario: Case-insensitive duplicate name in the SAME bucket is rejected

- GIVEN a user already owns a category named "Mascotas" in `Deseos`
- WHEN they POST `{ nombre: "mascotas", bucket: "Deseos" }`
- THEN the response is `409 NOMBRE_DUPLICADO`

#### Scenario: The same name in a DIFFERENT bucket succeeds

- GIVEN a user already owns "Transporte" in `Necesidades`
- WHEN they POST `{ nombre: "Transporte", bucket: "Deseos" }`
- THEN the response is `201`, and both rows coexist

#### Scenario: A second user's category never constrains the first user's creation

- GIVEN user B owns "Mascotas" in `Deseos`
- WHEN user A POSTs `{ nombre: "Mascotas", bucket: "Deseos" }`
- THEN the response is `201` — B's catalog never constrains A's (RNF-SEC-006)

### Requirement: CAT038-03 — Category update supports rename and re-bucket, re-stamping history atomically

`PATCH /api/categorias/:id` MUST validate uniqueness against the RESULTING `(bucket, nombre)` pair — the
effective bucket (the patch's `bucket` if present, else the row's current bucket) combined with the
effective `nombre` (the patch's `nombre` if present, else the row's current `nombre`) — uniformly whether
the patch renames, re-buckets, or does both. A collision on the resulting pair MUST be rejected with
`409 NOMBRE_DUPLICADO` and MUST NEVER surface as an unhandled `500`, regardless of which field(s) changed.
A patch producing no collision on the resulting pair MUST succeed. When `bucket` actually changes, the
update MUST, in the same DB transaction, re-stamp `bucketId` on every `Transaccion` currently pointing at
that category, for any period.
(Previously: uniqueness was checked only inside the branch handling a `nombre` change; a re-bucket-only
PATCH ran no uniqueness check and could hit an unhandled Prisma `P2002` on the old `(userId, nombre)`
index.)

#### Scenario: Re-bucket updates historical transactions atomically

- GIVEN a category "Delivery" with `bucket: Deseos` and past transactions
- WHEN the caller PATCHes `bucket: "Necesidades"`
- THEN the response is `200`, and `/api/resumen` and the bucket drill-down report those transactions under
  `Necesidades` immediately after

#### Scenario: Rename collides within the SAME bucket

- GIVEN the caller owns "Ahorro" and "Inversiones", both in `Ahorro`
- WHEN they PATCH "Inversiones" to `nombre: "ahorro"` (no `bucket` in the patch)
- THEN the response is `409 NOMBRE_DUPLICADO`

#### Scenario: Rename into a name already taken in a DIFFERENT bucket succeeds

- GIVEN the caller owns "Transporte" in `Necesidades` and "Movilidad" in `Deseos`
- WHEN they PATCH "Movilidad" to `nombre: "Transporte"` (bucket unchanged, stays `Deseos`)
- THEN the response is `200`; both "Transporte" rows now coexist, one per bucket

#### Scenario: Re-bucket-only into a bucket that already holds that name is a clean 409, never a 500

- GIVEN the caller owns "Transporte" in BOTH `Necesidades` and `Deseos`
- WHEN they PATCH the `Necesidades` one with `{ bucket: "Deseos" }` (no `nombre` in the patch)
- THEN the response is `409 NOMBRE_DUPLICADO` — never an unhandled `500` — and nothing is persisted

#### Scenario: Rename AND re-bucket in one PATCH is validated against the resulting pair

- GIVEN the caller owns "Transporte" in `Deseos`, and separately owns "Locomoción" in `Necesidades`
- WHEN they PATCH "Locomoción" with `{ nombre: "Transporte", bucket: "Deseos" }`
- THEN the response is `409 NOMBRE_DUPLICADO` (the resulting pair collides)
- WHEN they instead PATCH it with `{ nombre: "Transporte", bucket: "Ahorro" }`
- THEN the response is `200` (the resulting pair is free)

#### Scenario: Updating another user's category is a 404, not a 403

- GIVEN user B's category id
- WHEN user A PATCHes that id
- THEN the response is `404`

### Requirement: CAT037-04 — Reclassification resolves and persists the caller's own categoría by id, unconstrained by any closed name set

`PATCH /api/transacciones/:id/categoria` MUST accept a `categoriaId` field and MUST NOT accept the legacy
`categoria` (nombre) field — a hard cutover with no transition alias. The reclassify write path MUST
resolve the target `Categoria` by `(id, userId)` — never by `nombre`, alone or combined — and MUST persist
and return that row's real id. No runtime path MUST resolve a `categoriaId` through a static global id
map, a name lookup, or reject a request solely because the id is absent from a closed/enumerated set —
ownership (`userId` match) is the only validity test. A `categoriaId` that does not exist, or belongs to
another user, MUST return a generic `400`/`404` (indistinguishable from "not found"), never an enumerated
list, and never a successful write. A request still using the legacy `{ categoria: <nombre> }` shape MUST
be rejected with `400`.
(Previously: the endpoint accepted `{ categoria: <nombre> }` and resolved the target row by the caller's
own `(userId, nombre)` pair. Once uniqueness becomes per-bucket, `nombre` no longer identifies a single
row, so name-based resolution could non-deterministically pick the wrong row and silently misclassify
money into the wrong bucket.)

#### Scenario: Reclassify persists the caller's own categoría row

- GIVEN user A reclassifies a transaction to their own categoría "Transporte" (id `A1`)
- WHEN the write completes
- THEN the transaction's `categoriaId` equals `A1`, and the response DTO reflects that same real id

#### Scenario: Two users reclassifying to a categoría of the same nombre get different ids

- GIVEN user A and user B each reclassify a transaction to their own categoría named "Ahorro"
- WHEN both writes complete
- THEN the two persisted `categoriaId` values differ, each pointing to the respective user's own row

#### Scenario: Reclassify to a user-created custom category succeeds

- GIVEN user A has created a custom category "Mascotas" (id `M1`), not in the original template
- WHEN they call reclassify with `{ categoriaId: "M1" }`
- THEN the response is `200` and the transaction's `categoriaId` is `M1`

#### Scenario: An unknown or foreign categoriaId is a generic rejection, never a wrong write

- GIVEN a `categoriaId` that does not exist, or belongs to another user
- WHEN reclassify is called with it
- THEN the response is a generic `400`/`404` — indistinguishable from "does not exist" — never an
  enumerated list, and no transaction is mutated

#### Scenario: The legacy nombre-keyed shape is rejected outright (hard cutover)

- GIVEN a request body of the legacy shape `{ categoria: "Transporte" }` (no `categoriaId`)
- WHEN it is sent to the reclassify endpoint
- THEN the response is `400`, and no transaction is mutated — no fallback to name-based resolution

#### Scenario: Reclassify hits the EXACT row when two categorías share a nombre in different buckets (integration, real Postgres required)

- GIVEN a user owns "Transporte" in `Necesidades` (id `A`) and a separate "Transporte" in `Deseos` (id `B`)
- WHEN they reclassify a transaction with `{ categoriaId: "B" }`
- THEN the persisted `categoriaId` is exactly `B`, and the transaction's denormalized `bucketId` matches
  `B`'s own bucket (`Deseos`), never `A`'s
- AND this scenario MUST run against a real Postgres instance — a mocked repository can assert the query
  shape but cannot prove which row the database actually returns for the ambiguous `nombre`

## ADDED Requirements

### Requirement: CAT038-13 — Category uniqueness is enforced per bucket at the database level (ADR-042)

`Categoria` MUST be unique per `(userId, bucketId, nombre)` — a `@@unique` index on exactly those three
columns, in that field order — and the prior `(userId, nombre)` unique index MUST NOT exist. This
supersedes ONLY the `(userId, nombre)` uniqueness clause of CAT037-01 (and the identical clause in
ADR-036/037); every other CAT037-01 guarantee — NOT NULL `userId`, bootstrap-user ownership, no FK
repointed by the migration — remains unchanged and binding. Because `(userId, nombre)` was unique before
this migration, no two pre-existing rows share that pair, so none can violate the superset key
`(userId, bucketId, nombre)`: the migration MUST NOT reject, alter, reassign, or delete any pre-existing
row (pure relaxation, no backfill).

#### Scenario: The new compound index exists and the old one does not

- GIVEN the schema after the migration is applied
- WHEN the database's indexes on `Categoria` are inspected
- THEN a unique index on `(userId, bucketId, nombre)` exists and no unique index on `(userId, nombre)`
  alone exists

#### Scenario: Pre-existing rows survive the migration untouched

- GIVEN a database with rows satisfying the pre-migration `(userId, nombre)` uniqueness
- WHEN the migration is applied
- THEN every row persists with its original `id`, `userId`, `bucketId`, and `nombre` unchanged, and no
  row is rejected

### Requirement: CAT038-14 — Generated API contract reflects the categoriaId reclassify field (ADR-042)

`openapi.json` MUST document `PATCH /api/transacciones/:id/categoria`'s request body as
`{ categoriaId: string }`, with no `categoria`/`nombre` field, and MUST pass `openapi:check`.
`@moneydiary/api-client`'s generated types MUST be regenerated to match and MUST pass its CI drift gate.

#### Scenario: Contract generation stays green after the field rename

- GIVEN the reclassify Zod schema now requires `categoriaId` and rejects `categoria`
- WHEN `openapi:check` and the `api-client` CI drift job run
- THEN both pass with zero drift
