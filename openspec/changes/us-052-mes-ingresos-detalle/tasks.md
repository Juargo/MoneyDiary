# Tasks: US-052 — Backend detalle MES-INGRESOS con columna Origen (banco/Manual)

Strict TDD (`pnpm api test`): RED fails before GREEN. Order: application → infrastructure → contract → closing (US-049/US-051). Four force-chained PRs merge green to main (stacked-to-main); backend dark until US-054.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1 620 (400+350+170+700) across 4 PRs |
| 400-line budget risk | High (default guard; active budget 800/user-confirmed — all slices <800) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 application → PR2 DTO+schema → PR3 route+contract → PR4 app spec+e2e |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal (design §7) | PR | Est. lines |
|---|---|---|---|
| 1 | Application: `obtener-ingresos-mes.use-case.ts`+spec (13) | PR 1 → main | ~400 |
| 2 | DTO+schema: `ingresos-mes.dto.ts`+spec (4), `ingresos-mes.schema.ts`+spec (3) | PR 2 → PR1 | ~350 |
| 3 | Route+container+openapi: `ingresos.routes.ts`, `container.ts`, `app.ts`, `openapi-document.ts`(+1) + `openapi.json`/`types.gen.ts` | PR 3 → PR2 | ~170 |
| 4 | Isolation+e2e: `app.ingresos-mes.spec.ts` (6), `test/ingresos-mes.e2e-spec.ts` (7) | PR 4 → PR3 | ~700 |

## Phase 0 — Pre-flight

