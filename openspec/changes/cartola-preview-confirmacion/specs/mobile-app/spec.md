# Delta for Mobile App API Types — Drop the One-Shot Client, Add the Commit Client

**Change**: `cartola-preview-confirmacion`
**Capability**: `mobile-app` (extends `openspec/specs/mobile-app/spec.md`)

## Purpose

`post-ingesta.ts` (the deprecated one-shot client) is deleted by this change; its DTOs
no longer need type-migration coverage. The new `commit-ingesta.ts` MUST be authored
directly against `@moneydiary/api-client`'s generated types, not hand-written, keeping
MAC-01's guarantee intact for every file that still exists.

## MODIFIED Requirements

### Requirement: MAC-01 — DTO Types Are Derived, Not Hand-Written

For every endpoint covered by `apps/api/openapi.json` (see `api-client` spec), the DTO
shapes declared in `apps/mobile/src/api/client.ts`, `preview-ingesta.ts`, and
`commit-ingesta.ts` MUST be type aliases over `@moneydiary/api-client`'s generated
`components['schemas'][...]` types, not independently hand-written declarations.
`post-ingesta.ts` and its hand-written DTOs are removed by this change
(`cartola-preview-confirmacion`) — its endpoint (`POST /api/ingestas`) has no shipped
mobile caller after this change (see `ingesta-preview-commit` spec, DEP-01) — so this
requirement no longer applies to it.

(Previously: covered `client.ts`, `post-ingesta.ts`, and `preview-ingesta.ts`.)

#### Scenario: No hand-written DTO type remains for a covered endpoint

- GIVEN `ResumenMesDto` (or `LoginResponseDto`, `MeDto`, `AuthCapabilitiesDto`) is
  covered by `apps/api/openapi.json`
- WHEN the relevant mobile `src/api/*.ts` file is inspected after migration
- THEN that type is declared as an alias over `@moneydiary/api-client`'s generated
  `components['schemas'][...]`, not as a hand-written declaration

#### Scenario: Mobile typecheck and test suite pass using the derived types

- GIVEN mobile's DTO subset has been migrated for all endpoints covered by the contract
- WHEN `tsc --noEmit` and `pnpm --filter @moneydiary/mobile test` run
- THEN both pass with zero failures attributable to the migration

#### Scenario: The new commit client is derived from generated types, not hand-written

- GIVEN `commit-ingesta.ts` is authored as part of `cartola-preview-confirmacion`
- WHEN its request/response DTO types are inspected
- THEN they are type aliases over `@moneydiary/api-client`'s generated
  `components['schemas'][...]` types, not hand-written declarations

#### Scenario: `post-ingesta.ts` no longer exists after this change

- GIVEN the mobile source tree after `cartola-preview-confirmacion`
- WHEN `apps/mobile/src/api/post-ingesta.ts` is looked up
- THEN the file does not exist and no import references it
