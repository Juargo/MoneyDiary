# Design: US-053 — Web: página Detalle MES-BUCKET (grupos) + drill-down real del dashboard

> Scope: HOW at architecture level. Every path/symbol below read on `main` (2026-08-18). Binding inputs: `proposal.md`, `specs/web-app/spec.md` (WDM-01..08; MODIFIED WCAT-01/02/03/04, WPER-05, WG5-03/06, WTA-03), `specs/bucket-detalle-mes/spec.md` (MBD-09). Format mirrors `archive/2026-08-17-us-051` / `2026-08-18-us-052`; web-page template `archive/2026-08-16-us-049`. 3 PRs, web-only.

## 1. Overview + Design Principles

The dashboard's interim inline panel (US-030) is retired. `/buckets/:bucket` becomes the month-scoped Detalle MES-BUCKET page fed by the grouped endpoint (MBD-09, shipped us-051): header (breadcrumb, `PeriodoSelector`, %/meta tag, usage bar, totals line) + grupos with transacciones. Drilling from the dashboard navigates to the page carrying `periodo` and — for Sin categoría — `destacar`.

Principles: (1) router-agnostic page body, route stays thin/untested (us-049 precedent); (2) pure view-model owns geometry/formatting (semaforo-detalle precedent); (3) server payload passes through verbatim — no re-sort/re-group (WDM-03); (4) dead code deleted the PR its last consumer dies (yagni), never before; (5) e2e fixtures evolve with the contracts they stub.

## 2. Decisions

