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

- [x] 3.1 [RED] Extend `agrupar-detalle-por-categoria.spec.ts`: `origen` = banco verbatim; empty banco → `'Manual'`
- [x] 3.2 [RED] Extend `obtener-detalle-bucket-mes.use-case.spec.ts`: same `origen` assertions
- [x] 3.3 [RED] Extend `bucket-detalle-mes.schema.spec.ts`: mapper output parses under `.strict()` with new `origen` key
- [x] 3.4 [GREEN] Add `origen` to `recortarTransaccion` + `TransaccionDetalleBucketMes` in `agrupar-detalle-por-categoria.ts`
- [x] 3.5 [GREEN] Add `origen` to `detalle-bucket-mes.dto.ts` (type + mapper)
- [x] 3.6 [GREEN] Add `origen` inside `.strict()` in `bucket-detalle-mes.schema.ts`
- [x] 3.7 Run `pnpm contract:sync` for this DTO change
- [x] 3.8 [GREEN] Add `origen` to `apps/web/src/domain/detalle-bucket-mes-view-model.ts`
- [x] 3.9 Add cross-reference comment at both `origen: fila.banco || 'Manual'` occurrences (DRY annotate-at-2, no extraction yet)

## Phase 4: Web delete control + wiring (TDD)

- [x] 4.1 [RED] `EliminarMovimientoControl.test.tsx`: renders on manual rows only; dialog discloses fecha/monto/descripcion; error keeps dialog open; demo disables trigger (WEB-DEL-01)
- [x] 4.2 [GREEN] Create `components/EliminarMovimientoControl.tsx` — props `{id, fechaLabel, descripcion, montoLabel, esDemo?, onEliminado?}` (D-03)
- [x] 4.3 [GREEN] Add `deleteMovimiento(id)` to `api/movimientos.ts` — never-throw `ApiResult`, 401/404/network/ok mapping (D-03)
- [x] 4.4 [GREEN] Create `use-eliminar-movimiento.ts` + `movimientos-invalidacion.ts` (`invalidarCachesMovimiento`: resumen, resumen-anual, detalle-bucket-mes, ingresos-mes) (D-03)
- [x] 4.5 [RED] Extend `IngresosMesTable.test.tsx`: control only on manual rows; success announced via live region
- [x] 4.6 [GREEN] Wire control into `IngresosMesTable.tsx`; add page-level `role="status"` region to `IngresosMesPage.tsx` (WEB-DEL-01, D-03)
- [x] 4.7 [RED] Extend `GrupoMovimientos.test.tsx`: same assertions on the gasto surface
- [x] 4.8 [GREEN] Wire control into `GrupoMovimientos.tsx`; reuse `BucketDetalleMesPage`'s existing `anuncio` `role="status"` region (WEB-DEL-01, D-03)
- [x] 4.9 [RED] Extend `RegistrarMovimientoForm.test.tsx`: pin rewritten `MENSAJE_PERMANENCIA` at both render sites (WEB-DEL-02)
- [x] 4.10 [GREEN] Rewrite + export `MENSAJE_PERMANENCIA` in `RegistrarMovimientoForm.tsx` (D-04)

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

## Slice 2 (PR 2) status — gasto `origen` DTO plumbing

**All Phase 3 tasks complete** (this slice). Phase 4 (web delete control + wiring,
PR 3) remains OUT OF SCOPE — depends on this slice's `origen` signal plus PR 1's
endpoint, per the Suggested Work Units table above.

Behavior change vs. the original MBD-08/W-2 gate tests: `banco` is no longer fully
stripped at the gasto application boundary — it now survives as `origen` (bank name
verbatim, or `'Manual'`), mirroring `TransaccionIngresoMes.origen`. Only ACCOUNT PII
(`tipoCuenta`/`numeroCuenta`) remains recortada. Every test asserting "no PII"
(`agrupar-detalle-por-categoria.spec.ts`, `obtener-detalle-bucket-mes.use-case.spec.ts`,
`detalle-bucket-mes.dto.spec.ts`, `app.bucket-detalle-mes.spec.ts` fixture) was updated
to reflect this — no longer forbidding the bank-name string, still forbidding
`tipoCuenta`/`numeroCuenta`/account-number values.

