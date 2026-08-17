# Tasks: US-051 — Backend detalle MES-BUCKET agrupado por categoría

Strict TDD (`pnpm api test`): RED fails before GREEN. Order: application → infrastructure → contract → closing (US-049). Four stacked PRs merge green to main; backend dark until US-053.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1 700 (1 500–1 800) across 4 PRs |
| 400-line budget risk | High (default guard; active budget 800, user-confirmed) |
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

| Unit | Goal (files, design §3) | PR | Est. lines |
|---|---|---|---|
| 1 | Application: `agrupar-detalle-por-categoria.ts`+spec(10), `obtener-detalle-bucket-mes.use-case.ts`+spec(12), design §5 fix | PR 1 | ~600 |
| 2 | DTO+schema: `detalle-bucket-mes.dto.ts`+spec(5), `bucket-detalle-mes.schema.ts`+spec(2) | PR 2 | ~260 |
| 3 | Route+contract: `buckets.routes.ts`, `container.ts`, `app.ts`, `openapi-document.ts`(+1), `openapi.json` | PR 3 | ~280 |
| 4 | Isolation+e2e: `app.bucket-detalle-mes.spec.ts`(6), `test/bucket-detalle-mes.e2e-spec.ts`(8) | PR 4 | ~510 |

## Phase 0 — Pre-flight

- [ ] 0.1 `pnpm api db:up && pnpm api test:db:setup` (Phase 4 needs it).

## Phase 1 — Application [PR 1]

- [x] 1.1 (RED) `agrupar-detalle-por-categoria.spec.ts`: 10 cases — `categoriaId` key, Σ cargo+conteo, BigInt > MAX_SAFE, es-CL alpha, "Sin categoría" last, ñ, empty→`[]`, reader order kept, never abono. — spec: `apps/api/src/application/services/agrupar-detalle-por-categoria.spec.ts` (10/10 verdes)
- [x] 1.2 (GREEN) `agrupar-detalle-por-categoria.ts` (D-03): pure bigint, never throws. — impl: `apps/api/src/application/services/agrupar-detalle-por-categoria.ts`
- [x] 1.3 (RED) `obtener-detalle-bucket-mes.use-case.spec.ts`: 12 cases — 11 ledger (allowlist `it.each`; Ingreso→`BucketInvalidoError`; unknown→fail; absent periodo→`PeriodoMes.actual()`; invalid→fail; periodo+`userId` to both readers; empty→`0n`/0/0/`[]`; no-income→null+`metaBp 5000n`; SinCategoria nulls+1; logger counts only) + **W-2: half-bp → `porcentajeBp === porcentajeBasisPoints(total, ingreso)`**. — spec: `apps/api/src/application/use-cases/obtener-detalle-bucket-mes.use-case.spec.ts` (12 casos / 15 invocaciones; W-2: total 250000, ingreso 1 500 000 → 1667n, nunca 1666)
- [x] 1.4 (GREEN) `obtener-detalle-bucket-mes.use-case.ts`: `BUCKETS_DETALLE_MES`, period resolution, both readers, `Result<T,E>`. — impl: `apps/api/src/application/use-cases/obtener-detalle-bucket-mes.use-case.ts`
- [x] 1.5 design.md §5: state income 1 500 000; fix `"porcentajeBp": 1666` → `1667`. — design.md §5 actualizado (ingreso base explícito + 1667)
- [x] 1.6 Verify: both specs + `pnpm api exec tsc --noEmit`. — `pnpm api test`: 232 files / 2031 tests verdes; `tsc --noEmit` limpio; 38 suites pre-existentes byte-unchanged (solo archivos nuevos en el diff)

## Phase 2 — DTO + schema [PR 2]

- [x] 2.1 (RED) `detalle-bucket-mes.dto.spec.ts`: 5 cases — bigint→string; bp/meta number, null kept; `monto === String(cargo)`; **PII keys banco/tipoCuenta/numeroCuenta absent (MBD-08)**; fecha ISO. — spec: `apps/api/src/infrastructure/http/dto/detalle-bucket-mes.dto.spec.ts` (5/5 verdes; fixture reconstruye la proyección recortada desde filas fuente CON PII)
- [x] 2.2 (GREEN) `detalle-bucket-mes.dto.ts` (D-06): DTO + mapper, PII trim. — impl: `apps/api/src/infrastructure/http/dto/detalle-bucket-mes.dto.ts` (monto = String(tx.monto); bp/meta → number|null; la PII no existe NI en el tipo de entrada)
- [x] 2.3 (RED) `bucket-detalle-mes.schema.spec.ts`: 3 casos (ledger 2 + 1 amend) — mapper output parses; rejects `monto: 12.5`; **`.strict()` rechaza una transacción con key extra `banco` (MBD-08 wire guard)**. — spec: `apps/api/src/infrastructure/http-express/schemas/bucket-detalle-mes.schema.spec.ts` (3/3 verdes)
- [x] 2.4 (GREEN) `bucket-detalle-mes.schema.ts` (D-07): reuses `bucketsPathParamsSchema`; `.meta({ id: 'BucketDetalleMesResponse' })`. — impl: `apps/api/src/infrastructure/http-express/schemas/bucket-detalle-mes.schema.ts`
- [x] 2.5 (GATE PR1, additive-gate exception — sancionado) PII-trim projection fix en el borde de aplicación: `TransaccionDetalleBucketMes` `{id, fecha, descripcion, monto}` + `recortarTransaccion` en `agrupar-detalle-por-categoria.ts`; `ObtenerDetalleBucketMesResult.grupos` tipado sobre la proyección recortada. Specs: service +1 caso (10→11) y use-case W-2 ampliado con asserts de PII ausente (banco/tipoCuenta/numeroCuenta/BCI/Cuenta Corriente/12345678). Firmado por el gate review: NINGÚN caller del use case puede ver PII — no solo el DTO.

