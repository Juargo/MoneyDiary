# Delta for Ingesta Management (apps/api + apps/web)

## Purpose

New capability: users can list their own ingestas and hard-delete one
(cascading its `Transaccion` rows atomically), with an accessible web
confirmation and cache invalidation of every derived money view. No existing
spec covers ingesta deletion/listing — all requirements below are additions.

## ADDED Requirements

### Requirement: ING-01 — Authenticated cascade delete removes an ingesta and its transacciones atomically

The system MUST expose `DELETE /api/ingestas/:id`, guarded by the same
`ApiKeyGuard` + `SessionGuard` chain as other data routes. On success it MUST
delete the ingesta row and ALL of its `Transaccion` rows inside a single
atomic `$transaction`; partial deletion MUST NOT be observable.

#### Scenario: Owner deletes an ingesta and derived views recalculate

- GIVEN an authenticated user who owns ingesta I with N `Transaccion` rows
- WHEN they call `DELETE /api/ingestas/I`
- THEN the response is 200/204, and I plus its N rows no longer exist
- AND a subsequent `GET /api/resumen` for the affected period recalculates
  without them

#### Scenario: A simulated mid-delete failure leaves nothing deleted

- GIVEN a delete that fails partway through the transaction (simulated DB
  error)
- WHEN the failure occurs
- THEN neither the ingesta nor any `Transaccion` row is deleted (all-or-nothing)

### Requirement: ING-02 — Delete is userId-isolated and anti-enumeration (RNF-SEC-006)

The delete endpoint MUST scope BOTH the child and parent delete statements by
the caller's `userId` (via `Ingesta.accountId → Account.userId`), per
RNF-SEC-006. A foreign-owned id and a nonexistent id MUST both return the
IDENTICAL 404 response, with no field distinguishing "not found" from "not
yours."

#### Scenario: A foreign ingesta cannot be deleted

- GIVEN user A and ingesta I owned by user B
- WHEN user A calls `DELETE /api/ingestas/I`
- THEN the response is 404 and I plus all of B's `Transaccion` rows remain
  intact

#### Scenario: A nonexistent id returns the same 404 shape

- GIVEN an authenticated user and an id that does not exist
- WHEN they call `DELETE /api/ingestas/that-id`
- THEN the response is 404, identical in shape to the foreign-ingesta case

### Requirement: ING-03 — List endpoint returns only the caller's ingestas with a zero-cost impact count

The system MUST expose `GET /api/ingestas`, guarded by the same auth chain,
returning one row per ingesta owned by the caller:
`{ id, banco, fecha, totalTransacciones }`. `totalTransacciones` MUST come
from the value already persisted at commit time (no `COUNT(*)`). Rows owned
by other users MUST NOT appear (RNF-SEC-006).

#### Scenario: A user lists only their own ingestas

- GIVEN user A has 2 ingestas and user B has 1
- WHEN user A calls `GET /api/ingestas`
- THEN exactly A's 2 rows are returned, each with `id`, `banco`, `fecha`,
  `totalTransacciones`

### Requirement: ING-04 — Both endpoints require an active session

`DELETE /api/ingestas/:id` and `GET /api/ingestas` MUST reject requests
lacking a valid API key or session with the same 401 contract as other data
endpoints, evaluated BEFORE any ownership resolution.

#### Scenario: An unauthenticated request is rejected before ownership is checked

- GIVEN no valid session/API key
- WHEN either endpoint is called
- THEN the response is 401 and no ingesta/`Transaccion` row is read or
  deleted

### Requirement: ING-05 — Web confirmation modal is accessible and shows the impact count

Clicking delete on a listed ingesta MUST open an accessible
`role="alertdialog"` stating the exact number of transactions that will be
deleted. Escape or Cancelar MUST close it without deleting and MUST return
focus to the trigger. Confirmar MUST issue the DELETE and, on success, refresh
the ingesta list and derived money views.

#### Scenario: Cancel returns focus without deleting

- GIVEN the modal is open for an ingesta with N transactions
- WHEN the user presses Escape (or clicks Cancelar)
- THEN the modal closes, no DELETE request is sent, and focus returns to the
  trigger button

#### Scenario: Confirm deletes and refreshes views

- GIVEN the modal is open for an ingesta with N transactions
- WHEN the user clicks Confirmar and the DELETE succeeds
- THEN the modal closes and the ingesta list no longer shows the deleted row

### Requirement: ING-06 — Successful delete invalidates all derived query caches

On a successful delete response, the web client MUST invalidate the TanStack
Query cache keys `['resumen']`, `['resumen-anual']`, `['detalle-bucket']`, and
`['ingestas']` so every derived view refetches without the deleted rows. A
failed delete MUST NOT invalidate any cache key.

#### Scenario: All 4 cache keys are invalidated after a successful delete

- GIVEN a successful `DELETE /api/ingestas/:id` response
- WHEN the mutation's `onSuccess` handler runs
- THEN `['resumen']`, `['resumen-anual']`, `['detalle-bucket']`, and
  `['ingestas']` are all invalidated

#### Scenario: A failed delete leaves caches untouched

- GIVEN the DELETE request fails (network/500)
- WHEN the mutation's `onError` handler runs
- THEN no cache key is invalidated and the ingesta still appears in the list

## Non-Goals

- Re-upload/undo/soft-delete/export-before-delete — hard delete only.
- Mobile/CLI delete surface — web only (ADR-010/026 unaffected).
- Batch/multi-select delete — single ingesta per action.
- Column encryption 11.6 trigger — no new PII surface introduced.
