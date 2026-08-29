# Tasks: Correction path for committed manual movements

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1500–1700 (code ~600, tests ~600, ADR-040 prose ~300, contract regen ~60) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 (see Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — ask user (stacked-to-main vs feature-branch-chain) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend delete capability: domain+app+infra triad, route+contract, ADR-040, unit+integration tests (Phases 1,2,5,6) | PR 1 | Base `main`. Largest unit (~900 lines incl. ADR prose) — candidate for further split if reviewer flags it (e.g. triad+contract vs ADR+integration). Independent of PR 2/3. |
| 2 | Gasto `origen` DTO plumbing, D-02 (Phase 3) | PR 2 | Base `main`, independent of PR 1. ~200 lines. |
| 3 | Web delete control + wiring + copy fix (Phase 4) | PR 3 | Depends on PR 1 (endpoint) and PR 2 (`origen` on gasto wire). Base = PR 2 branch if `feature-branch-chain`, else `main` after PR 1+2 merge. ~650 lines. |

## Phase 1: Domain + Application (TDD)

- [x] 1.1 [RED] `eliminar-movimiento-manual.use-case.spec.ts`: demo gate short-circuits, writer never called (DEL-03)
- [x] 1.2 [RED] same spec: writer failure → `TransaccionNoEncontradaError` passthrough; logger gets no montos (DEL-01/02)
- [x] 1.3 [GREEN] Create `domain/errors/movimiento-demo-solo-lectura.error.ts` (D-01)
- [x] 1.4 [GREEN] Create `application/ports/eliminar-movimiento-manual.port.ts` — `IEliminarMovimientoManualWriter` + token (D-01)
- [x] 1.5 [GREEN] Create `application/use-cases/eliminar-movimiento-manual.use-case.ts` — demo gate first, then writer, `logger.debug` no montos (D-01)

## Phase 2: Infrastructure + Contract (TDD)

- [x] 2.1 [RED] `prisma-eliminar-movimiento-manual.repository.spec.ts`: exact `{id, origen:'Manual', account:{userId}}` WHERE; `count:0`→fail; no `$transaction` (D-01)
- [x] 2.2 [GREEN] Create `infrastructure/persistence/prisma-eliminar-movimiento-manual.repository.ts` (D-01)
- [x] 2.3 [RED] Extend `movimientos.routes.spec.ts`: 204 / 403 `DEMO_SOLO_LECTURA` / 404 shape; `req.userId` from session (DEL-01..04)
- [x] 2.4 [GREEN] Create `schemas/movimiento-delete.schema.ts` — `movimientoDeletePathParamsSchema` (D-01b)
- [x] 2.5 [GREEN] Add `registrarEliminarMovimientoManual` sibling handler to `movimientos.routes.ts`, routed through `responderErrorTraducido` (D-01b, DEL-02/03)
- [x] 2.6 [GREEN] Append `eliminarMovimientoManualOperation` (204/401/403/404) to `openapi-document.ts` under `/api/movimientos`, preserving existing path order (D-01b, DEL-04)
- [x] 2.7 [GREEN] Wire `container.ts` (`eliminarMovimientoManual` field) + register route in `app.ts` (D-01)
- [x] 2.8 Run `pnpm contract:sync` — regenerate `openapi.json` + `packages/api-client/src/types.gen.ts` (DEL-04)
- [x] 2.9 Verify `openapi:check` passes in CI (DEL-04)

## Phase 3: Gasto `origen` DTO plumbing (D-02)

- [ ] 3.1 [RED] Extend `agrupar-detalle-por-categoria.spec.ts`: `origen` = banco verbatim; empty banco → `'Manual'`
- [ ] 3.2 [RED] Extend `obtener-detalle-bucket-mes.use-case.spec.ts`: same `origen` assertions
- [ ] 3.3 [RED] Extend `bucket-detalle-mes.schema.spec.ts`: mapper output parses under `.strict()` with new `origen` key
- [ ] 3.4 [GREEN] Add `origen` to `recortarTransaccion` + `TransaccionDetalleBucketMes` in `agrupar-detalle-por-categoria.ts`
- [ ] 3.5 [GREEN] Add `origen` to `detalle-bucket-mes.dto.ts` (type + mapper)
- [ ] 3.6 [GREEN] Add `origen` inside `.strict()` in `bucket-detalle-mes.schema.ts`
- [ ] 3.7 Run `pnpm contract:sync` for this DTO change
- [ ] 3.8 [GREEN] Add `origen` to `apps/web/src/domain/detalle-bucket-mes-view-model.ts`
- [ ] 3.9 Add cross-reference comment at both `origen: fila.banco || 'Manual'` occurrences (DRY annotate-at-2, no extraction yet)

## Phase 4: Web delete control + wiring (TDD)

- [ ] 4.1 [RED] `EliminarMovimientoControl.test.tsx`: renders on manual rows only; dialog discloses fecha/monto/descripcion; error keeps dialog open; demo disables trigger (WEB-DEL-01)
- [ ] 4.2 [GREEN] Create `components/EliminarMovimientoControl.tsx` — props `{id, fechaLabel, descripcion, montoLabel, esDemo?, onEliminado?}` (D-03)
- [ ] 4.3 [GREEN] Add `deleteMovimiento(id)` to `api/movimientos.ts` — never-throw `ApiResult`, 401/404/network/ok mapping (D-03)
- [ ] 4.4 [GREEN] Create `use-eliminar-movimiento.ts` + `movimientos-invalidacion.ts` (`invalidarCachesMovimiento`: resumen, resumen-anual, detalle-bucket-mes, ingresos-mes) (D-03)
- [ ] 4.5 [RED] Extend `IngresosMesTable.test.tsx`: control only on manual rows; success announced via live region
- [ ] 4.6 [GREEN] Wire control into `IngresosMesTable.tsx`; add page-level `role="status"` region to `IngresosMesPage.tsx` (WEB-DEL-01, D-03)
- [ ] 4.7 [RED] Extend `GrupoMovimientos.test.tsx`: same assertions on the gasto surface
- [ ] 4.8 [GREEN] Wire control into `GrupoMovimientos.tsx`; reuse `BucketDetalleMesPage`'s existing `anuncio` `role="status"` region (WEB-DEL-01, D-03)
- [ ] 4.9 [RED] Extend `RegistrarMovimientoForm.test.tsx`: pin rewritten `MENSAJE_PERMANENCIA` at both render sites (WEB-DEL-02)
- [ ] 4.10 [GREEN] Rewrite + export `MENSAJE_PERMANENCIA` in `RegistrarMovimientoForm.tsx` (D-04)

## Phase 5: Integration tests (DB-gated — CI only, `ALLOW_DESTRUCTIVE_DB=1`)

- [x] 5.1 Create `test/eliminar-movimiento-manual.int-spec.ts`: happy path → 204, row gone, `GET /api/resumen` reflects it; demo session → 403, row untouched (DEL-01, DEL-03)
- [x] 5.2 Same file: cross-user → 404 + row survives; ingesta-born row → 404 + row survives; absent id → 404; repeat delete → 404; all three 404 bodies byte-identical (DEL-02, DEL-05)

## Phase 6: Docs

- [x] 6.1 Create `docs/adr/ADR-040-correccion-de-movimientos-manuales.md` (proposal §6 text) (D-06)
- [x] 6.2 Add ADR-040 row + ADR-039 amendment note to `docs/adr/README.md` (D-06)

## Slice 1 (PR 1) status — backend delete capability

**All Phase 1, 2, 5, 6 tasks complete** (this slice). Phases 3 (gasto `origen` DTO
plumbing, PR 2) and 4 (web delete control, PR 3) are OUT OF SCOPE for this slice —
independent work units per the Suggested Work Units table above.

Verification run for this slice (2026-08-29, on `main`):
- `pnpm --filter @moneydiary/api test` (vitest) — 263 files / 2406 tests, all green
  (+2 test files / +11 tests vs. pre-slice baseline of 261/2395)
- `pnpm api exec tsc --noEmit` — clean
- `pnpm api build` (`tsc -p tsconfig.build.json`) — clean
- `pnpm contract:sync` run; `pnpm api openapi:check` — in sync
- ESLint on all touched files — clean (after `--fix` for prettier formatting only)
- Integration test file written per D-05 fixture strategy; NOT run locally (DB-gated,
  `ALLOW_DESTRUCTIVE_DB=1`, CI-only per house convention)
