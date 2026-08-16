# Proposal: US-045 — resumen mensual, 3 → 5 items

## Intent

The dashboard chart only tells the spending story (Necesidades/Deseos/Ahorro). Users cannot see, in the same view, how much came in (**Ingresos**) nor how much of their money the app failed to classify (**Sin categoría**) — so an unclassified month silently looks like a smaller month. `GET /api/resumen` must expose both values so US-047 (web) and US-046 (annual) can render 5 items without new backend rules.

## Scope

### In Scope

- Expose **Ingresos** as a chart item: amount only, **no percentage** (product decision).
- Expose **Sin categoría** with **transaction count** + total + % over ingresos del mes (same base as spend buckets).
- Count/total for Sin categoría covers **cargos only**; the `cargo > 0` filter structurally excludes all abono rows (by the `Transaccion.crear` XOR invariant, an abono row is always Ingreso-shaped — see RES-02).
- All 5 values **always present** (0 / empty when no data) — stable contract, clients decide what to hide.
- `userId` isolation in the WHERE for the new aggregation + integration test (RNF-SEC-006).
- Contract regen: Zod schema → `openapi.json` → `@moneydiary/api-client` (ADR-011/012, both CI drift gates).

### Out of Scope

- Web/mobile UI and view-models (US-047).
- Annual aggregation of the new values (US-046).
- Any semáforo rule for Ingresos or Sin categoría.
- Restructuring `buckets[]` into a uniform `items[]` (discarded: breaking, YAGNI).

## Capabilities

### New Capabilities

- `resumen-mensual`: contract and computation rules of `GET /api/resumen` (items, bases, BigInt/bp arithmetic, semáforo scope).

### Modified Capabilities

- `user-data-isolation`: ISO-02 coverage extends to the new Sin categoría count field.

## Approach

Additive DTO extension (exploration approach **a**), not a restructure.

| Item | Direction |
|------|-----------|
| Ingresos | Re-present the existing top-level `totalIngreso` (BigInt→string). No new field, no `porcentajeBp`. |
| Sin categoría | Already a `buckets[]` slice with total + %. Only genuinely new data is the **count**: add `_count` to the existing Prisma `groupBy` (same query) and surface it as a dedicated top-level field, **keeping `BucketResumenDto` uniform** (ISP — the 3 spend buckets must not carry an unused `count`). Final placement is a design-phase call. |
| Semáforo | Untouched. `calcularEstadoBucket` already returns `null` outside the 3 spend buckets (CA-03 structurally satisfied). |
| Arithmetic | Reuse `porcentajeBasisPoints` (BigInt round-half-up). No float. |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/domain/value-objects/resumen-mes.ts` | Modified | New count field in `ResumenMesInput`/`ResumenMes` |
| `apps/api/src/application/ports/resumen-mes.port.ts` | Modified | `BucketSumRow` gains a count |
| `apps/api/src/application/use-cases/resumen-mes-assembly.ts` | Modified | **Shared with `CalcularResumenAnualUseCase`** — changes propagate |
| `apps/api/src/infrastructure/persistence/prisma-resumen-mes.repository.ts` | Modified | `_count` in existing `groupBy`; `account: { userId }` WHERE preserved |
| `apps/api/src/infrastructure/http/dto/resumen-mes.dto.ts` | Modified | New field + mapper |
| `apps/api/src/infrastructure/http-express/schemas/resumen.schema.ts` | Modified | Zod source of truth |
| `apps/api/openapi.json`, `packages/api-client/src/*` | Regenerated | `contract:sync` |
| `*.spec.ts` (domain, use case, repo, dto, schema) | Modified | Positional/length asserts (`toHaveLength(4)`) updated |

**Client impact**: none breaking. Web/mobile pie filters are name allowlists; view-models ignore unknown fields until US-047.
**Annual impact**: `resumen-anual`'s `meses[]` reuses `ResumenMesDto`, so it widens for free — must not break; no new annual aggregation.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Shared assembly breaks the annual use case | Med | Additive-only signature change; annual tests in the verification set |
| Count double-counts the null-bucket + explicit-SinCategoria fold (SC-03) | Med | Extend the existing SC-03 integration test to assert counts ADD, never overwrite |
| Contract drift (openapi/api-client not regenerated) | Med | Two CI gates (`openapi:check`, `api-client`) already block it |
| Count leaks across users | Low | Replicate the SC-09 isolation pattern for the new field |

## Rollback Plan

Revert the change commits and re-run `pnpm contract:sync` to restore `openapi.json` + `types.gen.ts`. Fields are additive, so no client migration or data backfill is required; no DB schema change exists to undo.

## Dependencies

- None blocking. US-046 and US-047 consume this contract downstream.

## Success Criteria

- [ ] **CA-01** Ingresos exposed BigInt-safe as string, amount only, always present (0 when empty)
- [ ] **CA-02** Sin categoría exposes transaction count + total (cargos only), always present
- [ ] **CA-03** `estadoGlobal` still derives only from Necesidades/Deseos/Ahorro
- [ ] **CA-04** All percentages via basis-points round-half-up on BigInt; no float in the path
- [ ] **CA-05** `userId` filtered in the WHERE + integration test proving A never sees B's count/totals
- [ ] **CA-06** `openapi.json` and `@moneydiary/api-client` regenerated and committed; both CI drift gates green
- [ ] Annual endpoint (`/api/resumen-anual`) still passes its existing tests
