# Tasks: US-053 — Web Detalle MES-BUCKET + drill-down real (issue #287, Sprint-14)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,700 (PR1 ~380 · PR2 ~700 · PR3 ~620 incl. deletions) |
| 400-line budget risk | PR1 Low-Medium · PR2 High · PR3 High |
| Chained PRs recommended | Yes (3 sequential) |
| Suggested split | PR1 client plumbing → PR2 page → PR3 dashboard wiring + flat-chain deletion |
| Delivery strategy | single-pr-default |
| Chain strategy | pending (recommend stacked-to-main: PR2 ships behind existing route, each PR revertible — design §8) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Client plumbing (aliases, guard, hook, invalidation key) | PR 1 | Independently schedulable first; additive, revertible |
| 2 | The page (view-model, Page, GrupoMovimientos, route) | PR 2 | Base = PR1; page-only, deletions deferred |
| 3 | Dashboard wiring + flat-chain deletion + e2e | PR 3 | Base = PR2; only destructive step (design §8) |

## PR 1 — Client plumbing (D-07/D-05) — independently schedulable first

- [x] **T-01** api-client DTO aliases — `packages/api-client/src/index.ts`: `DetalleBucketMesDto = S['BucketDetalleMesResponse']` + nested `GrupoDetalleBucketMesDto`/`TransaccionDetalleBucketMesDto` (type-only, no regen; D-07). Deps: —. RED: none (types). AC: aliases exported; `pnpm web typecheck` clean.
- [x] **T-02** web re-export — `apps/web/src/api/types.ts`: re-export 3 aliases + why-note (D-07; ADR-008). Deps: T-01. RED: none. AC: compiles; tsc clean.
- [x] **T-03** fetcher + guard — `apps/web/src/api/client.ts`: `fetchDetalleBucketMes(bucket, periodo?)` + `esDetalleBucketMesDto` (contract §6: money/fecha guards; 400 → `{tag:'invalid'}`). **RED first**: `client.test.ts` +13 (200 ok; 400 invalid; 401; 5xx; network; non-JSON; `total` malformed; `grupos[].subtotal` malformed; `monto` `"12.5"`; `fecha` malformed; `porcentajeBp` wrong type; `grupos` non-array; URL bucket+periodo) → GREEN. Deps: T-01/T-02. AC: 13/13 green, suite 116→129.
- [x] **T-04** query hook — `apps/web/src/api/use-detalle-bucket-mes.ts`: `useDetalleBucketMes(bucket, periodo?)`, queryKey `['detalle-bucket-mes', bucket, periodo ?? 'actual']` (use-semaforo-detalle shape; D-07). **RED first**: `use-detalle-bucket-mes.test.tsx` (3: URL with/without periodo; ApiError surfaces) → GREEN. Deps: T-03. AC: 3/3 green.
- [x] **T-05** reclassify invalidation — `apps/web/src/api/use-reclasificar-categoria.ts`: add `['detalle-bucket-mes', bucket, clave]` alongside existing keys (D-05; WDM-07). **RED first**: `use-reclasificar-categoria.test.tsx` 2 renamed (coverage unchanged) → GREEN. Deps: T-04. AC: suite green; 3 net keys.

## PR 2 — The page (D-01..D-04, D-09) — serialized after PR1

