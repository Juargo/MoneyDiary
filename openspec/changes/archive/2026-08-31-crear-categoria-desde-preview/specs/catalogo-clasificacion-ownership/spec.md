# Delta for Catalog Ownership — Create a Categoría with Patrones in One Call

**Change**: `crear-categoria-desde-preview`
**Capability**: `catalogo-clasificacion-ownership` (extends `openspec/specs/catalogo-clasificacion-ownership/spec.md`)

## Purpose

Extends `POST /api/categorias` (CAT038-01) to optionally create the categoría's
`patrones` in the same atomic call, so a web client can offer "create categoría
+ patrones" as a single action instead of a create-categoría-then-create-N-patrones
sequence. Locked product decision: the save is one transaction, all-or-nothing
(proposal decision 4). This delta does not touch `GET`/`PATCH`/`DELETE`
`/api/categorias` or `/api/patrones` (CAT038-02/03/04/05) — those endpoints and
their existing contracts are unaffected.

## ADDED Requirements

### Requirement: CAT038-10 — Category creation accepts an optional nested patrones list, created atomically

`POST /api/categorias` MUST accept an optional `patrones` array of
`{ patron, matchType }` objects. When `patrones` is present and non-empty, the
categoría and every submitted patrón MUST be created in one database
transaction: if any patrón fails validation, or persistence of the categoría
or any patrón fails, none of them MUST be persisted (all-or-nothing). Each
created patrón's `prioridad` MUST default server-side to the same value
`POST /api/patrones` already defaults to (100) — the caller MUST NOT supply
`prioridad` for nested patrones.

When `patrones` is omitted or an empty array, the endpoint's request and
response contract, and persisted state, MUST be identical to the pre-existing
CAT038-01 contract — this is an additive, backward-compatible extension.
Existing clients that never send `patrones` (including mobile, ADR-038) MUST
see no behavior change.

The `201` response body MUST be the created categoría including its created
patrones nested (`CategoriaResponse.patrones`), the same shape
`GET /api/categorias` already returns per category (CAT038-02). When
`patrones` is empty or omitted, the response's `patrones` field MUST be `[]`,
unchanged from today.

#### Scenario: Categoría and patrones are created atomically

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos", patrones: [{ patron: "petco", matchType: "CONTAINS" }, { patron: "vet", matchType: "CONTAINS" }] }`
- THEN the response is `201` with the new categoría's id and both patrones nested, each with its own real id
- AND both patrones are persisted in the same transaction as the categoría

#### Scenario: A failing patrón rolls back the whole request

- GIVEN an authenticated non-demo user submits a categoría with 2 patrones, where the second has an invalid REGEX
- WHEN the request is processed
- THEN the response is `400`
- AND neither the categoría nor the first (otherwise valid) patrón is persisted

#### Scenario: Omitting patrones behaves exactly as before

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos" }` (no `patrones` field)
- THEN the response and persisted state are identical to the pre-existing CAT038-01 contract
- AND the response's `patrones` field is `[]`

#### Scenario: Empty patrones array behaves like omission

- GIVEN an authenticated non-demo user
- WHEN they POST `{ nombre: "Mascotas", bucket: "Deseos", patrones: [] }`
- THEN the response is `201` with `patrones: []` and no patrón row is created

#### Scenario: prioridad is not caller-supplied for nested patrones

- GIVEN a POST with a nested patrón that has no `prioridad` field
- WHEN the categoría is created
- THEN the persisted patrón's `prioridad` is `100`, the same default `POST /api/patrones` uses today

#### Scenario: A demo session cannot use the nested-patrones create path

- GIVEN a demo session
- WHEN it POSTs `{ nombre, bucket, patrones: [...] }`
- THEN the response is `403` with `code: "DEMO_SOLO_LECTURA"`
- AND nothing is persisted (regression guard for CAT038-08, unchanged by this change)

### Requirement: CAT038-11 — Nested patrón validation reuses existing domain rules and reports the failing entry by index