- [ ] 0.1 `pnpm api db:up && pnpm api test:db:setup` (Phase 4 needs it). — satisfecho por el estado del repo: scripts existen (US-051 precedent, verify-report #783); Phase 4 reutiliza la DB desechable provisionada.

## Phase 1 — Application [PR 1]

- [x] 1.1 (RED) `obtener-ingresos-mes.use-case.spec.ts`: 13 cases — absent periodo → `PeriodoMes.actual()`; invalid → `Result.fail(PeriodoInvalidoError)`, reader NOT called; periodo + `userId` flow verbatim (MID-06); reader called with `Bucket.Ingreso` (no sign rule re-applied); empty → ok `0n`/0/`[]`; Σ abono exact > `MAX_SAFE_INTEGER`; `monto` = positive abono, never cargo; reader order preserved, not re-sorted; `origen` verbatim (`banco: 'BancoEstado'` → `'BancoEstado'`); `origen` `'Manual'` on `banco: ''` — dead branch unit-proven (MID-02); projection EXACTLY `{id, fecha, descripcion, origen, monto}` — no `tipoCuenta`/`numeroCuenta` in the type; logger counts only, montos never logged (ADR-013). — design §5 ledger (13).
- [x] 1.2 (GREEN) `obtener-ingresos-mes.use-case.ts` (D-01/D-02): reuse `IDetalleBucketReader.findByPeriodoYBucket(userId, periodo, Bucket.Ingreso)`; projection `{id, fecha, descripcion, origen: fila.banco || 'Manual', monto}` (PII-trim at application boundary); total = Σ abono BigInt; `execute(...)` convention (NOT `executar`).
- [x] 1.3 Verify: spec + `pnpm api exec tsc --noEmit`.

## Phase 2 — DTO + schema [PR 2]

- [ ] 2.1 (RED) `ingresos-mes.dto.spec.ts`: 4 cases — `total`/`monto` bigint→string exact; fecha ISO-8601 UTC; `origen` passthrough; output EXACTLY `{total, conteo, transacciones}` — no meta/porcentaje/estado/periodo (MID-03).
- [ ] 2.2 (GREEN) `ingresos-mes.dto.ts` (D-04): serialize-only mapper.
- [ ] 2.3 (RED) `ingresos-mes.schema.spec.ts`: 3 cases — real `aIngresosMesDto` output parses (sync guarantee); leaf `.strict()` rejects stray `tipoCuenta` key (MID-03/MID-06 wire guarantee); top-level `.strict()` rejects extra key / `monto` as JSON number.
- [ ] 2.4 (GREEN) `ingresos-mes.schema.ts` (D-05): `ingresosMesQuerySchema` transport-shape only (NOT the domain period parser); `.strict()` response + `.strict()` leaf; `.meta({id: 'IngresosMesResponse'})`.

## Phase 3 — Route + container + openapi [PR 3]

- [ ] 3.1 (RED) `openapi-document.spec.ts` +1: registers `GET /api/ingresos/mes` con query `periodo` + 200/400.
- [ ] 3.2 (GREEN) `openapi-document.ts` (D-08): `ingresosMesOperation` + path entry APPENDED at END of `paths` (after `/api/buckets/{bucket}/detalle`, ~line 1149 — never reorder).
- [ ] 3.3 (GREEN) `ingresos.routes.ts` (D-06): `registrarIngresosMes(router, useCase)` flat handler — query safeParse → use case → `PeriodoInvalidoError` → scrubbed 400 (never echoes raw input) → exhaustive `never` → 500 → `aIngresosMesDto`; `userId` from session; `next(err)`.
- [ ] 3.4 (GREEN) `container.ts` (D-07): THIRD `new PrismaDetalleBucketRepository(prisma, crypto)` (two exist at lines 207/216 — per-use-case-instance discipline) + `new ObtenerIngresosMesUseCase(...)`; wired/exposed; no `crear-*` helper.
- [ ] 3.5 (GREEN) `app.ts`: mount `registrarIngresosMes(protectedApi, ...)` after `registrarBucketDetalleMes` (~line 176).
- [ ] 3.6 `pnpm api openapi:emit`; commit `openapi.json`; `openapi:check` exits 0; `pnpm contract:sync` (regenerates `packages/api-client/src/types.gen.ts`).

## Phase 4 — Hermetic app + e2e [PR 4]

- [ ] 4.1 (RED) `app.ingresos-mes.spec.ts` (mirror `app.bucket-detalle-mes.spec.ts`): 6 cases — 401 sin `x-api-key`; 401 api-key sin sesión; 200 + session `userId` flows to use case (MID-06); 400 scrubbed `PeriodoInvalidoError` (raw input absent from body); body 200 parses `ingresosMesResponseSchema` with `origen` banco; sin meta/porcentaje/estado en body; Manual branch via fake reader `banco: ''` → `'Manual'` (dead-code unit proof).
- [ ] 4.2 (RED) `test/ingresos-mes.e2e-spec.ts`: 7 cases — RUN_ID seeded fixtures + isolation A/B (MID-06/CA-06 RNF-SEC-006); sin `periodo` → 200 with current-UTC-month rows (seed current + previous month, MID-04); `?periodo=not-a-date` → 400 scrubbed; DTO shape — exactly `{total, conteo, transacciones}`, each tx `{id, fecha, descripcion, origen, monto}` with `origen` = bank verbatim on wire, no paging (MID-01/02); empty month → `"0"`/0/`[]`; montos > `MAX_SAFE_INTEGER` exact; isolation two users — B never in A, cookie + Bearer; reconciliation: `total` === resumen-mensual Ingreso `totalAbono`, SPEND row (`abono>0 && cargo>0`) excluded (MID-05).
- [ ] 4.3 Full sweep: `pnpm api test` · `test:integration` · `test:e2e` (destructive) · `tsc --noEmit` · `openapi:check` · `lint:ci`.

## Phase 5 — Closing

- [ ] 5.1 Archive: canonical `user-data-isolation` → "7" in THREE places (Purpose prose, ISO-01, ISO-02 — never only ISO-02); promote new capability `ingresos-detalle-mes` (US-049 pattern, "Established by" line).
- [ ] 5.2 Ledger recount vs design §4/§5: 33 new backend cases (+1 touched); existing suites byte-unchanged — CORRECTED counts (gate review): `bucket-detalle-mes.e2e-spec.ts` **8** `it(` (not 7 — extra W-1 reconciliation case), `obtener-detalle-bucket-mes.use-case.spec.ts` **11** invocations (it.each counts as one; not 12), `bucket-detalle-mes.schema.spec.ts` **3** (not 2 — MBD-08 leaf-rejection exists).
- [ ] 5.3 Conventional-commit work units per PR (tests with code, no AI attribution).