- [x] **T-06** view-model — `apps/web/src/domain/detalle-bucket-mes-view-model.ts`: `aDetalleBucketMesViewModel` — labels only via `aPorcentajeLabel`/`formatearMontoCLP`/`SIN_PORCENTAJE_LABEL` (ADR-024), `marcaPorcentajePct`/`marcaMetaPct` = `clamp(bp/100,0,100)`, `sinPorcentaje`; payload passthrough verbatim (WDM-03/WDM-08; D-02). **RED first**: `domain/detalle-bucket-mes-view-model.test.ts` (10: labels; marcaPct bp/100; clamps 0/100; marcaMetaPct null; passthrough no re-sort; empty month zeros; sinPorcentaje; totals line) → GREEN. Deps: T-04. AC: 10/10 green.
- [x] **T-07** `normalizarDestacar` — `apps/web/src/domain/periodo.ts` (D-01): strict parser — exactly `'sin-categoria'` else `undefined` (fail-closed); import `CLAVE_SIN_CATEGORIA` from `agrupar-detalle-por-categoria.ts` (re-homed T-17). **RED first**: `domain/periodo.test.ts` +3 (accepts `'sin-categoria'`; rejects `'1'`/`'true'`/non-string; rejects `''`) → GREEN. Deps: —. AC: 3/3 green.
- [x] **T-08** page component — `apps/web/src/components/BucketDetalleMesPage.tsx`: router-agnostic; query switch (loading/error+retry); header — back-link `to="/" search={{periodo}}` (D-09), `PeriodoSelector`, %/meta tag, usage bar hidden iff `porcentajeBp===null` (D-02), totals line; `Empty` month state (WDM-05 — `Empty` props suffice, supersedes proposal); catalog surface (prefetch + status/alert); grupos; `destacar` highlight prop. **RED first**: `BucketDetalleMesPage.test.tsx` (18 cases per design §5; group interaction cases stay red until T-09) → GREEN. Deps: T-05/T-06/T-07. AC: 18/18 after T-09; one `h1`; tsc clean.
- [x] **T-09** group component — `apps/web/src/components/GrupoMovimientos.tsx`: group header (nombre, conteo, BigInt-exact subtotal — never `Number()`/`parseFloat()`), slice `FILAS_VISIBLES_POR_DEFECTO = 3`, `ver N más…`/`Ver menos` button, `aria-expanded`+`aria-controls` (useId), `useState(false)` per group (D-03; WDM-03; KISS — hand-rolled, no shadcn dep). RED: page-suite group cases (3-row + `ver 2 más…`; ≤3 rows no control; aria pairs; verbatim order) → GREEN. Deps: T-08. AC: page suite 18/18.
- [x] **T-10** route wiring — `apps/web/src/routes/_authenticated/buckets.$bucket.tsx`: `validateSearch` gains `destacar` via `normalizarDestacar`, pass boolean, `useNavigate` `onPeriodoChange` (D-04). RED: route stays thin/untested (us-049 precedent) — verify `pnpm web typecheck` + e2e deep-link (T-21). Deps: T-08. AC: tsc clean; deep link honored.
- [x] **T-11** a11y lint scope — `apps/web/eslint.config.js`: add `BucketDetalleMesPage.tsx`/`GrupoMovimientos.tsx` to jsx-a11y `error` block (US-042 precedent). RED: `pnpm web lint` flags new files → GREEN. Deps: T-08/T-09. AC: lint green.

## PR 3 — Dashboard wiring + flat-chain deletion + e2e (D-05/D-06/D-08) — serialized after PR2

