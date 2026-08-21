# Verify Report: US-054 — Web: página Detalle MES-INGRESOS + drill-down real desde la leyenda

**Change**: `us-054-web-detalle-mes-ingresos`
**Verified at commit**: `f24c8452` (origin/main, 2026-08-20)
**Final merge**: PR #436 (feat/us-054-web-detalle-mes-ingresos-pr3)
**PRs**: #430 (PR1, merged) · #435 (PR2, merged) · #436 (PR3, merged)
**Worktree**: `/Users/jorge/dev/MoneyDiary.wt/us-050-mobile-dashboard`
**Verdict**: **PASS**

---

## Suite Results

| Suite | Command | Result |
|-------|---------|--------|
| Unit + integration | `pnpm web test --run` | **112 files, 1199 tests — all passed** |
| TypeScript | `pnpm web typecheck` (tsr generate + tsc -b) | **Clean — 0 errors** |
| ESLint | `pnpm web lint` | **0 errors; 2 warnings in pre-existing unrelated files** |
| e2e (Playwright) | `pnpm web test:e2e` | **66 passed, 63 skipped (pre-existing, unrelated to US-054)** |

**US-054 e2e cases (ingresos-mes.e2e.ts)**:
- Case 1 [escritorio] deep link header + table + Origen tags — PASSED
- Case 2 [escritorio] prev arrow → URL 2026-06, refetches (WDI-03, network proof) — PASSED
- Case 3 [escritorio] empty month 2026-05 → $0 / 0 ingresos / Empty copy / operable arrows — PASSED
- Case 4 [escritorio] legend Ingresos row → `/ingresos?periodo=2026-07` — PASSED
- Case 5 [tablet] T2 header + table geometry at 880px (rendered boxes, never className) — PASSED

The 5 cases run in `escritorio` (1-4) and `tablet` (5) only by design; the `movil` and `tablet` skips for cases 1-4 are intentional scoping per `test.skip` guards.

---

## Task Completion (19 / 19)

| Task | Status | SHA |
|------|--------|-----|
| T-01 api-client DTO aliases | ✅ | 3ba7bcf2 |
| T-02 web re-export | ✅ | 3ba7bcf2 |
| T-03 fetcher + guard | ✅ | 11536c2 |
| T-04 query hook | ✅ | d44429b |
| T-05 `periodoActual()` | ✅ | bf0ec76 |
| T-06 `aFechaCorta` | ✅ | 9a01337 |
| T-07 view-model | ✅ | 6e7a00a |
| T-08 stale-docblock cleanup | ✅ | 8e4c518 |
| T-09 table component | ✅ | 2984b884 |
| T-10 page component | ✅ | 2984b884 |
| T-11 route wiring | ✅ | 2984b884 |
| T-12 a11y lint scope | ✅ | 2984b884 |
| T-13 e2e fixtures | ✅ | 28ba8db |
| T-14 legend flip | ✅ | 28ba8db |
| T-15 screen threading | ✅ | 28ba8db |
| T-16 page threading | ✅ | 28ba8db |
| T-17 dashboard route navigation | ✅ | 28ba8db |
| T-18 PeriodoSelector shadowing | ✅ | 28ba8db |
| T-19 e2e suite | ✅ | 28ba8db |

All 19 tasks checked in `tasks.md`. All SHAs resolve to commits present in `origin/main` at `f24c8452`.

---

## Requirement Coverage Matrix

### WDI Requirements (new `/ingresos` page)

