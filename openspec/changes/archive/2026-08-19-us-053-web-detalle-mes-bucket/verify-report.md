# Verification Report — us-053-web-detalle-mes-bucket

**Change**: us-053-web-detalle-mes-bucket (US-053, issue #287)
**Mode**: Strict TDD (pnpm web test / vitest)
**Verified at**: `main` @ cff13ddd (merge of PR #422), 2026-08-19
**Verdict**: PASS WITH WARNINGS

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 23 |
| Tasks complete | 23 (`tasks.md` all `[x]`) |
| Tasks incomplete | 0 |
| Spec requirements | 19 scenarios across WDM-01..08, WCAT-01..04, WCTG-09, WPER-05, WG5-03/06, WTA-03, MBD-09 |
| Compliant | 17 |
| Partial | 2 (WDM-02 arrows→URL, WPER-05 page-side — see Issues W-1) |
| Failing / Untested | 0 |

## Build & Tests Execution

**Build/typecheck**: ✅ Passed
```text
$ pnpm web typecheck   # tsr generate && tsc -b  → clean, no errors
```

**Tests (vitest)**: ✅ 1141 passed / 0 failed / 0 skipped — 108 files
```text
$ pnpm web test
Test Files  108 passed (108)
     Tests  1141 passed (1141)
```
Matches the ledger's final suite total exactly (1149 → 1203 → 1147 → 1141).

**Lint**: ✅ 0 errors, 2 pre-existing warnings (US-013-era: `EliminarIngestaControl.tsx:128`, `ReclasificarCategoriaControl.tsx:224` — present before this change, unchanged by it).

**E2E (Playwright, environment supports it)**: ✅ 10 passed / 20 project-scoped skips / 0 failed
- `bucket-detalle-mes.e2e.ts`: 4/4 executed cases pass (deep link WDM-01 header + WDM-03 groups; T1 tablet geometry via boundingBox; legend row → `/buckets/Deseos?periodo=2026-07` with `destacar`-absence pin; Sin categoría → `?destacar=sin-categoria` with highlight + zero usage bars).
- `dashboard-donut.e2e.ts`: test 6 rewritten (T-22) passes — single-column page grid claim transferred to WDS-04 jsdom, divider geometry kept.
- No e2e case remains unverified; the 20 skips are the deliberate per-project `test.skip` scoping.

**Coverage (changed files)**: ✅ Strong — every new core file at 100% (view-model, `fecha`, `periodo`, `use-detalle-bucket-mes`, `GrupoMovimientos`, `ResumenScreen`, hooks, matrix); `BucketDetalleMesPage` 92.9% stmts / 93.1% branch; `client.ts` 88.3% / 91.0%; `LeyendaGasto` 100% stmts (75% branch, kind dispatch); `ResumenPage` 88.9%. Exception: `buckets.$bucket.tsx` route 27.3% — design-intentional (D-04 thin-route-untested, us-049 precedent; covered via e2e deep-link + jsdom page suite). `index.tsx` 63.6% — new navigate closure covered by e2e cases 3/4.

## Spec Compliance Matrix

| Requirement | Scenario | Covering test | Result |
|-------------|----------|---------------|--------|
| WDM-01 | Header all elements (jsdom) | `BucketDetalleMesPage.test.tsx` "renders the full header" | ✅ COMPLIANT |
| WDM-01 | T1 tablet geometry (Playwright) | `bucket-detalle-mes.e2e.ts` case 2 (boundingBox) | ✅ COMPLIANT |
| WDM-02 | Arrows change month + URL updates | page test "reports the previous month" (onPeriodoChange) + route functional updater (inspection) — URL mutation not runtime-pinned (route untested by D-04) | ⚠️ PARTIAL |
| WDM-02 | Deep link honours `periodo`; absent → current month | e2e case 1 + `use-detalle-bucket-mes.test.tsx` "sin periodo" | ✅ COMPLIANT |
| WDM-03 | 3 rows + ver N más expand/collapse | page tests 9/10/11 (aria pairs, ≤3 rows no control) | ✅ COMPLIANT |
| WDM-03 | Group order verbatim | page test 7 (Ñoquis, Zapatería, Sin categoría) | ✅ COMPLIANT |
| WDM-04 | `destacar` highlight vs none | page test 12 (data-destacado + aria-current) + e2e case 4 | ✅ COMPLIANT |
| WDM-04 | SinCategoria no %/meta, no bar | page test 5 + e2e case 4 (`usage-bar` count 0) | ✅ COMPLIANT |
| WDM-05 | Empty month zeros + copy + nav alive | page test 3 | ✅ COMPLIANT |
| WDM-06 | Spend-bucket row navigates, no `destacar` | `ResumenScreen.test.tsx` +2 + e2e case 3 (`not.toHaveURL(/destacar/)`) | ✅ COMPLIANT |
| WDM-06 | Sin categoría navigates with `destacar` | `ResumenScreen.test.tsx` (wedge + destacar) + e2e case 4 | ✅ COMPLIANT |
| WDM-07 | Reclassify invalidates `['detalle-bucket-mes', bucket, clave]` | `use-reclasificar-categoria.test.tsx` 2 renamed cases (with/without periodo) | ✅ COMPLIANT |
| WDM-08 | Only `aPorcentajeLabel` bp derivation | view-model test 1 + clamp tests + inspection | ✅ COMPLIANT |
| WCAT-01 | Clicking Deseos shows only Deseos | e2e case 3 + page renders single-bucket payload | ✅ COMPLIANT |
| WCAT-02 | Groups with counts/subtotals | page test 7 | ✅ COMPLIANT |
| WCAT-02 | BigInt-exact subtotals | page test 8 (`9007199254740993`) | ✅ COMPLIANT |
| WCAT-02 | New categoría sorts, no enum | verbatim-order test + zero `ORDEN_CATEGORIAS` refs (rg) | ✅ COMPLIANT |
| WCAT-02 | Sin categoría always last | server-order verbatim (fixture has it last, MBD-02) | ✅ COMPLIANT |
| WCAT-03 | Explicit empty month + dashboard empty unchanged | page test 3 + dashboard suites green | ✅ COMPLIANT |
| WCAT-04 | Per-row control, live catalog, confirm, refresh | page test 13 (7 comboboxes per visible row) + `ReclasificarCategoriaControl` suite (unchanged, green) + WDM-07 invalidation tests | ✅ COMPLIANT |
| WCTG-09 | Pattern mutation → catalog only + dedicated exclusion | `categorias-invalidacion.test.ts` (exact-array, renamed key) | ✅ COMPLIANT |
| WCTG-09 | Category mutation → 4 keys incl. `detalle-bucket-mes` | `categorias-invalidacion.test.ts` profile B | ✅ COMPLIANT |
| WPER-05 | Period change routes through URL, no parallel state | dashboard side pre-existing (green); page side ⚠️ PARTIAL (same as WDM-02) | ⚠️ PARTIAL |
| WG5-03 | 5 rows fixed order, clickable rows navigate, Ingresos inert | LeyendaGasto 13 + DistribucionPie 20 + ResumenScreen +2 + e2e 3/4 (all green) | ✅ COMPLIANT |
| WG5-06 | Ingresos no drill-down; 4 rows navigate | LeyendaGasto inert-row tests + ResumenScreen +2 | ✅ COMPLIANT |
| WTA-03 | Month nav survives restructure | ResumenScreen/ResumenAnual suites green (regression) | ✅ COMPLIANT |
| MBD-09 | Flat endpoint unchanged after US-053 | no `apps/api` files in the merge diff (web + api-client types + openspec only) | ✅ COMPLIANT (informational) |

**Compliance summary**: 25/27 scenarios compliant, 2 partial, 0 failing/untested.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| WDM-01..05 page | ✅ Implemented | Router-agnostic page; header (breadcrumb, back-link D-09, PeriodoSelector, tag/bar per D-02 rules, totals); WDM-05 empty via `Empty` props (design supersedes proposal's Empty.tsx change — only docstring touched); destacar prop; catalog surface once (status/alert+Reintentar) |
| WDM-03 group | ✅ Implemented | `FILAS_VISIBLES_POR_DEFECTO = 3`, display-only slice, `ver N más…`/`Ver menos`, `aria-expanded`/`aria-controls` via `useId`, keyed by `periodo-categoriaId` (expansion reset across months, commit 10175027) |
| WDM-06 wiring | ✅ Implemented | Panel + `bucketElegido` + reset-effect gone; single-column grid; `onSelectBucket(bucket, destacar?)` threaded; destacar derived from `BUCKETS_ANILLO` last member (no raw literal); hint verbatim; e2e-stable |
| D-07 client | ✅ Implemented | Type-only aliases (no regen); guard validates money via `esMontoStringValido`, `fecha` via `esFechaValida`, bp/counts types; 400 → `{tag:'invalid', message:'El bucket o el período no son válidos.'}` |
| D-08 deletion | ✅ Implemented | 7 files deleted + `use-detalle-bucket.test.tsx` renamed; `esFechaValida` → `domain/fecha.ts` (4 consumers live); `CLAVE_SIN_CATEGORIA` → `domain/periodo.ts`; zero stale live refs (rg: remaining hits are history-documenting comments) |
| Invalidation matrix | ✅ Implemented | `['detalle-bucket']` → `['detalle-bucket-mes']` in `invalidarCatalogoYDashboard`, `use-ingesta`, `use-eliminar-ingesta`, `use-reclasificar-categoria` (net 3 keys) + 6 hook-test exact-array assertions |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D-01 `destacar=sin-categoria` | ✅ Yes | Strict `normalizarDestacar`, fail-closed; named constant (DRY); string round-trip through search type (judgment-day fix — serializes validated output) |
| D-02 usage bar | ✅ Yes | Bar iff `porcentajeBp !== null`; tag iff `metaBp !== null`; markers `clamp(bp/100,0,100)`; `aria-hidden` track |
| D-03 expand/collapse | ✅ Yes | Hand-rolled button, no shadcn dep; per-group `useState`; 3 visible rows |
| D-04 route composition | ✅ Yes | Thin route; `validateSearch` + functional `navigate` update preserving `destacar`; boolean derived `!== undefined` |
| D-05 reclassify invalidation | ✅ Yes | 3 net keys; matrix-wide rename |
| D-06 dashboard wiring | ✅ Yes | Selection state + panel retired; `aria-pressed` dropped; `onSelectBucket` signature kept |
| D-07 client plumbing | ✅ Yes | Aliases, guard, hook, queryKey `['detalle-bucket-mes', bucket, periodo ?? 'actual']` |
| D-08 flat chain deletion | ✅ Yes | Deleted in PR3; helpers re-homed; no stale refs; backend flat endpoint untouched (MBD-09) |
| D-09 back control | ✅ Yes | Hand-rolled `Link to="/" search={{periodo}}`; page test pins `href="/?periodo=2026-07"` |

Design deviations: none behavioral. Out-of-ledger touches are comment-only docstring sweeps (T-23 extended: `use-me`, `use-resumen-anual`, `ResumenAnual`, `ListaIngestas`, `Empty`, `Loading`, `Error.test`, `periodo-anual`, `mensajes-catalogo`, `router-harness`, `use-semaforo-detalle.test`, `ReclasificarCategoriaControl`+test) plus the judgment-day dead-code deletion in `resumen-view-model.ts` (`bucketPorDefecto`/`bucketConMayorTotal`/`montoSeguro` + 9 tests) — consistent with WPER-05/D-06.

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD evidence reported | ✅ | apply-progress #832 (batch-level RED→GREEN + counts) + session summaries #833/#835 (per-batch: PR1 +18, PR2 gates 1203, T-19 RED 7→1147, T-20 RED 4→4/4, e2e 4/4) |
| Per-task TDD Cycle Evidence table | ⚠️ | #832 is a condensed summary without the formal per-task RED/GREEN/TRIANGULATE table; tasks.md documents per-task RED/GREEN contracts and test files exist + pass on execution (see W-2) |
| All tasks have tests | ✅ | 23/23 — type-only tasks (T-01/02) and thin-route tasks (T-10/14/15) covered by suites/e2e per their own ACs |
| RED confirmed (files exist) | ✅ | All ledger test files exist: client +13 block, hook 3, view-model 10, periodo +3, page 18, fecha 3, reclassify 5, matrix 3 |
| GREEN confirmed (pass now) | ✅ | 1141/1141 vitest + 10/10 e2e executed this session |
| Triangulation | ✅ | Page 18 cases over 8 requirements; client 13; view-model 10; e2e 4 with URL/geometry assertions |
| Safety net (modified files) | ✅ | Baseline 1149 → PR2 1203 → T-19 1147 → final 1141, sequential gate runs documented |

**TDD Compliance**: 6/7 checks passed (1 format-gap warning)

## Test Layer Distribution

| Layer | Tests (new/changed) | Files | Tools |
|-------|---------------------|-------|-------|
| Unit | ~32 (client 13, view-model 10, fecha 3, periodo 3, matrix 3) | 6 | vitest |
| Integration | ~45 (page 18, hook 3, dashboard ±) | 9 | vitest + testing-library |
| E2E | 4 new + 1 rewritten | 2 | Playwright |
| **Total** | **1141 suite / 10 e2e executed** | 108 + 2 | |

## Assertion Quality

✅ All assertions verify real behavior — audited the new/modified suites (view-model, hook, page, client block, fecha, periodo, reclassify, matrix, ResumenScreen, e2e): no tautologies, no ghost loops, no smoke-only tests, no bare type-only assertions, no mock-heavy files. E2E asserts URLs, geometry, and attributes — not classnames.

## Quality Metrics

**Linter**: ✅ 0 errors / ⚠️ 2 pre-existing warnings (not from this change)
**Type Checker**: ✅ No errors
**Coverage**: ✅ Changed-file averages ~96%; only the design-intentional thin route is low (27.3%)

## Issues Found

**CRITICAL**: None

**WARNING**:
- **W-1** — WDM-02 scenario 1 / WPER-05 (page side): the arrow → URL `periodo` mutation is not pinned by any runtime test. jsdom pins the page's `onPeriodoChange('2026-06')` callback; the route's functional `navigate` updater is implemented and inspected; e2e proves the search pipeline for arrival (deep link, cases 1/3/4) but never activates the arrows. The route is untested by design (D-04, us-049 precedent). Behavioral gap is small and implementation-correct, but the spec's URL-update claim lacks a passing covering test. Suggest an e2e arrow interaction or accepting the D-04 exception explicitly at archive.
- **W-2** — Apply-progress artifact (#832) is a condensed summary without the formal per-task TDD Cycle Evidence table the strict-TDD protocol expects. Substantive RED→GREEN evidence exists (batch-level in #832, per-batch in #833/#835, per-task contracts in tasks.md) and was independently verified by this session's execution — format gap, not substance gap.
- **W-3** — `buckets.$bucket.tsx` route coverage 27.3%. Design-intentional (D-04), documented; not blocking.

**SUGGESTION**:
- **S-1** — design.md §5 reclassify ledger row reads "+2 (PR1)"; final state is 5 tests with 2 renamed (tasks.md T-05 wording is the accurate one). Cosmetic ledger drift.
- **S-2** — design.md §4 predicted "no `Empty.tsx` change"; the file was touched comment-only. Superseded note.
- **S-3** — Out-of-ledger comment-only touches (12 files) + `resumen-view-model` dead-code deletion (+9 tests removed) not listed in design §4/§5 ledger; all consistent with D-06/WPER-05/T-23.
- **S-4** — `src/domain/fecha.ts` docstring references the deleted `aFechaLabel` slice rationale; harmless historical reference (matches repo convention of keeping provenance comments).

## Verdict

**PASS WITH WARNINGS** — all gates green (1141/1141 vitest, tsc clean, lint 0 errors, 10/10 e2e), 23/23 tasks, 25/27 spec scenarios runtime-compliant with 2 partial (both the same D-04 route-untested gap), D-01..D-09 fully coherent, zero CRITICAL. Warnings are a spec-coverage pin gap (W-1) and two process/format notes (W-2, W-3) — none block archive readiness, but W-1 should be consciously accepted (D-04) or closed with an e2e arrow case.