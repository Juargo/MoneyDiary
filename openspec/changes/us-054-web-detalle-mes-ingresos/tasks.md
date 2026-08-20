# Tasks: US-054 — Web: página Detalle MES-INGRESOS + drill-down real desde la leyenda (issue #288)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400 (PR1 ~450 · PR2 ~500 · PR3 ~400 incl. e2e) |
| 400-line budget risk | High (PR1 ~450, PR2 ~500 exceed) |
| Chained PRs recommended | Yes (3 sequential) |
| Suggested split | PR1 client plumbing + domain helpers → PR2 page → PR3 dashboard flip + e2e |
| Delivery strategy | ask-on-risk (default) |
| Chain strategy | pending (recommend stacked-to-main — design §8: each PR independently revertible, no tracker) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Client plumbing + domain helpers (aliases, guard, fetch, hook, `periodoActual`, `aFechaCorta`, view-model) | PR 1 | Additive, revertible, independently schedulable first |
| 2 | The page (Table, Page, thin route, eslint a11y block) | PR 2 | Base = PR1; ships behind new `/ingresos` route — no existing surface changes (design §8) |
| 3 | Dashboard flip (`FilaIngreso` → button, threading, navigate) + PeriodoSelector shadowing + e2e | PR 3 | Base = PR2; only dashboard-touching step (design §8); 4-PR fallback per design §7 |

## PR 1 — Client plumbing + domain helpers (D-01/D-02/D-06) — additive, independently schedulable first

- [x] **T-01** api-client DTO aliases — `packages/api-client/src/index.ts`: `IngresosMesDto = S['IngresosMesResponse']` + nested `TransaccionIngresosMesDto` (type-only, no regen; D-06). Deps: —. RED: none (types). AC: aliases exported; `pnpm web typecheck` clean. ✅ (3ba7bcf2)
- [x] **T-02** web re-export — `apps/web/src/api/types.ts`: re-export 2 aliases + why-note (D-06; ADR-008). Deps: T-01. RED: none. AC: compiles; tsc clean. ✅ (3ba7bcf2)
- [x] **T-03** fetcher + guard — `apps/web/src/api/client.ts`: `fetchIngresosMes(periodo?)` + `esIngresosMesDto` (design §6: `esMontoStringValido` + `esFechaValida`, fail-closed; 400 → `{tag:'invalid'}`). **RED first**: `client.test.ts` +13 (200 ok; 400 invalid; 401; 5xx; network; non-JSON; `total` malformed; `monto` `"12.5"`; `fecha` malformed; `origen` non-string; `conteo` non-number; `transacciones` non-array; URL with/without periodo) → GREEN. Deps: T-01/T-02. AC: 13/13 green, suite 116→129. ✅ (11536c2)
- [x] **T-04** query hook — `apps/web/src/api/use-ingresos-mes.ts`: `useIngresosMes(periodo?)`, queryKey `['ingresos-mes', periodo ?? 'actual']` (D-06). **RED first**: `use-ingresos-mes.test.tsx` (3: URL with/without periodo; ApiError surfaces) → GREEN. Deps: T-03. AC: 3/3 green. ✅ (d44429b)
- [x] **T-05** `periodoActual()` — `apps/web/src/domain/periodo.ts` (D-01): thin zero-arg helper delegating to `periodoActualUTC(new Date())`; re-scope module docblock to normalizers. **RED first**: `domain/periodo.test.ts` +2 (`vi.setSystemTime` → current UTC month; equals `periodoActualUTC(now)`) → GREEN. Deps: —. AC: 2/2 green. ✅ (bf0ec76)
- [x] **T-06** `aFechaCorta` — `apps/web/src/domain/fecha.ts` (D-02): `aFechaCorta(fechaIso) = fechaIso.slice(0, 10)` (TZ-safe string surgery). **RED first**: `domain/fecha.test.ts` +3 (slices ISO; short passthrough; non-ISO passthrough) → GREEN. Deps: —. AC: 3/3 green. ✅ (9a01337)
- [x] **T-07** view-model — `apps/web/src/domain/ingresos-mes-view-model.ts`: `aIngresosMesViewModel(dto, periodo)` → `{mesLabel, conteoLabel (D-03), totalLabel, filas[]}` — labels/formatting only, `dto.transacciones` order verbatim (WDI-06; ADR-024). **RED first**: `domain/ingresos-mes-view-model.test.ts` (10: mesLabel from periodo; default current month; conteoLabel 1/2/0; totalLabel `+`; montoLabel `+`; fechaLabel; origen verbatim BCI/Manual; order verbatim day-3→day-15; empty month zeros; no re-sort) → GREEN. Deps: T-05/T-06. AC: 10/10 green. ✅ (6e7a00a)
- [x] **T-08** stale-docblock cleanup — `apps/web/src/domain/fecha.ts:4` + `apps/web/src/api/client.ts:457,462`: reword deleted-`aFechaLabel` references to the slice contract (D-02). Deps: T-06. RED: none (comments). AC: no stale refs; suites byte-unchanged. ✅ (8e4c518)