| Req | Description | Evidence (tests + code) | Status |
|-----|-------------|------------------------|--------|
| WDI-01 | Page structure: breadcrumb, month+arrows, "N ingresos" tag, positive total, "Sin meta ni semáforo" note; back control ≥24×24 CSS px + non-empty accname (D-10 LOCKED) | `IngresosMesPage.test.tsx` cases: header (L149), back link preserves periodo (L213), back link undefined (L225), back link accname (L240), one h1 (L262); e2e case 1 (header+nav) | PASS |
| WDI-02 | Semantic `<table>` with Fecha/Descripción/Origen/Monto; `<th scope>`; accessible name; row order verbatim (no re-sort) | `IngresosMesTable.test.tsx` (7 cases): table role, 4×th scope="col", caption accname, rows verbatim, Origen Badge BCI+Manual, +monto, 1 row per fila; page case (L277) payload order | PASS |
| WDI-03 | In-page month navigation; URL periodo updates; never leaves `/ingresos`; absent periodo → current month | `IngresosMesPage.test.tsx` cases: honours periodo (L172), falls back (L198 — JD-PR2 fix: September clock ≠ July default, genuinely falsifiable), onPeriodoChange (L252); e2e case 2 (URL + network proof) | PASS |
| WDI-04 | Empty month: header with $0 + "0 ingresos"; Empty copy "Sin ingresos en {mes}"; no table; arrows operable | `IngresosMesPage.test.tsx` cases: $0/0 ingresos (L113), empty copy (L124), PeriodoSelector operable (L135); e2e case 3 | PASS |
| WDI-05 | Loading, error, and retry states | `IngresosMesPage.test.tsx`: loading (L82), error+retry render (L89), retry refetches (L103) | PASS |
| WDI-06 | Thin client: labels only, no re-sort, no income mutation surface | `IngresosMesPage.test.tsx` case (L277) "no unexpected interactive controls"; view-model is pure passthrough (`ingresos-mes-view-model.ts`); no catalog prefetch; route typed via `normalizarPeriodo` | PASS |
| WDI-07 | a11y: new files in scoped `eslint-jsx-a11y` ERROR gate; table role/accname/scope asserted; T2 tablet geometry via rendered boxes, never className | `eslint.config.js` lines 179-181 (IngresosMesPage, IngresosMesTable, `ingresos*.tsx`); `IngresosMesTable.test.tsx` 7 cases; e2e case 5 geometry (boundingBox, tolerance ≤5px) | PASS |
| WDI-08 | e2e: `**/api/ingresos/mes*` stub registered after broader dashboard stubs; ingresos stub wins | `api-stubs.ts` INGRESOS_MES_FIXTURE + ordering comment; `ingresos-mes.e2e.ts` 5 cases | PASS |

### WG5 Modified Requirements

| Req | Description | Evidence | Status |
|-----|-------------|----------|--------|
| WG5-03 | Legend: 5 rows, fixed order; Ingresos row navigable (not inert) | `LeyendaGasto.test.tsx` case (L77-86): Ingresos IS a button, no %, activation calls `onSelectIngresos` | PASS |
| WG5-06 | Ingresos legend row clickable → `/ingresos` carrying periodo; interim comment removed | `LeyendaGasto.tsx` FilaIngreso is `<button>` + `onSelectIngresos`; interim comment gone; `index.tsx` `onSelectIngresos` navigates to `/ingresos`; e2e case 4 | PASS |
| WG5-12 | Touched files pass `eslint-jsx-a11y` error gate; Ingresos row keyboard-operable; T14 updated | `eslint.config.js` US-047 block includes `LeyendaGasto`/`ResumenScreen`; `ResumenScreen.test.tsx` T14 (L479-513) rewrites to include Ingresos in `controlesEsperados`; `pnpm web lint` = 0 errors | PASS |

### MID Requirements (backend, no delta — consumed as-is)

MID-01..06 were shipped by US-052 and are untouched. The web client consumes the contract verbatim:
- MID-01 (order authoritative): view-model passthrough confirmed (`ingresos-mes-view-model.ts:58` `dto.transacciones.map(aFilaViewModel)` — no sort).
- MID-02 (origen verbatim or 'Manual'): `origen` string passed through to Badge.
- MID-03 (no meta/porcentaje/estado): static note in page, no derived fields.
- MID-04 (absent periodo → current month): `periodoActual()` fallback in view-model.
- MID-05 (`+` sign on montos): `formatearMontoConSigno(monto, '+')` in view-model.