- [x] **T-12** panel retirement — `apps/web/src/components/ResumenScreen.tsx`: drop `bucketElegido`/reset-effect (WPER-05) + inline `BucketDetailList` panel; single column; hint kept verbatim; thread `onSelectBucket` (D-06). **RED first**: `ResumenScreen.test.tsx` (12 keep; −4: panel-default, legend-switch+aria-pressed, SinCategoría selectable, selection reset; +2: legend row → onSelectBucket, wedge → onSelectBucket) → GREEN. Deps: T-08. AC: 14/14 green.
- [x] **T-13** chart controls navigate — `LeyendaGasto.tsx` + `DistribucionPie.tsx`: drop `seleccionado`/`bucketSeleccionado`/`aria-pressed`; keep `onSelectBucket` signature (D-06; WG5-03/06). **RED first**: remove `aria-pressed` tests (LeyendaGasto 14→13; DistribucionPie 21→20); click tests survive → GREEN. Deps: T-12. AC: suites green; no toggle semantics.
- [x] **T-14** page threading — `apps/web/src/components/ResumenPage.tsx`: `onSelectBucket(bucket, destacar?)` (D-06). RED: covered by T-12 suite + e2e; local = tsc. Deps: T-12/T-13. AC: tsc clean.
- [x] **T-15** dashboard route navigation — `apps/web/src/routes/_authenticated/index.tsx`: `navigate({ to:'/buckets/$bucket', params, search:{ periodo, ...(destacar && {destacar:'sin-categoria'}) } })` (D-06). RED: e2e legend→page + SinCategoría→destacar (T-21 cases 3-4). Deps: T-14. AC: e2e green; tsc clean.
- [x] **T-16** `esFechaValida` move — create `apps/web/src/domain/fecha.ts`; re-point `client.ts` import (D-08; 4 consumers). **RED first**: `domain/fecha.test.ts` (3 cases from deleted view-model test) → GREEN. Deps: — (parallel with T-12). AC: 3/3 green; client suite still green.
- [x] **T-17** `CLAVE_SIN_CATEGORIA` re-home — `apps/web/src/domain/periodo.ts` (D-08): move constant next to `normalizarDestacar`; update T-07 import. Deps: T-07. RED: existing periodo suite + tsc. AC: single source; no raw `'sin-categoria'` (DRY).
- [x] **T-18** delete flat web chain (D-08) — delete `BucketDetailList.tsx`+test, `use-detalle-bucket.ts`+test, `detalle-bucket-view-model.ts`+test, `agrupar-detalle-por-categoria.ts`+test; `client.ts`: remove `fetchDetalleBucket`/`esDetalleBucketDto`/`esDetalleBucketTransaccionDto`/`esCategoriaTx`; `client.test.ts`: delete 13-case block + imports + fixture (129→116). RED: post-T-12 suite/tsc break on stale refs → clean. Deps: T-12/T-16/T-17. AC: `pnpm web test` green; `rg` zero refs; tsc clean.
- [x] **T-19** invalidation matrix rename (D-05/D-08; WCTG-09) — `categorias-invalidacion.ts`+test, `use-ingesta.ts`+test, `use-eliminar-ingesta.ts`+test: `['detalle-bucket']` → `['detalle-bucket-mes']`; update exact-array cases in 6 hook tests (use-crear/actualizar/eliminar-categoria, use-crear/actualizar/eliminar-patron) + reclassify's 2 existing (T-05). **RED first**: update assertions → fail → GREEN rename. Deps: T-18. AC: WCTG-09 profiles green; no dead key.
- [x] **T-20** e2e fixtures — `apps/web/e2e/fixtures/api-stubs.ts`: `DETALLE_BUCKET_MES_FIXTURE`; grouped route `**/api/buckets/*/detalle*` registered AFTER flat `**/api/buckets/**` (LIFO last-registered-wins + ordering comment). RED: deep-link case red against flat stub. Deps: T-10. AC: e2e deep link green.
- [x] **T-21** e2e page suite — `apps/web/e2e/bucket-detalle-mes.e2e.ts` (4: deep link `?periodo=2026-07` header+grupos; tablet T1 header geometry (WDM-01); legend row → page; SinCategoría → `destacar`). Deps: T-20, T-15 (cases 3-4). AC: 4/4 Playwright green.
- [x] **T-22** e2e dashboard geometry — `apps/web/e2e/dashboard-donut.e2e.ts` test 6: drop 2-track grid assertion, keep divider geometry (D-06). RED: rewrite assertion → fails → GREEN. Deps: T-12. AC: suite green.
- [x] **T-23** docstring cleanup — `ResumenPage.test.tsx`/`ResumenAnual.test.tsx`: stale `BucketDetailList` comment refs (comment-only). Deps: T-18. AC: no stale refs; suites otherwise byte-unchanged.

## Scheduling

- **Independently schedulable first**: PR1 (T-01..T-05) — additive, revertible, no dependency on page/dashboard.
- **Serialized**: PR2 after PR1; PR3 after PR2 (page must exist before panel removal; deletions after last consumer dies — yagni rule).
- **Within PR3**: T-16 parallel with T-12; T-18 last-deletion gate after T-12/T-16/T-17; T-19 after T-18; T-20 before T-21; T-22/23 tail.

## Ledger cross-check (design §4 file + §5 test ledgers)

All §4 files covered: PR1 T-01..T-05; PR2 T-06..T-11; PR3 T-12..T-23 (incl. `fecha.ts` T-16, `periodo.ts` T-17, deleted chain T-18, matrix T-19, e2e T-20..T-22). All §5 suites covered: client +13/−13 (T-03/T-18), hooks T-04/T-05/T-19, view-model T-06, periodo T-07/T-17, page T-08/T-09, dashboard suites T-12/T-13/T-14/T-23, fecha T-16, e2e T-20/T-21/T-22. **WARNINGS: none.**