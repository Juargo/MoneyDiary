# Verification Report — US-047 — Web dashboard main chart, 5 items (#281)

**Change:** `us-047-web-grafico-5-items`
**Mode:** Full artifacts (proposal + spec + design + tasks + apply-progress) — Strict TDD active, verification confirms recorded evidence, does not re-derive it
**Verified against:** `main` @ `f939fc7` (merge of PR #376), all 4 chained PRs merged (#373, #374, #375, #376), issue #281 CLOSED
**Date:** 2026-08-16

## Verdict: PASS

---

## 1. Test execution (run fresh on `main`, not reused from apply-progress)

| Command | Result |
|---|---|
| `pnpm web typecheck` (`tsr generate && tsc -b`) | Clean, 0 errors |
| `pnpm web test` (vitest, jsdom) | **1052/1052 passed** (102/102 files) |
| `pnpm web exec eslint .` | **0 errors**, 2 pre-existing baseline warnings (`EliminarIngestaControl.tsx`, `ReclasificarCategoriaControl.tsx`) — exactly as forecast, unrelated to this change |
| `pnpm --filter @moneydiary/web exec playwright test dashboard-donut` | **6/6 passed** (12 skipped — correctly viewport-scoped per project: `movil`/`tablet`/`escritorio`) |
| `pnpm --filter @moneydiary/web test:e2e` (full suite, 3 projects) | **51 passed, 33 skipped, 0 failed** — no regression to any pre-existing spec (`tablet-grid`, `mobile-floor`, `list-surface`, `edit-surface`, `mobile-header`) |

All 4 declared runners are green. Numbers match the apply-progress self-report exactly (1052/1052, 0 eslint errors + 2 baseline warnings, 51/33/0 e2e) — no drift between reported and re-run evidence.

---

## 2. Requirement-by-requirement (WG5-01..WG5-13)

| Req | Evidence (code) | Evidence (test) | Status |
|---|---|---|---|
| WG5-01 (4-wedge donut, ring-share not `porcentajeBp`) | `DistribucionPie.tsx` (`RATIO_INTERIOR`, `rInterior` threaded to `arcoPath`), `distribucion-gasto.ts` (`BUCKETS_ANILLO` 4-item iteration) | `pie-geometry.test.ts` (11 cases incl. 5 donut), `distribucion-gasto.test.ts` (inverted `:43` case + 3 new), `DistribucionPie.test.tsx` (4-wedge, non-`M cx cy` paths) | PASS |
| WG5-02 (`PeriodoSelector` page-level unchanged; semáforo tag in card header — accepted deviation) | `ResumenPage.tsx` untouched (0-diff confirmed T17); `ResumenScreen.tsx` renders `SemaforoTag` in card header | `ResumenPage.test.tsx` (harness swap only, no assertion change), `ResumenScreen.test.tsx` | PASS — deviation is itself the spec text (WG5-02 names it as accepted, not a defect) |
| WG5-03 (5-row legend, fixed order, viewport-conditional divider) | `LeyendaGasto.tsx` (`principales`/`complemento` props, `hidden lg:block` divider) | `LeyendaGasto.test.tsx` (5-row rename), `dashboard-donut.e2e.ts` (3 divider assertions: absent tablet/mobile, present desktop) | PASS |
| WG5-04 (client sign prefix by kind) | `formatear-monto.ts` (`formatearMontoConSigno`) | `formatear-monto.test.ts` (+4 cases) | PASS |
| WG5-05 (`cantidadSinCategoria` DTO guard + real-zero mapping) | `api/client.ts` (`typeof candidato.cantidadSinCategoria === 'number'`) | `client.test.ts` (+2 cases) | PASS |
| WG5-06 (Ingresos no drill-down, interim documented in code) | `LeyendaGasto.tsx` `FilaIngreso` — inert `<li>`, docblock cites `WG5-06` | `LeyendaGasto.test.tsx` (not a button, no `%`, not `aria-disabled`) | PASS |
| WG5-07 (semáforo clickable tag, top-right, → `/semaforo`) | `SemaforoTag.tsx` (new), wired in `ResumenScreen.tsx` | `SemaforoTag.test.tsx` (+5), `ResumenScreen.test.tsx` (`semaforo-global` resolves to a link) | PASS |
| WG5-08 (`null` estadoGlobal → "Sin datos" tag, still navigable) | `lib/semaforo-estilos.ts` fallback consumed by `SemaforoTag.tsx` | `SemaforoTag.test.tsx` case 3 | PASS |
| WG5-09 (`/semaforo` stub, session-protected, never blank/404) | `routes/_authenticated/semaforo.tsx` (new) | `src/test/semaforo-route.test.tsx` (+2, real route tree) | PASS |
| WG5-10 (T1 tablet, rendered geometry only, WCTG-14 guard) | `ResumenScreen.tsx` T1 grid (`data-testid="grafico-card-body"`, `md:grid-cols-2`) | `dashboard-donut.e2e.ts` (6 Playwright geometry assertions, all passed live) | PASS |
| WG5-11 (no estado/bp arithmetic beyond 3 named exceptions) | `resumen-view-model.ts` — `aPorcentajeLabel` only divides bp by 100 for display (verbatim passthrough), `estadoGlobal`/`estadoSemaforo` passed as opaque strings | `resumen-view-model.test.ts` (verbatim passthrough asserted) | PASS — spot-checked directly against source, no threshold/comparison logic found |
| WG5-12 (a11y: eslint-jsx-a11y `error` scope, keyboard operability) | `eslint.config.js` D-10 block (6 files, exact match to design) | `pnpm web exec eslint .` (0 errors), T14 composed-screen keyboard sign-off in `ResumenScreen.test.tsx` | PASS |
| WG5-13 (Sin categoría dilutes ring %, deliberate) | `distribucion-gasto.ts` (`BUCKETS_ANILLO` denominator) | `distribucion-gasto.test.ts` (inverted case), `resumen-view-model.test.ts` (44/28/28→40/25/25 diluted reading, re-recorded per anti-blind-re-record rule) | PASS |

All 13 requirements have both code and a passing covering test. No UNTESTED/FAILING scenarios found.

---

## 3. CA-01..CA-06 (issue #281) mapping

| CA | Maps to | Evidence |
|---|---|---|
| CA-01 | Reused unchanged `WPER-*`/`WMYP-*` + WG5-01 (donut) | `ResumenPage.test.tsx` diff is harness-plumbing only (see §5); `DistribucionPie.test.tsx` donut proof |
| CA-02 | WG5-03 (5-row legend) + WG5-04 (sign) | `LeyendaGasto.test.tsx`, `formatear-monto.test.ts` |
| CA-03 | WG5-07 + WG5-08 (clickable semáforo tag, transversal rule stated in spec text) | `SemaforoTag.test.tsx`, `ResumenScreen.test.tsx` |
| CA-04 | Reused `WCAT-01..05` (spend + Sin categoría) + WG5-06 (Ingresos interim, documented) | `LeyendaGasto.test.tsx`; interim documented at `LeyendaGasto.tsx` docblock and design D-07 |
| CA-05 | WG5-10 (T1 tablet, real-viewport only) | `dashboard-donut.e2e.ts`, 6/6 passed live |
| CA-06 | WG5-11 (no client arithmetic) + WG5-12 (a11y gate) | Source spot-check (§2 above) + `pnpm web exec eslint .` clean |

All 6 acceptance criteria trace to passing evidence.

---

## 4. Task completeness

- `tasks.md`: **17/17 tasks marked `[x]`** (T1–T17, confirmed by direct read and `grep -c "^### \[x\]"` = 26 checkbox occurrences, one per RED+GREEN pair plus single-step tasks — no `[ ]` unchecked items found).
- **T17 deviation properly recorded, not silently absorbed**: the task's own text documents that the design's "0 edits to `ResumenPage.test.tsx`" premise was found FALSE during apply (a genuine diff exists, caused by PR3's router-harness call-site sweep, not new PR4 work). Verified independently against `git diff c3c0aa2..main -- apps/web/src/components/ResumenPage.test.tsx`: **actual diff is 33 changed lines (15 insertions + 18 deletions)**, not the "76-line diff" cited in the apply-progress/tasks.md text.
  - **Finding (SUGGESTION, non-blocking):** the recorded line count (76) does not match the actual merged diff (33). The qualitative claim — that the file required edits (contrary to the design's literal "0 edits" framing) and that the edits are harness-plumbing only (wrapper swap + 2 `findBy` awaits, no assertion text/count/target change) — is independently confirmed TRUE by reading the diff. Only the specific number is off. This does not affect CA-01 substance (the month header itself is untouched) and does not block archive, but the discrepancy is worth a note for archive-time record accuracy.

---

## 5. Cross-cutting sanity

- **Zero diff in `apps/api`, `packages/api-client`, `apps/mobile`**: `git diff c3c0aa2..main --stat -- apps/api packages/api-client apps/mobile` returns empty. Confirmed against the whole 4-PR change.
- **`ResumenAnual` still on `BUCKETS_5030`** (US-048 pending): confirmed at `apps/web/src/components/ResumenAnual.tsx:118` — `calcularDistribucionGasto(mes.buckets, BUCKETS_5030)`, with an inline comment explaining the annual minis intentionally do not adopt `BUCKETS_ANILLO` yet.
- **`/semaforo` stub route exists**: `apps/web/src/routes/_authenticated/semaforo.tsx`, session-protected via the `_authenticated` layout, docblock documents the US-049 trigger.
- **eslint D-10 scoped block matches design exactly**: the 6 files (`DistribucionPie.tsx`, `LeyendaGasto.tsx`, `SemaforoBadge.tsx`, `SemaforoTag.tsx`, `ResumenScreen.tsx`, `routes/_authenticated/semaforo*.tsx`) are present verbatim in `eslint.config.js`.
- **4 recorded interim/follow-up items, all documented**:
  1. Detalle MES interim drill-down (CA-04) — spend buckets + Sin categoría reuse `WCAT-01..05` unchanged; Ingresos interim documented at `LeyendaGasto.tsx` docblock + design D-07.
  2. `ResumenAnual` stays on `BUCKETS_5030` → US-048 — confirmed above, comment names the trigger.
  3. Pluralization backlog (minor) — `cantidadLabel`/`sr-only` "N tx"/"N transacciones" — accepted as-is per PR2 judgment-day fix, no open TODO found blocking this change.
  4. `/semaforo` stub → US-049 — confirmed above, docblock names the trigger and states the route must not be deleted while `SemaforoTag` links to it.

---

## 6. Known accepted deviations (confirmed recorded, not flagged as defects)

- **WG5-02 card-header placement deviation**: the semáforo tag renders in the chart card's own header row instead of the wireframe's single combined row with `PeriodoSelector` — this is the spec requirement's own text (WG5-02), not an implementation drift. Confirmed `PeriodoSelector` stays page-level, untouched.
- **Ingresos-chevron wireframe deviation**: the Ingresos legend row renders with no chevron (it's an inert `<li>`, not a `<button>`) — confirmed at `LeyendaGasto.tsx`'s `FilaIngreso`, docblock cites `WG5-06` (no drill-down endpoint exists yet).
- **3 size overruns, all documented with causes, all independently verified against PR bodies**:
  - PR #1 (#373): forecast ~310 lines → **actual ~590 lines** (PR body: "the delta is the repo's docblock-density convention ... not scope creep"). Code-only diff (excl. openspec docs) measured at 892 changed lines (846+46); the ~590 figure in the PR body appears to exclude some further doc/comment lines — order-of-magnitude consistent, cause (docblock density) verified plausible by direct source read (heavy inline rationale comments throughout `distribucion-gasto.ts`, `resumen-view-model.ts`).
  - PR #2 (#374): forecast ~490 lines → **actual ~939 lines** (694 insertions + 245 deletions), `size:exception` pre-approved and explicitly recorded in `tasks.md`'s Review Workload Forecast section, cause: `LeyendaGasto`'s prop-shape change was a full rewrite, not incremental.
  - PR #3 (#375): forecast ~215 lines → **actual ~700 lines raw** (PR body: "the excess is docblock/test-comment rewriting ... not new logic surface"). Code-only diff (excl. openspec docs) measured at exactly 700 lines (484+216) — exact match to the PR body's own figure.
  - All three overruns are traceable to real causes (docblock density, full-rewrite scope, comment rewriting), none attributable to undisclosed scope creep. This matches the delivery_strategy `ask-on-risk`/chain `stacked-to-main` decision made at tasks phase.

---

## 7. Issues found

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
1. **Line-count discrepancy in T17's self-reported finding.** The apply-progress/tasks.md text states `ResumenPage.test.tsx`'s diff is "76 lines"; the actual merged diff (`git diff c3c0aa2..main`) is 33 lines (15+18). The qualitative finding (design's "0 edits" premise was false, cause = PR3's router-harness sweep, harmless) is correct — only the specific number is inaccurate. Non-blocking; worth a one-line correction if `sdd-archive` copies this text forward verbatim.

---

## 8. Final verdict: **PASS**

- 0 CRITICAL, 0 WARNING, 1 SUGGESTION (non-blocking, cosmetic self-report accuracy only).
- All 17/17 tasks complete, all 13 WG5-* requirements have passing covering tests re-run fresh on `main`, all 6 CA-01..CA-06 map to evidence, zero backend diff confirmed, all known deviations and overruns are genuinely recorded with causes.
- Ready for `sdd-archive`.