---

## Design Decisions Spot-Check

| Decision | Claim | Code Evidence | Status |
|----------|-------|---------------|--------|
| D-01 `periodoActual()` | Thin zero-arg helper in `domain/periodo.ts` delegating to `periodoActualUTC(new Date())` | `periodo.ts:28-30` — confirmed | PASS |
| D-02 `aFechaCorta` | `fechaIso.slice(0, 10)` — TZ-safe, guarded by `esFechaValida` upstream | `fecha.ts:34-36`; guard in `esTransaccionIngresosMesDto` at `client.ts:624` | PASS |
| D-03 conteoLabel | `conteo === 1 ? '1 ingreso' : \`${conteo} ingresos\``; `0` → plural | `ingresos-mes-view-model.ts:56` | PASS |
| D-04 Semantic table | `<table>` + `<caption className="sr-only">` + 4×`<th scope="col">` + rows keyed by `tx.id` | `IngresosMesTable.tsx:27-63` | PASS |
| D-05 WG5-06 flip | `onSelectIngresos: () => void` on `LeyendaGasto`; `FilaIngreso` is `<button>`; threaded through ResumenScreen → ResumenPage → index.tsx | `LeyendaGasto.tsx:41,183-218`; threading confirmed in ResumenScreen/Page/index | PASS |
| D-06 Client plumbing | Type aliases in `packages/api-client/src/index.ts`; re-export in `types.ts`; `esIngresosMesDto` + `fetchIngresosMes`; queryKey `['ingresos-mes', periodo ?? 'actual']` | All confirmed | PASS |
| D-07 Non-change | No `categorias-invalidacion.ts`/`use-ingesta.ts`/`use-eliminar-ingesta.ts` touches in US-054 commits | `git diff --name-only` confirms — these files not in PR1/PR2/PR3 commit sets | PASS |
| D-08 a11y lint gate | Scoped ESLint ERROR block for new US-054 files; `LeyendaGasto`/`ResumenScreen` already in US-047 block (not re-listed) | `eslint.config.js:167-181` | PASS |
| D-09 No vitest-axe | a11y proof via scoped eslint-jsx-a11y + role/scope/accname assertions in jsdom suites + Playwright T2 geometry | WDI-07 spec updated to match; `pnpm web lint` 0 errors; table tests use `getByRole('table')` etc. | PASS |
| D-10 Back control LOCKED | `Link to="/" search={{ periodo }}` "Volver al resumen"; `px-2 py-1` + `focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800`; NOT BotonVolver | `IngresosMesPage.tsx:55-61`; back link test at L213/L225/L240 | PASS |

---

## Scope Verification

**Zero `apps/api` changes**: confirmed — `git log --name-only` for US-054 PRs shows no `apps/api/` files.

**`packages/api-client` changes**: limited to T-01 type aliases (`IngresosMesDto` + `TransaccionIngresosMesDto`) at `packages/api-client/src/index.ts:51-55`. Type-only, no codegen run (no regen — D-06).

**No dashboard behavior changes beyond D-05 flip**: `DistribucionPie.tsx`, `IngresoCard`, `ResumenAnual`, and pie wedge behavior are untouched by US-054 commits.

**No invalidation matrix changes**: `categorias-invalidacion.ts`, `use-ingesta.ts`, `use-eliminar-ingesta.ts` — not modified (D-07 deliberate NON-change confirmed).

---

## Findings

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
None.