## PR 2 — The page (D-03/D-04/D-08/D-09/D-10) — serialized after PR1

- [x] **T-09** table component — `apps/web/src/components/IngresosMesTable.tsx` (D-04): semantic `<table>` + `<caption className="sr-only">Ingresos de {mes}</caption>` + 4 × `<th scope="col">` (Fecha, Descripción, Origen, Monto) + rows keyed by `tx.id`; Origen cell = `<Badge variant="secondary">` bank verbatim | `Manual` (MID-02); Monto = `formatearMontoConSigno(monto, '+')`; order verbatim (MID-01). **RED first**: `IngresosMesTable.test.tsx` (7: `table` role; `th scope="col"` ×4; caption accname; rows verbatim; Origen Badge BCI + Manual; `+`-monto; role/accname a11y per D-09 — no vitest-axe) → GREEN. Deps: T-07. AC: 7/7 green. ✅ (2984b884)
- [x] **T-10** page component — `apps/web/src/components/IngresosMesPage.tsx`: router-agnostic, `query` prop; query switch loading/error+retry (WDI-05); breadcrumb `nav aria-label="Ruta"` + back `Link to="/" search={{ periodo }}` "Volver al resumen" with D-10 LOCKED classes (24×24 CSS px + accname, WDI-01) — NOT BotonVolver (US-053 D-09); `h1 Ingresos`; `PeriodoSelector` (undefined → current month); `{conteoLabel} · {totalLabel}`; static note "Sin meta ni semáforo: los ingresos no participan del 50/30/20 como gasto"; `Empty` `Sin ingresos en {mes}` (WDI-04) | table (WDI-02); NO catalog prefetch (WDI-06). **RED first**: `IngresosMesPage.test.tsx` (15 per design §5: loading; error+retry renders; retry refetches; empty month `$0`/`0 ingresos`/`Sin ingresos en julio 2026`/NO table; empty month keeps PeriodoSelector operable; header all elements + note; deep link honours `?periodo=`; absent periodo → current month; back link preserves periodo; back control ≥24×24 + accname (D-10); onPeriodoChange updates URL; one `h1`; only interactive controls = nav/back/retry (WDI-06); table renders; table rows Origen Badge + `+`-montos in payload order, no re-sort) → GREEN. Deps: T-09. AC: 15/15 green; tsc clean. ✅ (2984b884)
- [x] **T-11** route wiring — `apps/web/src/routes/_authenticated/ingresos.tsx`: thin route; `validateSearch` via `normalizarPeriodo`; owns `useIngresosMes(periodo)` passing `query` prop (buckets.$bucket.tsx precedent); `onPeriodoChange` functional updater `search: (prev) => ({...prev, periodo})` (WDI-03; US-053 D-04). RED: route stays thin/untested (precedent) — verify `pnpm web typecheck` + e2e deep link (T-19). Deps: T-10. AC: tsc clean; deep link honored. ✅ (2984b884)
- [x] **T-12** a11y lint scope — `apps/web/eslint.config.js`: US-054 block — `IngresosMesPage.tsx`, `IngresosMesTable.tsx`, `routes/_authenticated/ingresos*.tsx` (D-08; WDI-07/WG5-12; `LeyendaGasto`/`ResumenScreen` already gated — not re-listed). RED: `pnpm web lint` flags new files → GREEN. Deps: T-10/T-11. AC: lint green. ✅ (2984b884)

## PR 3 — Dashboard flip + e2e (D-05) — serialized after PR2