Verification run for this slice (2026-08-29, on `main`, uncommitted per orchestrator
instruction):
- `pnpm --filter @moneydiary/api test` — 264 files / 2411 tests, all green
- `pnpm --filter @moneydiary/web test` — 126 files / 1544 tests, all green
- `pnpm api exec tsc --noEmit` — clean
- `pnpm api build` (`tsc -p tsconfig.build.json`) — clean
- `cd apps/web && pnpm exec tsc --noEmit` — clean
- `pnpm web build` (`tsr generate && tsc -b && vite build`) — clean (after fixing 14
  pre-existing test fixtures across 4 web files that hard-typed
  `TransaccionDetalleBucketMesDto`/`TransaccionDetalleMesViewModel` literals without
  the now-required `origen` field — `tsc -b`'s project-reference build caught these;
  plain `tsc --noEmit` at the app root did not)
- `pnpm contract:sync` run; `pnpm api openapi:check` — in sync
- ESLint on all touched files (api + web) — clean (one `--fix` pass on
  `agrupar-detalle-por-categoria.spec.ts`, prettier line-wrap only)

## Slice 3 (PR 3) status — web delete control + wiring + permanence copy fix

**All Phase 4 tasks complete** (this slice). This is the LAST slice — the full
change (`correccion-movimientos-manuales`) is now feature-complete across all
3 work units.

Design decisions applied beyond the literal task list (both consistent with
D-03/D-12 and existing house idioms, not deviations):

- `esDemo` is threaded into `IngresosMesPage`/`BucketDetalleMesPage` via
  `Route.useRouteContext()` at the route layer (`ingresos.tsx`,
  `buckets.$bucket.tsx`) — the same D-12 idiom `RegistrarMovimientoForm`/
  `registrar.tsx` already established, not a new `useMe()` fetch.
- Each page gained a small demo-note (`role="note"`, `MENSAJE_DEMO_ELIMINAR`)
  mirroring `ListaIngestas`' WCTG-11 convention (one note per screen), since
  WEB-DEL-01's demo scenario calls for "a note explaining why" and no existing
  page-level precedent covered movement deletion.
- Both pages gained focus-restore to their `<h1>` (`ref` + `tabIndex={-1}`) on
  a successful delete — the row (and its focused trigger) unmounts, so focus
  needs an explicit target; mirrors `ListaIngestas`/`EliminarIngestaControl`'s
  parent-announces pattern named in the task brief.
- `IngresosMesTable` gained a 5th `<th>` ("Acciones") — the existing 4-column
  test was updated to 5, and the "only interactive controls" button-count
  assertion in `IngresosMesPage.test.tsx` (case 15) was updated from 4 to 5
  to account for the one delete trigger the fixture's Manual row now renders.
- `GrupoMovimientos` formats `tx.fecha` (raw ISO, WDM-03) via `aFechaCorta` at
  the call site before passing `fechaLabel` to `EliminarMovimientoControl` —
  `IngresosMesTable` passes its view-model's already-formatted `fechaLabel`
  verbatim. Same pre-formatted-props contract, two different formatting
  origins, exactly as D-03 anticipated.
- `useEliminarMovimiento` deliberately has NO 404-specific partial-invalidation
  branch (unlike `useEliminarIngesta`) — there is no separate "list" cache for
  manual movements analogous to `['ingestas']`; `invalidarCachesMovimiento`'s
  4 keys already ARE the list, and only need refreshing on an actual success
  (documented as a deliberate KISS choice in the hook's docstring, not an
  oversight).
- `movimientos-invalidacion.ts` was extracted as its own file rather than
  inlined (`use-eliminar-ingesta.ts` precedent) because its exact 4-key set
  is now the THIRD occurrence of that key group in the codebase
  (`useRegistrarMovimiento` inline, `useEliminarMovimiento`, and any future
  manual-movement mutation) — DRY 3-strikes threshold met.
- `RegistrarMovimientoForm.test.tsx` now imports the exported
  `MENSAJE_PERMANENCIA` constant and asserts against it directly at both
  render sites, instead of duplicating the literal string — matches design
  D-04's explicit reason for exporting the constant (pin one source of
  truth, not two copies that could drift).