### INFO (accepted debts, not findings)
1. **await-render convention**: `IngresosMesPage.test.tsx` uses `async`/`await` + `findBy*` throughout — consistent with repo convention for async renders. No blocking issue.
2. **Pre-existing lint warnings**: 2 warnings from `EliminarIngestaControl.tsx:128` and `ReclasificarCategoriaControl.tsx:224` (`jsx-a11y/no-noninteractive-element-interactions`) — pre-existing, not in US-054 scope, documented in task ledger.
3. **Tablet geometry tolerance**: e2e case 5 uses `≤5px` tolerance for breadcrumb/back-control vertical alignment at 880px (4px observed in practice). Documented in apply-progress as accepted.
4. **GrupoMovimientos.tsx raw-ISO display**: The US-053 twin bucket page renders raw ISO timestamps without `aFechaCorta` — registered as a separate display-consistency follow-up (D-02 migration note). Out of scope for US-054.
5. **JD-PR2 vacuous-test fix**: Case 9 (undefined periodo fallback) was genuinely vacuous in the first apply because `renderPagina`'s destructuring default swallowed `undefined`. Fixed in JD round 2 — now uses `renderConRouter` directly with September 2026 clock (distinct from the July default), making the test falsifiable. Evidence: test at `IngresosMesPage.test.tsx:198-210`.
6. **JD-PR3 e2e fixes**: Case 2 gained `waitForResponse` armed before the click (network-level refetch proof); case 1 gained explicit assertions for all 3 Origen badges (BCI, Manual, BancoEstado); stub had a phantom `periodo` field removed; LIFO comment was rewritten truthfully.

---

## Behavioral Compliance Matrix

| Scenario | Type | Evidence | Result |
|----------|------|----------|--------|
| Header renders all CA-01 elements for a real month | jsdom | `IngresosMesPage.test.tsx:149` | PASS |
| T2 tablet header geometry (rendered boxes) | Playwright | `ingresos-mes.e2e.ts:145` [tablet] | PASS |
| Table renders 4 columns with Origen tag and signed Monto | jsdom | `IngresosMesTable.test.tsx:78,94` | PASS |
| Table = real semantic table with scoped headers + accessible name | jsdom | `IngresosMesTable.test.tsx:38,43,59` | PASS |
| Row order = payload order (no re-sort) | jsdom | `IngresosMesTable.test.tsx:67` | PASS |
| Arrows change month in-page, update URL | jsdom+Playwright | `IngresosMesPage.test.tsx:252`, e2e case 2 | PASS |
| Deep link honours periodo; absent → current month | jsdom | `IngresosMesPage.test.tsx:172,198` | PASS |
| Empty month: zeros + Empty copy + arrows operable | jsdom+Playwright | `IngresosMesPage.test.tsx:113,124,135`, e2e case 3 | PASS |
| Error state with retry | jsdom | `IngresosMesPage.test.tsx:89,103` | PASS |
| View-model: labels only, order verbatim, no re-sort | jsdom | `ingresos-mes-view-model.test.ts` (10 cases) | PASS |
| No edit/reclassify affordance on page | jsdom | `IngresosMesPage.test.tsx:277` interactive controls assertion | PASS |
| Scoped lint gate clean on new files | lint | `pnpm web lint` → 0 errors | PASS |
| Table accessible contract (role, th scope, caption) | jsdom | `IngresosMesTable.test.tsx:38,43,59,103` | PASS |
| T2 tablet table geometry | Playwright | `ingresos-mes.e2e.ts:145` [tablet] | PASS |
| Ingresos stub wins over broader stub | e2e fixture | `api-stubs.ts` ordering; e2e case 1 | PASS |
| Ingresos legend row IS a button, no %, activates onSelectIngresos | jsdom | `LeyendaGasto.test.tsx` rewritten case | PASS |
| Legend row navigates to /ingresos?periodo= | Playwright | `ingresos-mes.e2e.ts:120` [escritorio] | PASS |
| WG5-12 keyboard: Ingresos in focusable set | jsdom | `ResumenScreen.test.tsx` T14 | PASS |

---

## Archive Readiness

- All 19 tasks: checked ✅
- Suite: 1199/1199 unit + 66/66 e2e = no failures
- TypeScript: clean
- ESLint: 0 errors
- Scope: web-only, no backend changes, no dashboard regressions
- JD verdicts: PR2 APPROVED (3 rounds, #872) · PR3 APPROVED (2 rounds, #875)
- Issue #288: CLOSED

**Verdict: PASS — ready for `sdd-archive`.**
