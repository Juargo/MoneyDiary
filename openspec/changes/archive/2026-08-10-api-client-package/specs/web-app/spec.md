# Web App UI Specification — Delta (apps/web)

## Purpose

Replaces the hand-written DTO interfaces in `apps/web/src/api/types.ts` with type aliases derived from
`@moneydiary/api-client`'s generated types, for every endpoint the package's contract covers. No runtime
behavior, fetch logic, error handling, or validation guard changes — this is a type-source substitution
only.

## MODIFIED Requirements

### Requirement: WAC-01 — DTO Types Are Derived, Not Hand-Written

For every endpoint covered by `apps/api/openapi.json` (see `api-client` spec), `apps/web/src/api/types.ts`
MUST declare its DTO shapes as type aliases over `@moneydiary/api-client`'s generated
`components['schemas'][...]` types, not as independently hand-written `interface` declarations. The file
MUST hold zero hand-written interface bodies for those covered endpoints; existing documentation comments
(explaining the money/date representation) MAY remain.

(Previously: `apps/web/src/api/types.ts` declared 10 hand-written `interface` DTOs manually mirroring each
backend DTO file, with no mechanical link to the actual contract.)

#### Scenario: No hand-written interface remains for a covered DTO

- GIVEN `ResumenMesDto` is covered by `apps/api/openapi.json`
- WHEN `apps/web/src/api/types.ts` is inspected after migration
- THEN `ResumenMesDto` is declared as a type alias over `@moneydiary/api-client`'s generated
  `components['schemas']['ResumenMesDto']` (or equivalent), not as a hand-written `interface` body

#### Scenario: Web typecheck passes using the derived types

- GIVEN `apps/web/src/api/types.ts` has been migrated for all endpoints covered by the contract
- WHEN `pnpm web typecheck` runs
- THEN it passes with zero type errors attributable to the migration

### Requirement: WAC-02 — Runtime Guards and Error Handling Are Unchanged

Every runtime type guard (`esMontoStringValido`, `esFechaValida`, `esResumenMesDto`, and each per-DTO
shape guard in `apps/web/src/api/client.ts`), the `ApiError` discriminated union, and every `fetch`
wrapper function MUST remain behaviorally identical after this migration. Only the type declarations these
guards check against may change (from hand-written to generated); the guard implementations, their control
flow, and the `ApiError` tag set (`invalid | unauthorized | network | parse | server`) MUST NOT be edited.

#### Scenario: A guard-behavior test still passes unchanged

- GIVEN an existing unit test asserting `esMontoStringValido` rejects a non-numeric string and
  `esResumenMesDto` rejects a payload missing `totalIngreso`
- WHEN that test runs after the type-source migration, with no edits to the test itself
- THEN it passes exactly as it did before the migration

#### Scenario: Money-bearing response fields still type-check as `string`

- GIVEN the generated type for `cargo`/`abono`/`total`/`totalIngreso` is `string` (see `api-client` spec
  AC-04)
- WHEN `apps/web/src/api/types.ts` aliases these fields
- THEN the resulting DTO types in `apps/web` still type these fields as `string`, matching what the
  runtime guards already validate

#### Scenario: `ApiError` taxonomy is untouched

- GIVEN the current `ApiError` union has five tags (`invalid | unauthorized | network | parse | server`)
- WHEN the migration diff is inspected
- THEN no edit touches the `ApiError` type definition, its tags, or the functions that construct each
  variant

## Non-Goals

| Excluded | Reason |
|----------|--------|
| Any change to `apps/web/src/api/client.ts` fetch logic | Out of scope — runtime code is untouched (see proposal) |
| Any change to `apps/web/src/api/auth.ts` session handling | Untouched — cookie-based session model is unaffected |
| Adopting a runtime HTTP client from the package | Deferred to a future slice (`client.ts`, see `api-client` spec Non-Goals) |
| Endpoints not yet in `apps/api/openapi.json` | Stay hand-written until the contract covers them |