- [x] **T-13** e2e fixtures — `apps/web/e2e/fixtures/api-stubs.ts`: `INGRESOS_MES_FIXTURE` (3 rows: BCI + Manual + 2nd bank; handler echoes `?periodo=`, zeroes for pinned empty month e.g. `2026-05`); `**/api/ingresos/mes*` route registered AFTER `**/api/resumen*` block with ordering comment (WDI-08 — distinct prefix, `*` doesn't cross `/`). RED: deep-link case red against broad stub → GREEN. Deps: T-11. AC: ingresos stub wins (WDI-08 scenario). ✅ (28ba8db)
- [x] **T-14** legend flip — `apps/web/src/components/LeyendaGasto.tsx`: `FilaIngreso` (:170-186) → `<button>` — `FilaClickeable` shell minus color dot (LOCKED classes :110; `{' '}` accname separators); `LeyendaGasto` gains `onSelectIngresos: () => void`; `filaParaItem` routes `'ingreso'`; interim comment removed (D-05; WG5-03/06). **RED first**: `LeyendaGasto.test.tsx` :77-86 rewritten (Ingresos row IS a button, no `%`, activation calls `onSelectIngresos`) → GREEN. Deps: —. AC: suite green; no interim comment. ✅ (28ba8db)
- [x] **T-15** screen threading — `apps/web/src/components/ResumenScreen.tsx`: thread `onSelectIngresos` (no destacar — bucket-less; D-05). **RED first**: `ResumenScreen.test.tsx` T14 (:479-513): add Ingresos to `controlesEsperados` focusable set, remove "never focusable" assertions (:496-503), rewrite test title (WG5-12) → GREEN. Deps: T-14. AC: suite green. ✅ (28ba8db)
- [x] **T-16** page threading — `apps/web/src/components/ResumenPage.tsx`: thread `onSelectIngresos` → ResumenScreen. **RED first**: `ResumenPage.test.tsx` +1 (onSelectIngresos threaded) → GREEN. Deps: T-15. AC: +1 green; tsc clean. ✅ (28ba8db)
- [x] **T-17** dashboard route navigation — `apps/web/src/routes/_authenticated/index.tsx`: `navigate({ to: '/ingresos', search: { periodo } })` — current `periodo` from `Route.useSearch()` (D-05; US-053 D-06 mirror). RED: e2e legend→page case (T-19 case 4). Deps: T-16. AC: e2e green; tsc clean. ✅ (28ba8db)
- [x] **T-18** PeriodoSelector shadowing — `apps/web/src/components/PeriodoSelector.tsx:43`: rename local `const periodoActual` → `mesActual` (D-01 §9 footgun). Deps: —. RED: none (behavior-neutral; existing suite = safety net). AC: tsc + suite green; no shadowing. ✅ (28ba8db)
- [x] **T-19** e2e suite — `apps/web/e2e/ingresos-mes.e2e.ts` (5: 1) deep link `?periodo=2026-07` header + table + Origen tags; 2) prev arrow → URL `2026-06`, stays on `/ingresos`, refetches (WDI-03); 3) empty month `2026-05` → `$0`, `0 ingresos`, Empty copy, arrows operable (WDI-04); 4) legend row → `/ingresos?periodo=` (CA-04, WG5-06); 5) tablet T2 header + table geometry at 880px — rendered boxes, never className (WDI-01/07, WG5-10 precedent)). Deps: T-13, T-17 (case 4). AC: 5/5 `pnpm web test:e2e` green. ✅ (28ba8db)

## Scheduling

- **Independently schedulable first**: PR1 (T-01..T-08) — additive, revertible, no page/dashboard dependency.
- **Serialized**: PR2 after PR1; PR3 after PR2 (page must exist before the legend flip; flip is the only dashboard-touching step — design §8).
- **Within PR3**: T-13 before T-19; T-14→T-15→T-16→T-17 chain; T-18 parallel.
- **D-07 (invalidation matrix)**: deliberate NON-change (YAGNI — no mutation co-mounts with `/ingresos`); do NOT touch `categorias-invalidacion.ts`/`use-ingesta.ts`/`use-eliminar-ingesta.ts`.
- **4-PR fallback** (if any slice must be ≤400, design §7): PR1 → plumbing (T-01..T-04) / domain helpers (T-05..T-08); PR2 → table (T-09) / page+route+lint (T-10..T-12).

## Ledger cross-check (design §4 file + §5 test ledgers)

All §4 files covered: PR1 T-01..T-08 (api-client aliases, types re-export, client guard/fetch, hook, periodo.ts, fecha.ts, view-model, docblock cleanup); PR2 T-09..T-12 (table, page, route, eslint); PR3 T-13..T-19 (stubs, LeyendaGasto, ResumenScreen/Page, index route, PeriodoSelector, e2e). All §5 suites covered: client +13 (T-03), hook 3 (T-04), periodo +2 (T-05), fecha +3 (T-06), view-model 10 (T-07), page 15 (T-10), table 7 (T-09), LeyendaGasto 1 rewritten (T-14), ResumenScreen 1 updated (T-15), ResumenPage +1 (T-16), e2e 5 (T-19) = **56 unit/integration + 5 e2e**. WDI-01..08 + WG5-03/06/12 all traced: WDI-01/03/05/06 (T-10/T-11), WDI-02/07 (T-09/T-12/T-19), WDI-04 (T-10/T-19), WDI-08 (T-13/T-19), WG5-03/06 (T-14/T-17), WG5-12 (T-14/T-15/T-12). **WARNINGS**: PR1 (~450) and PR2 (~500) exceed the 400-line budget — acknowledged additive-only (design §7).