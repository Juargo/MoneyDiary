# Spec: US-058 — Register a Manual Movement (backend)

**Change**: `us-058-registro-manual`
**Type**: New capability — `POST /api/movimientos`
**Depends on**: US-057 chain merged to `main` (apply precondition, binding decision 1)

---

## Purpose

Adds the backend capability to register a single movement typed by hand.
No existing spec covers this domain; this is a full spec for the new
`registro-movimiento-manual` domain.

---

## Requirements

### Requirement: MAN-01 — Domain validation of a manual movement via Result

The system MUST validate every manual movement at the domain layer before any
persistence attempt. Validation failures MUST be returned as `Result.fail(error)`;
the domain layer MUST NOT throw exceptions.

Invariants:

| Field | Rule |
|-------|------|
| `tipo` | MUST be one of `{Ingreso, Gasto}` |
| `fecha` | MUST be ≤ today (ISO date); future dates MUST fail with a 400 |
| `descripcion` | MUST be present and non-empty; max length follows repo precedent |
| `monto` | MUST be a positive integer expressed as a BigInt-safe string; MUST be > 0; MUST NOT be a float; MUST be overflow-guarded at the `number → BigInt` boundary via the overflow guard established in `MovimientoManual.crear` (D-01-a; `transaccion.mapper.ts` has no such guard — it is a `bigint→bigint` passthrough) |
| `cargo / abono` | Derived from `tipo` — Ingreso: `{abono=monto, cargo=0}`; Gasto: `{cargo=monto, abono=0}` |

Amounts MUST be scrubbed from every error message (domain layer and HTTP 400 boundary).

#### Scenario: Valid Ingreso movement passes domain validation

- GIVEN `tipo=Ingreso`, `fecha=today`, `descripcion="Reembolso"`, `monto="45000"`
- WHEN the domain factory validates the movement
- THEN validation returns `Result.ok` and `abono=45000n`, `cargo=0n`

#### Scenario: Future fecha is rejected

- GIVEN `fecha` is one day ahead of today in ISO format
- WHEN the domain factory validates the movement
- THEN validation returns `Result.fail` with a fecha-invalid error
- AND the HTTP layer returns 400 with no raw amount in the message

#### Scenario: Zero or negative monto is rejected

- GIVEN `monto="0"` or `monto="-500"`
- WHEN the domain factory validates the movement
- THEN validation returns `Result.fail`
- AND the HTTP layer returns 400 with no raw amount in the message

#### Scenario: Float monto string is rejected

- GIVEN `monto="12.50"`
- WHEN the domain factory validates the movement
- THEN validation returns `Result.fail`

#### Scenario: monto exceeding `Number.MAX_SAFE_INTEGER` is overflow-guarded

- GIVEN `monto` as a string whose numeric value exceeds `Number.MAX_SAFE_INTEGER`
- WHEN the domain factory validates the movement
- THEN validation returns `Result.fail` with an overflow error (same guard as `transaccion.mapper.ts`)

#### Scenario: Empty descripcion is rejected

- GIVEN `descripcion=""` or `descripcion` absent
- WHEN the domain factory validates the movement
- THEN validation returns `Result.fail`

---

### Requirement: MAN-02 — Ingreso auto-classification is invisible to the caller

When `tipo=Ingreso`, the system MUST classify the movement as
`{bucket=Ingreso, categoriaId=null}` by construction.
The caller MUST NOT be required to supply `bucket` or `categoriaId`.
`CategorizarTransaccionUseCase` MUST NOT be invoked.

The endpoint contract defines the behavior for an Ingreso request that
includes stray `bucket` or `categoriaId` fields. The design phase pins whether
the endpoint strict-rejects (400) or silently ignores them; the spec requires
only that the behavior is consistent and documented in `openapi.json`.

#### Scenario: Ingreso movement is auto-classified without caller input

- GIVEN `tipo=Ingreso`, `monto="45000"`, no `bucket` or `categoriaId` in the body
- WHEN the use case registers the movement
- THEN the persisted row has `bucket=Ingreso`, `categoriaId=null`, `abono=45000n`, `cargo=0n`
- AND the 201 response includes `bucket: "Ingreso"` and `categoriaId: null`
- AND `CategorizarTransaccionUseCase` is not called

#### Scenario: Ingreso response always carries classification fields (design pins strict vs ignore)

- GIVEN `tipo=Ingreso` with stray `bucket="Deseos"` and `categoriaId="cat_x"` in the body
- WHEN the endpoint processes the request
- THEN the response behavior is consistent and documented (design resolves strict-reject vs ignore)
- AND if accepted, the persisted row still has `bucket=Ingreso`, `categoriaId=null`

---

