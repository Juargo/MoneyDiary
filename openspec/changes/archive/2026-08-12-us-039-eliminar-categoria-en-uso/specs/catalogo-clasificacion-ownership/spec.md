# Delta for Catalog Ownership — Delete an In-Use Category (US-039)

## ADDED Requirements

### Requirement: CAT039-01 — Category listing reports the caller's per-category transaction count

`GET /api/categorias` MUST include a `transaccionesCount` field per
category, counting only the caller's own `Transaccion` rows that reference
that category, across all periods (all-history, never scoped to the
current month). The count MUST be produced by a `userId`-scoped query (SQL
`WHERE`), never by an in-memory filter over an unscoped result set. A
category with zero referencing transactions — including a category created
one moment earlier — MUST report `transaccionesCount: 0`.

This count is the only impact-preview mechanism for a destructive delete
(CAT038-04): there is no dedicated impact endpoint and no server-side
confirm step. A client warns the user using the number it already fetched
in the listing.

#### Scenario: transaccionesCount reflects all-history transactions

- GIVEN a user's category is referenced by 12 transactions spread across 3
  different periods
- WHEN the caller GETs `/api/categorias`
- THEN that category's `transaccionesCount` is 12

#### Scenario: transaccionesCount never counts another user's transactions

- GIVEN user A and user B each own a category with the same nombre, and
  each has transactions referencing their own category
- WHEN user A GETs `/api/categorias`
- THEN user A's category shows only user A's own transaction count, and
  never reflects user B's transactions

#### Scenario: A brand-new category reports zero

- GIVEN a category just created via `POST /api/categorias`
- WHEN the caller GETs `/api/categorias`
- THEN that category's `transaccionesCount` is 0

## MODIFIED Requirements

### Requirement: CAT038-04 — Category deletion always succeeds, preserving transactions and their bucket

`DELETE /api/categorias/:id` MUST delete the category together with its
patterns, in one DB transaction, and MUST return `204` regardless of
whether any `Transaccion` (any period) references the category. The `409`
response and `CategoriaEnUsoError` for this endpoint MUST NOT exist.

Every `Transaccion` that referenced the deleted category MUST survive the
delete unchanged except for its category label: it MUST NOT be deleted and
MUST NOT be reassigned to a different category. Its `categoriaId` MUST
become `null`; its `bucketId` MUST remain exactly what it was before the
delete.

Because bucket classification is the only input to the 50/30/20 summary
and the semáforo, and the delete never touches `bucketId`, deleting a
category MUST NOT change `/api/resumen`, its bucket subtotals, its
percentages, or the semáforo for any period — before and after the delete,
those values MUST be identical.

The category's patterns MUST be deleted as part of the same DB transaction
as the category; a failure partway through MUST leave the category, its
patterns, and every referencing transaction exactly as they were
(atomicity is unconditional, not only for the previously-unused case).

The endpoint's generated OpenAPI operation MUST drop the `409` response and
its description MUST no longer mention a rejection for in-use categories;
`openapi.json` and `@moneydiary/api-client` regeneration MUST pass their
existing CI drift gates (CAT038-09).

(Previously: `DELETE /api/categorias/:id` returned `409` and refused the
delete if any `Transaccion` referenced the category, cascading patterns
only in the unused case.)

#### Scenario: Deleting an in-use category succeeds and detaches its transactions

- GIVEN a category referenced by transactions across multiple periods,
  each transaction carrying a `bucketId`
- WHEN the caller DELETEs it
- THEN the response is `204`; the category and its patterns are gone;
  every previously-referencing transaction still exists, with
  `categoriaId: null` and its original `bucketId` unchanged

#### Scenario: Deleting an unused category still cascades its patterns

- GIVEN a category with 3 patterns and zero transactions
- WHEN the caller DELETEs it
- THEN the response is `204` and both the category and its 3 patterns are
  gone

#### Scenario: Deleting a category never moves money between buckets

- GIVEN a user's `/api/resumen` payload for a period — bucket subtotals,
  percentages and semáforo state — captured before deleting one of their
  in-use categories
- WHEN that category is deleted and `/api/resumen` is requested again for
  the same period
- THEN the two payloads are identical: no transaction's `bucketId` changed,
  so no amount moved between Necesidades/Deseos/Ahorro and the semáforo
  state is unchanged

> Note: issue #273's original wording for this criterion ("the month
> summary reflects the change") is superseded by production evidence — 85%
> of live transaction rows already have `categoriaId IS NULL` with a real
> `bucketId` and already count toward the budget, so that wording would be
> satisfied vacuously (nothing visibly "reflects" a label loss in money
> terms). This requirement instead asserts the opposite and falsifiable
> claim: deleting a category changes no money total anywhere.

#### Scenario: A failed delete leaves category, patterns and transactions untouched

- GIVEN a category with patterns and in-use transactions
- WHEN the delete transaction fails partway (e.g. a constraint violation)
- THEN the category, all of its patterns, and every referencing
  transaction remain exactly as they were before the attempt — none is
  partially deleted or partially detached

#### Scenario: Deleting another user's category id is a 404, and their data is untouched

- GIVEN user B's real category id, itself referenced by user B's own
  transactions
- WHEN user A DELETEs that id
- THEN the response is `404`; user B's category, its patterns and its
  transactions are all unaffected

#### Scenario: A demo session cannot delete a category

- GIVEN a demo session
- WHEN it calls DELETE on any of its own category ids
- THEN the response is `403` with `code: "DEMO_SOLO_LECTURA"`, and nothing
  is deleted (regression guard for CAT038-08, unchanged by this change)

## Non-Goals

- Any web or mobile UI for catalog management — deferred to future work
  (US-043).
- Bulk reassignment of a deleted category's transactions to **another**
  category — a different product feature (a migration wizard), not a
  safety net for delete.
- Nulling `bucketId` along with `categoriaId` on delete — rejected with
  production evidence (CAT038-04): it would create two indistinguishable
  "Sin categoría" states that behave differently in the budget.
- A dedicated `GET /api/categorias/:id/impacto` endpoint — the count
  travels in the existing listing (CAT039-01) instead.
- A server-side `?confirm=true` / two-phase delete — trivially bypassable
  and guarantees nothing a client-side warning does not already provide.
- Restoring a deleted category or undoing the un-labelling of its
  transactions — the warning (CAT039-01) is the safeguard; recovery, if
  ever needed, is a database-level point-in-time restore, not a product
  feature.
- A composite `(categoriaId, userId)` FK on `Transaccion` (the structural
  guarantee `PatronClasificacion` already has) — deferred; no observed
  cross-tenant defect today.
- Importing/merging suggested categories into an existing user's catalog.
- Any new signup flow — the copy hook only lands in the two user-creation
  points that exist today.
- Per-user `BucketPresupuesto` — buckets stay a global fixed taxonomy of 5.
- Template versioning or propagating later template edits to existing
  users' already-copied rows.
- Demo-gating pre-existing mutations (`POST /api/ingestas`,
  `PATCH /api/transacciones/:id/categoria`). Demo users keep uploading and
  reclassifying — only the **catalog** is read-only.