Each entry in the submitted `patrones` array MUST be validated with the exact
same domain rules `POST /api/patrones` already enforces: `patron` trimmed
1–200 chars (`PATRON_INVALIDO`), `matchType` in
`CONTAINS`/`STARTS_WITH`/`REGEX` (`MATCH_TYPE_INVALIDO`), and a compilable
`REGEX` when `matchType: "REGEX"` (`REGEX_INVALIDA`). All entries MUST be
validated before any write occurs (locked decision 4 — no partial catalog
state is reachable).

Two or more entries in the SAME submitted list whose `patron` text collides
case-insensitively MUST be rejected with `PATRON_DUPLICADO` (`409`),
identically to the existing cross-request duplicate check a caller's catalog
already enforces. A nested patrón colliding case-insensitively with a patrón
the caller already owns MUST also be rejected with `PATRON_DUPLICADO`.

Any per-patrón validation failure's error response MUST identify the failing
entry by its zero-based index in the submitted `patrones` array, so a client
can point the user at the specific offending row. The set of possible error
codes for this endpoint stays the pre-existing closed list
(`NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `PATRON_INVALIDO`,
`MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`, `NOMBRE_DUPLICADO`,
`PATRON_DUPLICADO`, `DEMO_SOLO_LECTURA`) — this change introduces no new error
code.

#### Scenario: Invalid matchType in a nested patrón is rejected with its index

- GIVEN a POST with `patrones: [{ patron: "netflix", matchType: "CONTAINS" }, { patron: "spotify", matchType: "FUZZY" }]`
- WHEN the request is validated
- THEN the response is `400` with `code: "MATCH_TYPE_INVALIDO"` and identifies the failing entry at index 1
- AND nothing is persisted

#### Scenario: Duplicate patrón text within the same submitted list is rejected

- GIVEN a POST with `patrones: [{ patron: "netflix", matchType: "CONTAINS" }, { patron: "Netflix", matchType: "STARTS_WITH" }]`
- WHEN the request is validated
- THEN the response is `409` with `code: "PATRON_DUPLICADO"` and identifies the colliding entry
- AND nothing is persisted

#### Scenario: A nested patrón colliding with an existing catalog patrón is rejected

- GIVEN the caller already owns a patrón with text "netflix"
- WHEN they POST a categoría with a nested patrón `{ patron: "Netflix", matchType: "CONTAINS" }`
- THEN the response is `409` with `code: "PATRON_DUPLICADO"`
- AND neither the categoría nor any of its other valid nested patrones is persisted

#### Scenario: Invalid REGEX in a nested patrón is rejected before any write

- GIVEN a POST with a nested patrón `{ patron: "(unbalanced", matchType: "REGEX" }`
- WHEN the request is validated
- THEN the response is `400` with `code: "REGEX_INVALIDA"` and the failing entry's index
- AND no categoría or patrón row is persisted

#### Scenario: No new error code is introduced

- GIVEN the full set of validation failures reachable through the nested-patrones create path
- WHEN each failure is mapped to an HTTP response
- THEN every `code` value belongs to the pre-existing closed set already used by `POST /api/patrones` and `POST /api/categorias`

### Requirement: CAT038-12 — Generated API contract stays in sync with the extended create endpoint

`openapi.json` MUST document the optional `patrones` request field and the
resulting response shape on `POST /api/categorias`, and MUST pass
`openapi:check`. `@moneydiary/api-client`'s generated types MUST be
regenerated to reflect the extended request/response types and MUST pass its
CI drift gate.

#### Scenario: Contract generation stays green after the extension

- GIVEN the extended `POST /api/categorias` schema (optional nested `patrones`) is implemented
- WHEN `openapi:check` and the `api-client` CI drift job run
- THEN both pass with zero drift

## Non-Goals

- Extending `PATCH`/`DELETE /api/categorias` or `/api/patrones` — this delta
  only touches the `POST /api/categorias` create path.
- Priority editing for nested patrones — the server default (100) always
  applies, same as `POST /api/patrones` today (CAT038-05).
- A two-call fallback or partial-success mode — the transaction is
  all-or-nothing, no design alternative is in scope.
- Any new error code beyond the pre-existing closed set.
