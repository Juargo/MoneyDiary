# Delta for Ingesta Management (apps/api + apps/web)

## Purpose

Widens the existing ingesta history (`GET /api/ingestas`, introduced by
US-018) from "successful ingestas only" to a full history of every terminal
upload attempt — successful (`PROCESADA`) and failed (`FALLIDA`), including
failures that occur before an `Account` is resolved. `CANCELADA` does not
exist in `EstadoIngesta` and stays out of scope (locked decision).

## MODIFIED Requirements

### Requirement: ING-03 — List endpoint returns all the caller's ingestas, success and failure, each with outcome detail

The system MUST expose `GET /api/ingestas`, guarded by the same auth chain,
returning one row per ingesta owned by the caller, ordered by `creadoEn`
descending, regardless of `estado` (`PROCESADA` or `FALLIDA` only —
`CANCELADA` MUST NOT appear, it is not a valid enum value). Each row MUST
include `id`, `nombreArchivo`, `estado`, `banco` (nullable), `fecha`
(nullable), `totalTransacciones` (set for `PROCESADA`), and `motivoFallo` (set
for `FALLIDA`). Rows owned by other users MUST NOT appear (RNF-SEC-006),
scoped by `Ingesta.userId` directly.
(Previously: filtered to `estado: PROCESADA` only, scoped via `account.userId`.)

#### Scenario: History lists successes and failures in chronological order (CA-01, CA-02)

- GIVEN user A has one early-failed upload, one late-failed upload, and one
  successful upload
- WHEN user A calls `GET /api/ingestas`
- THEN all three rows return ordered by upload time descending, each labeled
  `estado` exitoso/fallido, and no row ever shows `CANCELADA`

#### Scenario: A user lists only their own ingestas (preserved from US-018)

- GIVEN user A has 2 ingestas (any estado) and user B has 1
- WHEN user A calls `GET /api/ingestas`
- THEN exactly A's 2 rows are returned

#### Scenario: A successful ingesta reports its transaction count (CA-03)

- GIVEN a `PROCESADA` ingesta with N transacciones
- WHEN it is listed
- THEN `totalTransacciones` equals N

#### Scenario: A failed ingesta reports its failure reason instead of a count (CA-04)

- GIVEN a `FALLIDA` ingesta
- WHEN it is listed
- THEN `motivoFallo` is a non-empty string and `totalTransacciones` is 0/null

### Requirement: ING-05 — Web delete affordance is gated to PROCESADA rows; the confirmation modal shows an accurate impact count

The delete action (button + confirmation modal) MUST be offered **only** for
`PROCESADA` rows. `FALLIDA` rows MUST render `nombreArchivo`, `fecha`, and
`motivoFallo`, and MUST NOT render a delete control — deleting a failed
upload attempt is out of scope this sprint (see Non-Goals). For a
`PROCESADA` row, clicking delete MUST open an accessible
`role="alertdialog"` stating the number of transactions that will be
deleted (always `N > 0`, since `PROCESADA ⟹ accountId NOT NULL` and a
resolved `totalTransacciones`, per ING-07). Escape/Cancelar MUST close it
without deleting and return focus to the trigger. Confirmar MUST issue the
DELETE and refresh the list and derived views.
(Previously: assumed every listed row was `PROCESADA` and always deletable;
now the delete affordance itself is explicitly gated to `PROCESADA` so the
control never targets an account-less `FALLIDA` row.)

#### Scenario: FALLIDA rows render no delete control

- GIVEN a `FALLIDA` ingesta with `nombreArchivo`, `fecha`, and `motivoFallo`
- WHEN the history list renders the row
- THEN `nombreArchivo`, `fecha`, and `motivoFallo` are shown
- AND no delete button/control is rendered for that row

#### Scenario: PROCESADA delete flow is unchanged (regression, US-018)

- GIVEN a `PROCESADA` ingesta with N>0 transacciones
- WHEN the user clicks delete
- THEN the alertdialog opens showing N, and confirming issues the DELETE and
  refreshes the list

## ADDED Requirements

### Requirement: ING-07 — Early pipeline failures are recorded with direct userId isolation

The system MUST persist a `FALLIDA` `Ingesta` row for every terminal pipeline
failure, including failures before an `Account` is resolved (invalid
extension, unrecognized bank). Each such row MUST carry `userId` (NOT NULL,
from the authenticated request) directly on `Ingesta`, independent of
`accountId`. `accountId`/`banco` MAY be null. `motivoFallo` MUST be set. The
invariant `estado = PROCESADA ⟹ accountId IS NOT NULL` MUST hold.

#### Scenario: Unrecognized-bank upload is recorded as FALLIDA

- GIVEN an authenticated user uploads a cartola whose bank cannot be detected
- WHEN the upload completes
- THEN a row exists with `estado=FALLIDA`, `userId` set, `banco=null`,
  `nombreArchivo` set, and a descriptive `motivoFallo`

#### Scenario: Invalid-extension upload is recorded as FALLIDA

- GIVEN a user uploads a `.docx` file
- WHEN validation rejects it
- THEN a `FALLIDA` row is recorded with `nombreArchivo` and a `motivoFallo`
  describing the invalid extension

#### Scenario: A successful ingesta always has a resolved account

- GIVEN a `PROCESADA` ingesta
- THEN `accountId` is NOT NULL (enforced in application layer, not a DB CHECK)

### Requirement: ING-08 — Multi-tenant isolation of the widened history (RNF-SEC-006)

`GET /api/ingestas` MUST scope exclusively by the caller's own
`Ingesta.userId`, for both `PROCESADA` and `FALLIDA` rows, including rows
where `accountId` is null.

#### Scenario: A user never sees another user's ingestas, including accountId-null ones

- GIVEN user A has 1 successful and 1 failed ingesta, and user B has 1 failed
  ingesta with `accountId` null
- WHEN user A calls `GET /api/ingestas` (integration-level test)
- THEN exactly A's 2 rows return; B's row never appears

### Requirement: ING-09 — Stored failure reasons never leak raw monetary amounts

`motivoFallo` MUST NOT contain raw transaction amounts or balances.
`ProcessIngestaError` messages MUST interpolate only structural context
(file name, bank, column/row labels), never numeric monetary values.

#### Scenario: A structural-validation failure's motivoFallo has no monetary figures

- GIVEN a cartola that fails structure validation on a row containing a real
  amount
- WHEN the failure is recorded
- THEN `motivoFallo` describes the structural problem and contains no
  currency-formatted or numeric monetary value from that row

## Non-Goals

- `CANCELADA` / third outcome — not a valid `EstadoIngesta` value, out of scope.
- Revert/undo/re-download the original file.
- Filtros avanzados, búsqueda, paginación.
- Mobile UI for history.
- Deleting a `FALLIDA` row is OUT OF SCOPE this sprint (resolved by design
  §8/D8, closing the open question proposal §7.3 raised): the delete
  affordance is gated to `PROCESADA` rows only. Enabling delete for failed
  attempts is a documented follow-up, not built now.
- Reconciliación de `PENDIENTE` huérfanos (separate follow-up).