### Requirement: MAN-03 — Gasto cascade validates bucket and categoriaId against the caller's own catalog

When `tipo=Gasto`, the caller MUST supply both `bucket` ∈
`{Necesidades, Deseos, Ahorro}` and a `categoriaId`.
The system MUST:

1. Load the caller's catalog via `ICategoriaRepository.listarConPatrones(userId)`.
2. Build `Map<categoriaId, Bucket>`.
3. Reject a `categoriaId` absent from the map with `CategoriaFueraDeCatalogoError` → 400.
4. Reject a `categoriaId` whose mapped bucket ≠ the supplied `bucket` with
   `BucketCategoriaNoConcuerdaError` → 400.

Both error messages MUST be fixed and scrub-safe (no amounts, no raw ids from the body).
Cross-tenant `categoriaId` (belonging to another user's catalog) MUST be treated as absent from the map and rejected (RNF-SEC-006).

#### Scenario: Valid Gasto with matching categoriaId and bucket is accepted

- GIVEN `tipo=Gasto`, `bucket="Deseos"`, `categoriaId` belonging to the caller's catalog under bucket Deseos
- WHEN the use case validates and registers the movement
- THEN the persisted row has `cargo=monto`, `abono=0`, `bucketId=Deseos`, `categoriaId` as supplied
- AND the response is 201

#### Scenario: categoriaId outside the caller's catalog is rejected

- GIVEN `tipo=Gasto` and a `categoriaId` that does not exist in the caller's catalog
- WHEN the use case validates the gasto
- THEN `Result.fail(CategoriaFueraDeCatalogoError)` is returned
- AND the HTTP layer returns 400 with a fixed scrub-safe message

#### Scenario: Cross-tenant categoriaId is rejected as outside the catalog

- GIVEN user B sends a `categoriaId` that belongs to user A's catalog
- WHEN user B's request is processed
- THEN the result is 400 (`CategoriaFueraDeCatalogoError`)
- AND user A's catalog data is never exposed in the response or error

#### Scenario: categoriaId belongs to caller's catalog but in a different bucket

- GIVEN `tipo=Gasto`, `bucket="Necesidades"`, and a `categoriaId` that exists in
  the caller's catalog but maps to `Deseos`
- WHEN the use case validates the gasto
- THEN `Result.fail(BucketCategoriaNoConcuerdaError)` is returned
- AND the HTTP layer returns 400 with a fixed scrub-safe message

#### Scenario: Missing bucket or categoriaId on a Gasto request is rejected

- GIVEN `tipo=Gasto` with `bucket` absent or `categoriaId` absent
- WHEN the endpoint parses the request
- THEN the response is 400 with a descriptive message

---

### Requirement: MAN-04 — Persisted row is identifiable as origin "Manual" and immune to delete-ingesta

The system MUST persist the manual movement such that:

- `ingestaId` is `null` (schema relaxed from NOT NULL as per approach C).
- An `origen` column is set (design pins C-a `String?` default `null=ingesta-born` vs C-b `NOT NULL` backfilled — behavior-neutral; either way manual rows carry a non-ingesta marker).
- `accountId` is NOT NULL, pointing to the per-user sentinel `Account(banco='Manual')`, which is created lazily by the writer (find-or-create, idempotent) on the first manual movement.
- The sentinel `Account(banco='Manual')` feeds US-052's Origen column without any reader change (the account join already derives the origin from `banco`).
- Manual rows MUST be immune to `PrismaEliminarIngestaRepository.eliminarConTransacciones` by construction (`ingestaId IS NULL` means the delete-WHERE never matches them).

#### Scenario: Persisted manual row has null ingestaId and sentinel accountId

- GIVEN a successful `POST /api/movimientos` call
- WHEN the row is inspected in the DB
- THEN `ingestaId` is `null`
- AND `accountId` references a row in `Account` with `banco='Manual'` and `userId` matching the caller
- AND the `origen` column carries the non-ingesta marker (design pins exact value)

#### Scenario: Origen column shows "Manual" in resumen readers (zero reader changes)

- GIVEN a manual movement was registered for user A in period M
- WHEN the client calls a reader that exposes an Origen column (e.g. `GET /api/ingresos/mes`)
- THEN the Origen for the manual row is "Manual" (derived from `Account.banco` via the existing account join)
- AND no reader code was changed to achieve this

#### Scenario: delete-ingesta never removes a manual row

- GIVEN a manual movement exists for user A (`ingestaId=null`)
- AND user A also has an ingesta-born movement
- WHEN `DELETE /api/ingestas/:id` is called for the ingesta-born movement
- THEN the manual movement is untouched (its `ingestaId IS NULL` means it falls outside the delete WHERE clause)
- AND the ingesta-born movement is deleted

#### Scenario: Sentinel account is created on first manual movement and reused thereafter

- GIVEN user A has no sentinel `Account(banco='Manual')` yet
- WHEN user A registers a manual movement
- THEN exactly one sentinel `Account(banco='Manual')` row is created for user A
- WHEN user A registers a second manual movement
- THEN no additional sentinel account is created (idempotent find-or-create)

---

### Requirement: MAN-05 — Manual movement contributes to resumen, percentages, and semáforo automatically

A correctly persisted manual movement MUST be reflected in the month resumen,
the 50/30/20 bucket percentages, and the semáforo for its period, with no
changes to the readers (`PrismaResumenMesRepository`, `PrismaDetalleBucketRepository`,
`PrismaMovimientosMesRepository`). These readers filter by `account:{userId}` with
no ingesta filter; the manual row's presence in the correct bucket produces the
correct aggregation by construction (ADR-024).

#### Scenario: Manual Ingreso row appears in the month's Ingresos total

- GIVEN user A has no transactions in period M
- WHEN user A registers a manual Ingreso of `monto="50000"` in period M
- THEN `GET /api/resumen?periodo=M` returns `Ingresos.total = "50000"`
- AND the semáforo reflects the updated totals

#### Scenario: Manual Gasto row appears in the correct bucket subtotal

- GIVEN user A has no transactions in period M
- WHEN user A registers a manual Gasto of `monto="12000"` in bucket Deseos, period M
- THEN `GET /api/resumen?periodo=M` returns `Deseos.total = "12000"`
- AND the Deseos percentage is computed over the Ingresos base (existing formula)
- AND no reader code was changed to achieve this

#### Scenario: Manual movement in period M does not affect period N resumen

- GIVEN user A has no transactions in period N
- WHEN user A registers a manual movement in period M
- THEN `GET /api/resumen?periodo=N` is unaffected (zero totals for N)

---

### Requirement: MAN-06 — User isolation and openapi.json contract

Every write and read in the manual registration path MUST be scoped by the
caller's `userId` (RNF-SEC-006). The endpoint MUST require both a valid session
and `x-api-key`. `openapi.json` MUST be updated to reflect `POST /api/movimientos`
(ADR-011).

The sentinel `Account(banco='Manual')` is per-user; its find-or-create key
includes `userId`. A user can never register a movement into another user's space.

#### Scenario: User B cannot register a movement into user A's space

- GIVEN two users A and B with valid sessions
- WHEN user B calls `POST /api/movimientos` with a valid body
- THEN the persisted movement belongs exclusively to user B's `userId`
- AND user A's data is neither read nor modified

#### Scenario: User A's resumen is unaffected by user B's manual movement

- GIVEN user A has existing transactions in period M
- WHEN user B registers a manual movement in period M
- THEN `GET /api/resumen?periodo=M` for user A returns the same values as before

#### Scenario: Unauthenticated request is rejected

- GIVEN a request to `POST /api/movimientos` with no session token
- WHEN the middleware evaluates the request
- THEN the response is 401 and no movement is registered

#### Scenario: openapi.json includes POST /api/movimientos (ADR-011)

- GIVEN the updated `openapi.json`
- WHEN the spec is inspected for `POST /api/movimientos`
- THEN the operation is present with the correct request schema (tipo, fecha, descripcion, monto, and conditional bucket/categoriaId for Gasto) and the 201 response schema
- AND a CI contract check passes

---

## MODIFIED Requirements (existing specs updated by this change)

### Requirement: ISO-01 — `userId` is derived from the session for every data endpoint

(Previously: applies to 7 controllers — `resumen`, `movimientos`, `detalle-bucket`,
`ingesta`, `resumen/semaforo`, `detalle-bucket-mes`, `ingresos-mes`. Revised,
US-058: the count grows from 7 to 8 with the `POST /api/movimientos` handler —
the rule is unchanged, only the endpoint count increases.)

Each of the 8 controllers (adding the `POST /api/movimientos` handler to the
existing 7) MUST resolve `userId` from the request's validated session.
None of them MUST inject or fall back to a hardcoded user id, and none MUST
accept `x-api-key` alone as sufficient identity.

#### Scenario: Data endpoint uses the session's userId

- GIVEN a user is logged in with a valid session
- WHEN they call any of the 8 data endpoints
- THEN the data returned or written belongs to the session's `userId`, not to any hardcoded constant

#### Scenario: Mobile `/api/resumen` call has no keyless fallback

- GIVEN the mobile app has a valid `x-api-key` but no stored session token
- WHEN it calls `GET /api/resumen`
- THEN the response status is 401
- AND no data is returned under a fallback/default `userId`

---

### Requirement: ISO-02 — Cross-user isolation across all data endpoints

(Previously: isolation applies to 7 endpoints. Revised, US-058: isolation
extends to `POST /api/movimientos`; user B's registration MUST NOT affect
user A's data or resumen. All existing scenarios unchanged.)

A user authenticated as A MUST NOT be able to read or write data belonging to
user B through any of the 8 data endpoints — `resumen`, `movimientos`,
`detalle-bucket`, `ingesta`, `resumen/semaforo`, `detalle-bucket-mes`,
`ingresos-mes`, and `POST /api/movimientos` — regardless of request parameters
or transport. User B's manual movement MUST NOT appear in user A's resumen,
bucket totals, or movement list.

#### Scenario: User A cannot read user B's resumen (web cookie session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data
- AND no field of the response reflects B's amounts or buckets

#### Scenario: User A cannot read user B's resumen (mobile Bearer session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN the mobile app authenticated as A (via `Authorization: Bearer`) calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data, identically to the web-cookie case

#### Scenario: User A cannot read user B's Sin categoría count

- GIVEN two seeded users A and B, each with uncategorized cargo transactions in the same period
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN A's Sin categoría count and total reflect only A's uncategorized cargo transactions

#### Scenario: User A cannot read user B's movimientos

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/movimientos?periodo=<period>`
- THEN only A's transactions are returned

#### Scenario: User A cannot read user B's bucket detail

- GIVEN two seeded users A and B with transactions in the same bucket
- WHEN a client logged in as A calls the bucket-detail endpoint for that bucket
- THEN only A's transactions for that bucket are returned

#### Scenario: User A cannot trigger or read user B's ingesta

- GIVEN two seeded users A and B
- WHEN a client logged in as A calls the ingesta endpoint
- THEN any created/read ingesta record is scoped to A

#### Scenario: User A cannot read user B's semáforo diagnosis or advice

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN A's diagnosis names only A's own driving bucket
- AND none of B's data is reflected

#### Scenario: User A cannot read user B's bucket detalle mes

- GIVEN two seeded users A and B with transactions in the same bucket for the same period
- WHEN a client logged in as A calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN the response reflects only A's transactions

#### Scenario: User A cannot read user B's income rows

- GIVEN two seeded users A and B with income rows for the same period
- WHEN a client logged in as A calls `GET /api/ingresos/mes?periodo=<period>`
- THEN every `transacciones` entry reflects only A's income rows

#### Scenario: User B's manual movement does not appear in user A's resumen (new, US-058)

- GIVEN user A has existing transactions in period M
- WHEN user B registers a manual movement (Ingreso or Gasto) in period M
- THEN `GET /api/resumen?periodo=M` for user A is unchanged
- AND user B's manual movement row is never aggregated into user A's totals

---

## Regression Guards

### Requirement: REG-01 — Existing ingesta-born transactions are unaffected by the schema migration

The migration that relaxes `Transaccion.ingestaId` to nullable and adds the
`origen` column MUST NOT alter any existing ingesta-born `Transaccion` row's
observable behavior. All ingesta-born rows retain their non-null `ingestaId`.
Readers that join on `account:{userId}` continue to work without modification.

#### Scenario: Existing ingesta-born row is unchanged after migration

- GIVEN an ingesta-born `Transaccion` row with a non-null `ingestaId` before migration
- WHEN the migration runs
- THEN the row still has the same non-null `ingestaId` and all other fields unchanged
- AND `GET /api/resumen` returns the same aggregated totals as before the migration

#### Scenario: Delete-ingesta still removes only ingesta-born rows

- GIVEN ingesta-born transactions and manual transactions both exist for user A
- WHEN `DELETE /api/ingestas/:id` is called
- THEN only the ingesta-born transactions matching that `ingestaId` are deleted
- AND all manual transactions (with `ingestaId=null`) remain intact

---

## Testing Emphasis (ADR-014/015)

| Layer | Focus |
|-------|-------|
| Unit — domain | `MovimientoManual` factory: fecha future/past, monto BigInt/overflow/float/zero, tipo invariants, Result path (no throws) |
| Unit — use case | Ingreso auto-class (no catalog call), Gasto cascade both error paths (`CategoriaFueraDeCatalogoError`, `BucketCategoriaNoConcuerdaError`), amounts scrubbed from all errors |
| Unit — composition | `crearRegistrarMovimientoManual` has no read-only-only restriction violations (SOLID/ISP: narrow writer port) |
| Integration | Persisted row feeds resumen/percentages/semáforo; sentinel account find-or-create; delete-ingesta immunity; user B cannot register into or read user A's movement; migration backward-compatibility of ingesta-born rows |
| Contract | `openapi.json` includes `POST /api/movimientos` with correct schemas; CI contract check green |