TDD Cycle Evidence (RED confirmed for every task before GREEN):
| Task | RED | GREEN |
|---|---|---|
| 4.3 `deleteMovimiento` | `movimientos.test.ts` new `describe('deleteMovimiento')` block (6 tests: 204/401/404/403/network/encode) — `TypeError: deleteMovimiento is not a function` | Added `deleteMovimiento` to `movimientos.ts`, mirrors `deleteIngesta`'s status map |
| 4.4 hook + invalidation | `movimientos-invalidacion.test.ts` + `use-eliminar-movimiento.test.tsx` — module-not-found RED | Created both files |
| 4.1/4.2 control | `EliminarMovimientoControl.test.tsx` (10 tests) — module-not-found RED | Created `EliminarMovimientoControl.tsx`, structural clone of `EliminarIngestaControl` |
| 4.5/4.6 IngresosMesTable/Page | Updated 4-header test to 5 + 3 new delete-affordance tests — RED (old 4-col assertion + missing button) | Added 5th "Acciones" column + `esDemo`/`onEliminado` props; `IngresosMesPage` gained `role="status"` region, heading ref/focus, demo note, route `esDemo` threading |
| 4.7/4.8 GrupoMovimientos/BucketDetalleMesPage | 3 new tests (manual-only render, onEliminado, esDemo disable) — RED (button not found) | Wired control with `aFechaCorta(tx.fecha)`; `BucketDetalleMesPage` reuses its existing `anuncio` region + adds heading ref/focus + demo note + route `esDemo` threading |
| 4.9/4.10 copy fix | Updated both pinning assertions to import+use `MENSAJE_PERMANENCIA` with the new text — RED (`undefined` passed to `getByText`) | Exported + rewrote the constant in `RegistrarMovimientoForm.tsx` |

**Where** (files modified/created):
- `apps/web/src/api/movimientos.ts` — added `deleteMovimiento`
- `apps/web/src/api/movimientos.test.ts` — added `describe('deleteMovimiento')` (6 tests)
- `apps/web/src/api/movimientos-invalidacion.ts` (new) + `.test.ts` (new)
- `apps/web/src/api/use-eliminar-movimiento.ts` (new) + `.test.tsx` (new)
- `apps/web/src/components/EliminarMovimientoControl.tsx` (new) + `.test.tsx` (new)
- `apps/web/src/components/IngresosMesTable.tsx` + `.test.tsx`
- `apps/web/src/components/IngresosMesPage.tsx` + `.test.tsx`
- `apps/web/src/components/GrupoMovimientos.tsx` + `.test.tsx`
- `apps/web/src/components/BucketDetalleMesPage.tsx` + `.test.tsx`
- `apps/web/src/components/RegistrarMovimientoForm.tsx` + `.test.tsx`
- `apps/web/src/routes/_authenticated/ingresos.tsx`
- `apps/web/src/routes/_authenticated/buckets.$bucket.tsx`
- `openspec/changes/correccion-movimientos-manuales/tasks.md` — checked off Phase 4, added this section

**Verification results** (2026-08-29, on `main` tip `b5d3ecd1`, uncommitted per
orchestrator instruction — "Do NOT commit"):
- `pnpm --filter @moneydiary/web test` — 129 files / 1578 tests, all green
  (baseline 129/1550 → +28 tests this slice)
- `cd apps/web && pnpm exec tsc --noEmit` — clean
- `pnpm --filter @moneydiary/web run build` (`tsr generate && tsc -b && vite build`) — clean
- ESLint on all touched files — clean (one `--fix` pass for prettier formatting
  on `EliminarMovimientoControl.test.tsx` and `RegistrarMovimientoForm.test.tsx`,
  no logic changes)
- `git status` confirms only `apps/web/**` files changed — API and mobile
  workspaces untouched by this slice, consistent with PR 3's scope

**Change complete**: all 3 work units (PR 1 backend, PR 2 gasto `origen`
plumbing, PR 3 web delete control) are now implemented. PR 1 is merged to
`main`; PR 2 and PR 3 are uncommitted per the orchestrator's instruction for
this multi-slice apply run — ready for `sdd-verify` and then commit/PR
creation per the `stacked-to-main` chain strategy.