| # | Decision | Alternatives | Choice + rationale |
|---|----------|--------------|--------------------|
| D-01 | `destacar` value | `destacar=1` (opaque); bare presence (`?destacar` → `''` in URLSearchParams, ambiguous) | Pin **`destacar=sin-categoria`** — semantic literal identical to `CLAVE_SIN_CATEGORIA` (re-homed to `domain/periodo.ts` by D-08 — `agrupar-detalle-por-categoria.ts` is deleted in PR3); strict parser `normalizarDestacar` (exactly `'sin-categoria'`, else `undefined`, fail-closed) in `domain/periodo.ts` next to `normalizarPeriodo`; deep-link friendly (WDM-04). |
| D-02 | Usage bar | `role="progressbar"` (single determinate value — wrong: bar shows two markers); CSS-only track | Track `h-1.5 bg-muted` + two absolute markers, track+markers `aria-hidden="true"`; accessible content is the %/meta tag text (ZonaBar precedent). **Hidden whenever `porcentajeBp === null`** (bar rule — distinct from the tag rule: the tag hides only for SinCategoria `metaBp === null`, while a no-income month keeps the tag as `SIN_PORCENTAJE_LABEL`; WDM-04). Marker pcts from view-model: `marcaPorcentajePct = clamp(bp/100, 0, 100)`, `marcaMetaPct = clamp(metaBp/100, 0, 100) \| null`. |
| D-03 | Expand/collapse | shadcn Collapsible (not installed in `components/ui`); parent-owned state map (sync burden) | Hand-rolled `<button aria-expanded aria-controls>` in new child `GrupoMovimientos` (`useState(false)` per group). `FILAS_VISIBLES_POR_DEFECTO = 3`; slice display-only (MBD-02 payload untouched). Labels: `ver ${n} más…` (lowercase, WDM-03) / `Ver menos`; `aria-controls` = useId-derived id on the `<ul>`. |
| D-04 | Route composition | Logic in route (untestable, us-047 lesson) | `buckets.$bucket.tsx` stays thin: `validateSearch` gains `{ destacar?: 'sin-categoria' }`; passes boolean `destacar` (`!== undefined`) to `BucketDetalleMesPage`; owns `useNavigate` for `onPeriodoChange` via `navigate({ search: prev => ({...prev, periodo}) })` (routes/index.tsx pattern). |
| D-05 | Reclassify retention | Drop per-row control (regression vs WCAT-04) | `ReclasificarCategoriaControl` ported per row — props fit verbatim (`transaccionId`, `descripcion`, `montoLabel = formatearMontoCLP(tx.monto)`, `bucketActual`, `categoriaActual = grupo.categoriaId === null ? null : grupo.nombre`, `periodo`). `useReclasificarCategoria` invalidation: PR3 **replaces** `['detalle-bucket', bucket, clave]` with `['detalle-bucket-mes', bucket, clave]` in `use-reclasificar-categoria.ts` — net: 3 keys (`['resumen', clave]`, `['detalle-bucket-mes', bucket, clave]`, `['resumen-anual']`), no dead key (D-08 deletes the only queries the flat key matched); refetch removes moved tx + refreshes header counts. Invalidation is matrix-wide, not only reclassify: PR3 replaces the flat prefix `['detalle-bucket']` with `['detalle-bucket-mes']` in `invalidarCatalogoYDashboard` (`categorias-invalidacion.ts`) and the two ingesta hooks (`use-ingesta.ts`, `use-eliminar-ingesta.ts`) — a category/ingesta mutation must refresh the new page instead (staleTime 30s, WCAT-04). |
| D-06 | Dashboard wiring | Keep panel dormant (dead selection state) | `ResumenScreen` drops `bucketElegido`/reset-effect (WPER-05) + inline panel; chart card becomes single-column (no `dashboard-page-grid` 2-col). `LeyendaGasto`/`DistribucionPie` drop `seleccionado`/`bucketSeleccionado` + `aria-pressed` (navigation isn't a toggle) but KEEP `onSelectBucket` signature; `ResumenPage` threads new `onSelectBucket(bucket, destacar?)` prop; `routes/_authenticated/index.tsx` wires `navigate({ to: '/buckets/$bucket', params, search: { periodo, ...(destacar && { destacar: 'sin-categoria' }) } })`. Hint text kept verbatim (still true; e2e stability). |
| D-07 | Client plumbing | Duplicate guards inline (parsing drift) | `packages/api-client/src/index.ts`: `DetalleBucketMesDto = S['BucketDetalleMesResponse']` + nested `GrupoDetalleBucketMesDto`/`TransaccionDetalleBucketMesDto` aliases (type-only; **no regen** — schema shipped with us-051). Web re-export in `types.ts`. `client.ts`: `fetchDetalleBucketMes` + `esDetalleBucketMesDto` (matrix §6); 400 → `{tag:'invalid', message:'El bucket o el período no son válidos.'}` (flat precedent). Hook `useDetalleBucketMes` (use-semaforo-detalle shape), queryKey `['detalle-bucket-mes', bucket, periodo ?? 'actual']`. |
| D-08 | Delete flat web chain | Keep dormant (yagni: dead code) | **Delete in PR3** — verified sole production consumer is `BucketDetailList.tsx` (grep: no other imports of `use-detalle-bucket`, `detalle-bucket-view-model`, `agrupar-detalle-por-categoria`); `esCategoriaTx` sole consumer is `esDetalleBucketTransaccionDto` (client.ts:472/503). `esFechaValida` **moves** to new `domain/fecha.ts` (4 live consumers: esTransaccionResponseDto, esPreviewTransaccionDto, esIngestaListItemDto, + new guard) — never deleted. `CLAVE_SIN_CATEGORIA` **moves** to `domain/periodo.ts` next to `normalizarDestacar` (D-01) — never deleted, so the `'sin-categoria'` literal stays a named constant across `periodo.ts`/route wiring/e2e instead of a raw string (DRY). Backend flat endpoint stays (API, out of web scope, MBD-09). |
| D-09 | Mobile back control | `BotonVolver` (**rejected**: `to` typed `Extract<NavRoute,'/'|'/configuracion/categorias'>`, carries NO `search={{periodo}}` → drops month on return = CA-08 bug class) | Hand-rolled header `Link to="/" search={{ periodo }}` (SemaforoDetallePage precedent, lines 58-64). |

## 3. Architecture at a glance

```
routes/_authenticated/index.tsx  navigate({to:'/buckets/$bucket', search:{periodo,destacar?}})
   └─ ResumenPage ─ onSelectBucket ─▶ ResumenScreen ─▶ LeyendaGasto / DistribucionPie (onSelectBucket)
routes/_authenticated/buckets.$bucket.tsx  (validateSearch: periodo+destacar, useNavigate, thin)
   └─ BucketDetalleMesPage (query switch, header, grupos)              useDetalleBucketMes(bucket, periodo)
        ├─ GrupoMovimientos ×N (slice + expand) ── ReclasificarCategoriaControl por fila
        └─ detalle-bucket-mes-view-model (labels, marcaPorcentajePct/MarcaMetaPct, sinPorcentaje)
   client.ts: fetchDetalleBucketMes ─▶ GET /api/buckets/:bucket/detalle?periodo=  ─▶ MBD-09
```

## 4. File ledger per PR

| PR | File | Action | Description |
|----|------|--------|-------------|
| 1 | `packages/api-client/src/index.ts` | Modify | 3 type aliases (D-07). |
| 1 | `apps/web/src/api/types.ts` | Modify | Re-export aliases + why-note. |
| 1 | `apps/web/src/api/client.ts` | Modify | `fetchDetalleBucketMes` + 3 guards (D-07). |
| 1 | `apps/web/src/api/use-detalle-bucket-mes.ts` | Create | Hook, queryKey pin (D-07). |
| 1 | `apps/web/src/api/use-reclasificar-categoria.ts` | Modify | +`['detalle-bucket-mes', bucket, clave]` invalidation (D-05). |
| 2 | `apps/web/src/domain/detalle-bucket-mes-view-model.ts` | Create | `aDetalleBucketMesViewModel`: labels via `aPorcentajeLabel`/`formatearMontoCLP`, `marcaPorcentajePct`, `marcaMetaPct`, `sinPorcentaje`; payload passthrough verbatim. |
| 2 | `apps/web/src/domain/periodo.ts` | Modify | `normalizarDestacar` (D-01). |
| 2 | `apps/web/src/components/BucketDetalleMesPage.tsx` | Create | Router-agnostic page body: query switch, header (breadcrumb/back-link D-09, PeriodoSelector, tag, bar, totals), Empty for WDM-05 (`Empty` props suffice — **no `Empty.tsx` change**, supersedes proposal), catalog surface (prefetch + status/alert), grupos. |
| 2 | `apps/web/src/components/GrupoMovimientos.tsx` | Create | Group header + slice + expand button (D-03). |
| 2 | `apps/web/src/routes/_authenticated/buckets.$bucket.tsx` | Modify | validateSearch destacar, navigate wiring, render new page (D-04). |
| 2 | `apps/web/eslint.config.js` | Modify | US-053 scoped a11y block: `BucketDetalleMesPage.tsx`, `GrupoMovimientos.tsx`. |
| 3 | `apps/web/src/components/ResumenScreen.tsx` | Modify | Panel+selection removed; single column; hint kept; `onSelectBucket` threaded (D-06). |
| 3 | `apps/web/src/components/LeyendaGasto.tsx`, `DistribucionPie.tsx` | Modify | Drop `seleccionado`/`bucketSeleccionado`/`aria-pressed`; keep `onSelectBucket` (D-06). |
| 3 | `apps/web/src/components/ResumenPage.tsx` | Modify | Thread `onSelectBucket(bucket, destacar?)`. |
| 3 | `apps/web/src/routes/_authenticated/index.tsx` | Modify | navigate wiring (D-06). |
| 3 | `apps/web/src/domain/fecha.ts` | Create | `esFechaValida` moved (D-08). |
| 3 | `BucketDetailList.tsx`+test, `use-detalle-bucket.ts`+test, `detalle-bucket-view-model.ts`+test, `agrupar-detalle-por-categoria.ts`+test | Delete | Flat web chain (D-08). |
| 3 | `apps/web/src/domain/periodo.ts` | Modify | `CLAVE_SIN_CATEGORIA` re-homed from `agrupar-detalle-por-categoria.ts` (D-08) — `normalizarDestacar` (PR2) parses `'sin-categoria'` against it. |
| 3 | `apps/web/src/api/client.ts` | Modify | Remove `fetchDetalleBucket`, `esDetalleBucketDto`, `esDetalleBucketTransaccionDto`, `esCategoriaTx`; import `esFechaValida` from `domain/fecha`. |
| 3 | `apps/web/src/api/client.test.ts` | Modify | Delete `fetchDetalleBucket` describe block (13 cases) + `fetchDetalleBucket`/`DetalleBucketDto` imports + `validDetalleBucketDto` fixture (D-08). |
| 3 | `apps/web/src/api/categorias-invalidacion.ts`+test | Modify | `invalidarCatalogoYDashboard`: `['detalle-bucket']` prefix → `['detalle-bucket-mes']` (D-05/D-08). |
| 3 | `apps/web/src/api/use-ingesta.ts`+test | Modify | invalidation `['detalle-bucket']` → `['detalle-bucket-mes']` (D-05/D-08). |
| 3 | `apps/web/src/api/use-eliminar-ingesta.ts`+test | Modify | invalidation `['detalle-bucket']` → `['detalle-bucket-mes']` (D-05/D-08). |
| 3 | `apps/web/e2e/fixtures/api-stubs.ts` | Modify | `DETALLE_BUCKET_MES_FIXTURE` + grouped route `**/api/buckets/*/detalle*` **registered after** flat `**/api/buckets/**` (LIFO — last-registered-wins; ordering comment). |
| 3 | `apps/web/e2e/bucket-detalle-mes.e2e.ts` | Create | 4 cases (§5). |
| 3 | `apps/web/e2e/dashboard-donut.e2e.ts` | Modify | Test 6: drop page-grid 2-track assertion, keep divider geometry. |

## 5. Test ledger (RED-first)

| Suite | Action | Cases | Notes |
|-------|--------|-------|-------|
| `client.test.ts` (116) | Modify | +13 | fetchDetalleBucketMes: 200 ok; 400 invalid; 401; 5xx; network; non-JSON parse; `total` malformed; `grupos[].subtotal` malformed; `transacciones[].monto` `"12.5"` → parse (money guard); `fecha` malformed; `porcentajeBp` wrong type; `grupos` non-array; URL shape (bucket+periodo). |
| `client.test.ts` (129→116) | Modify | −13 | PR3 (D-08): delete `fetchDetalleBucket` describe block (13 cases, lines 485-675) + its import/fixture; suite 116 → 129 (PR1 +13) → 116 (PR3 −13). |
| `use-detalle-bucket-mes.test.tsx` | Create | 3 | URL with/without periodo; ApiError surfaces. |
| `use-reclasificar-categoria.test.tsx` (5) | Modify | +2 (PR1); 2 existing invalidation cases updated (PR3) | PR1: invalidates `['detalle-bucket-mes', bucket, clave]` and `'actual'` variant. PR3 (D-05): the 2 pre-existing invalidation assertions (lines 118-124, 152-157) rename `['detalle-bucket', bucket, clave]` → `['detalle-bucket-mes', bucket, clave]`. |
| `categorias-invalidacion.test.ts` | Modify | update | `invalidarCatalogoYDashboard` invalidates `['detalle-bucket-mes']`; flat prefix `['detalle-bucket']` dead after PR3 (D-05/D-08). |
| `use-ingesta.test.tsx` | Modify | update | invalidation key `['detalle-bucket']` → `['detalle-bucket-mes']`. |
| `use-eliminar-ingesta.test.tsx` | Modify | update | invalidation key `['detalle-bucket']` → `['detalle-bucket-mes']`. |
| `use-crear-categoria.test.tsx` (4) | Modify | 1 updated | exact-array 4-key success case (74-79): `['detalle-bucket']` → `['detalle-bucket-mes']` (PR3 matrix fix). |
| `use-actualizar-categoria.test.tsx` (5) | Modify | 2 updated | exact-array 4-key cases (76-81 bucket-change, 98-103 rename-only): `['detalle-bucket']` → `['detalle-bucket-mes']` (PR3 matrix fix). |
| `use-eliminar-categoria.test.tsx` (5) | Modify | 1 updated | exact-array 4-key success case (73-78): `['detalle-bucket']` → `['detalle-bucket-mes']` (PR3 matrix fix). |
| `use-crear-patron.test.tsx` (5) | Modify | 1 updated | exclusion test (seed 151, assertion 168): seed key `['detalle-bucket']` → `['detalle-bucket-mes']` in exclusion assertions (PR3 matrix fix). |
| `use-actualizar-patron.test.tsx` (5) | Modify | 1 updated | exclusion test (seed 124, assertion 137): seed key `['detalle-bucket']` → `['detalle-bucket-mes']` in exclusion assertions (PR3 matrix fix). |
| `use-eliminar-patron.test.tsx` (5) | Modify | 1 updated | exclusion test (seed 122, assertion 135): seed key `['detalle-bucket']` → `['detalle-bucket-mes']` in exclusion assertions (PR3 matrix fix). |
| `domain/detalle-bucket-mes-view-model.test.ts` | Create | 10 | labels; marcaPct bp/100; clamps 0/100; marcaMetaPct null; passthrough verbatim (no re-sort); empty month zeros; sinPorcentaje flag; totals line. |
| `domain/periodo.test.ts` | Modify | +3 | `normalizarDestacar`: accepts `'sin-categoria'`; rejects `'1'`/`'true'`/non-string; rejects `''`. |
| `BucketDetalleMesPage.test.tsx` | Create | 18 | loading; error+retry; empty month (WDM-05); header all elements (WDM-01); SinCategoria no tag/no bar; no-income tag `—` + bar hidden; grupos verbatim (WDM-03/2); group header BigInt-exact (WCAT-02); 3-row default + `ver 2 más…` expand/collapse (WDM-03/1); ≤3 rows no control; aria-expanded+aria-controls; destacar highlight vs none (WDM-04/1); reclassify control wired per row (WCAT-04); onPeriodoChange; back link preserves periodo; one `h1`; catalog status exactly one; catalog alert + Reintentar. |
| `ResumenScreen.test.tsx` (16) | Modify | 12 keep, 4 removed, +2 | Removed: panel-default, legend-switch+aria-pressed, SinCategoría selectable, selection reset (WPER-05). Added: legend row → onSelectBucket; wedge → onSelectBucket. |
| `LeyendaGasto.test.tsx` (14) | Modify | 1 removed | `aria-pressed` test (173); click test survives (197). |
| `DistribucionPie.test.tsx` (21) | Modify | 1 removed | `aria-pressed` test (176); click survives (192). |
| `ResumenPage.test.tsx`, `ResumenAnual.test.tsx` | Modify | comment-only | Stale `BucketDetailList` docstring refs (lines 70-72/229, 10). |
| `domain/fecha.test.ts` | Create | 3 | esFechaValida cases moved from deleted view-model test. |
| `e2e/bucket-detalle-mes.e2e.ts` | Create | 4 | deep link `/buckets/Deseos?periodo=2026-07` header+grupos; tablet header geometry (WDM-01); dashboard legend row → `/buckets/Deseos?periodo=…`; dashboard Sin categoría → `/buckets/SinCategoria?…&destacar=sin-categoria`. |
| `e2e/dashboard-donut.e2e.ts` (6) | Modify | 1 rewritten | test 6 page-grid → single-column. |

Gate: additive rule — suites not listed stay byte-unchanged; `tsc` clean per PR.

## 6. Contracts

`esDetalleBucketMesDto`: `periodo: string` · `bucket: string` · `total: string`+`esMontoStringValido` · `totalTransacciones`/`totalCategorias: number` · `porcentajeBp`/`metaBp: number|null` · `grupos: array` → per grupo: `categoriaId: string|null`, `nombre: string`, `subtotal: string`+guard, `conteo: number`, `transacciones: array` → per tx: `id: string`, `fecha: string`+`esFechaValida`, `descripcion: string`, `monto: string`+guard (WG5-05 lesson).

Usage-bar render contract: bar (track+markers, `aria-hidden`) renders **iff** `porcentajeBp !== null`; marker at `clamp(bp/100,0,100)`; meta marker iff `metaBp !== null`; accessible text = tag only (`aPorcentajeLabel`/`SIN_PORCENTAJE_LABEL`).

## 7. Review Workload Forecast

- **Estimated changed lines**: ~1,700 across 3 PRs (PR1 ~380, PR2 ~700, PR3 ~620 incl. deletions).
- **Chained-PR**: Yes (3 sequential).
- **400-line budget risk**: High in PR2 (new page + view-model + 18-case suite). Mitigation: PR2 is page-only; deletions deferred to PR3.
- **Decision needed before apply**: Yes — orchestrator sign-off on D-08 (flat-chain deletion scope) and D-06 (aria-pressed removal) is pinned; no open technical forks remain.

## 8. Rollback / Compatibility

Type-only api-client aliases (PR1) are additive. PR2 ships behind the existing route; the flat chain + panel remain until PR3, so PR2 is independently revertible. PR3's deletion is the only destructive step — revert = restore 4 files + `fecha.ts` move (git). Backend untouched in all PRs.

## 9. Risks

- `aria-controls`/useId + slice: jsdom-verified in page suite; e2e covers tablet geometry only.
- Playwright LIFO — last-registered-wins: grouped route must be registered **after** flat `**/api/buckets/**` — ordering comment + e2e red before fix.
- `normalizarDestacar` in `domain/periodo.ts` couples URL param to domain module — accepted (same home as `normalizarPeriodo`).