## Phase 3 — Route + container + openapi [PR 3]

- [x] 3.1 (RED) `openapi-document.spec.ts` +1: registers the route with `periodo` query, 200/400. — spec: `apps/api/src/infrastructure/http-express/schemas/openapi-document.spec.ts` (+1 caso US-051; RED confirmado: path undefined antes del GREEN)
- [x] 3.2 (GREEN) `openapi-document.ts`: operation + **append** path entry at END (D-11). — impl: `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` (`bucketDetalleMesOperation` + `'/api/buckets/{bucket}/detalle'` APPENDED tras `/api/resumen/semaforo`, sin reordenar; reusa `bucketsPathParamsSchema` + `bucketDetalleMesQuerySchema`/`bucketDetalleMesResponseSchema`)
- [x] 3.3 (GREEN) `buckets.routes.ts`: `registrarBucketDetalleMes` — flat-route handler shape (scrubbed 400s, `next(err)`). — impl: `apps/api/src/infrastructure/http-express/routes/buckets.routes.ts` (misma disciplina del flat: allowlist 4-bucket D-08 → 400 scrubbeado, `PeriodoInvalidoError` MBD-04 → 400 scrubbeado, `next(err)` inesperado, `userId` de sesión al use case, respuesta vía `aDetalleBucketMesDto`)
- [x] 3.4 (GREEN) `container.ts`: `obtenerDetalleBucketMes` — one `new PrismaDetalleBucketRepository(prisma, crypto)` + one `new PrismaResumenMesRepository(prisma)` (D-10). — impl: `apps/api/src/composition/container.ts` (interface + wiring, un-`new`-por-repository, sin `crear-*`)
- [x] 3.5 (GREEN) `app.ts`: mount after `registrarBuckets` (~line 172). — impl: `apps/api/src/infrastructure/http-express/app.ts` (línea 176, post-`registrarBuckets`; fakes `as unknown as Container` absorben el campo nuevo — sweep tsc OK, patrón US-049 T5.9)
- [x] 3.6 `pnpm api openapi:emit`; commit `openapi.json`; `openapi:check` exits 0. — `openapi.json` regenerado (178 líneas, path nuevo + schema `BucketDetalleMesResponse`); `openapi:check` ✅; commit `aec3cff`

## Phase 4 — Hermetic app + e2e [PR 4]

- [x] 4.1 (RED) `app.bucket-detalle-mes.spec.ts`: 6 cases — 401 sin x-api-key; 401 api-key sin sesión; 200 + **session `userId` fluye al use case**; 400 scrubbed PeriodoInvalidoError; 400 scrubbed BucketInvalidoError; body parses schema. — spec: `apps/api/src/infrastructure/http-express/app.bucket-detalle-mes.spec.ts` (6/6 verdes; RED confirmado via `Cannot find module` + 401/400 asserts antes del GREEN)
- [x] 4.2 (GREEN) No new prod code expected; RED signals a PR1–3 gap — fix there. — sin hueco PR1-3; los 6 casos del spec hermético pasan sobre el código existente
- [x] 4.3 (RED) `test/bucket-detalle-mes.e2e-spec.ts`: 8 cases — 7 ledger (no periodo→UTC; `not-a-date`→400 scrubbed; DTO shape, 5 txs, no paging; empty month `"0"`/0/0/`[]`; >MAX_SAFE exact; two-user isolation, B never in A; Ingresos→400) + **W-1: filled header, income 1 500 000 → `total "250000"`, 5 txs, 2 categorías, `porcentajeBp` 1667, Σ `conteo` === `totalTransacciones`**. — spec: `apps/api/test/bucket-detalle-mes.e2e-spec.ts` (8 casos incl. W-1; e2e local verde con DB desechable provisionada)
- [x] 4.4 Full sweep: `pnpm api test` · `test:integration` · `test:e2e` (destructive) · `tsc --noEmit` · `openapi:check` · `lint:ci`. — `pnpm api test`: 235 files / 2047 verdes; `test:e2e`: 13 files / 67 verdes; `tsc --noEmit` limpio; `openapi:check` 0.

## Phase 5 — Closing

- [ ] 5.1 Archive (delta note, spec lines 9-16): canonical `user-data-isolation` → "6" in THREE places (Purpose, ISO-01, ISO-02) — never only ISO-02.
- [ ] 5.2 Ledger: 43 new (+1 touched) vs design §4 as amended; 38 byte-unchanged suites untouched; no migration.
- [ ] 5.3 Conventional-commit work units per PR (tests with code, no AI attribution).
