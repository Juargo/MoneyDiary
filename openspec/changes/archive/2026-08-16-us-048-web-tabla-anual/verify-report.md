# Verification Report: US-048 — Web annual table redesign, navigable mini-charts (#282)

**Change:** `us-048-web-tabla-anual`
**Mode:** Full artifacts (proposal + spec + design + tasks + apply-progress), verified on `main`
**Verified against:** `origin/main` @ `889ccea` (all 5 PRs merged: #378, #379, #380, #381, #384)
**Date:** 2026-08-16

## Verdict: **PASS**

CRITICAL: 0 · WARNING: 0 · SUGGESTION: 1

---

## 1. Runtime evidence (executed, not inferred)

| Command | Result |
|---|---|
| `pnpm web test` | **103 files / 1072 tests passed**, 0 failed |
| `pnpm web typecheck` (`tsr generate && tsc -b`) | Clean, 0 errors |
| `pnpm exec eslint .` (apps/web) | **0 errors**, 2 warnings — both pre-existing baseline (`EliminarIngestaControl.tsx:128`, `ReclasificarCategoriaControl.tsx:223`), zero new |
| `pnpm --filter @moneydiary/web exec playwright test` (full suite) | **55 passed, 41 skipped** (viewport-scoped `test.skip`), **0 failed** |
| `pnpm --filter @moneydiary/web exec playwright test annual-grid` | **4/4 passed** (E-01..E-04) |

Per-file test counts (`rg -c "^\s*(it|test)\("`):

| File | Count |
|---|---|
| `MiniSemaforoTag.test.tsx` | 8 |
| `ResumenAnual.test.tsx` | 25 |
| `ResumenScreen.test.tsx` | 16 |
| `ResumenPage.test.tsx` | 5 |
| `annual-grid.e2e.ts` | 4 |
| **Total** | **58** |

**Known accepted drift, confirmed recorded, not flagged as new:** design.md §6.8's ledger table (line 650) still reads `57`; the real total is `58` because of the un-ledgered `WTA-02` same-cell coexistence test added post-judgment in PR2 during Slice B. This is disclosed in `tasks.md` C2a-6 ("25/25 … the un-ledgered WTA-02 … added post-judgment in PR2") and X4 ("real counts … total 58, not 57 … a pre-existing, already-acknowledged one-test drift in that table, not a new finding"), and in the apply-progress engram observation (#745). Verified present in both places — confirmed recorded, per instructions.

## 2. WTA-01..06 — requirement-by-requirement, code + test evidence

| Req | Satisfying code | Satisfying test(s) | Runtime evidence |
|---|---|---|---|
| **WTA-01** (4-item ring per mini) | `ResumenAnual.tsx:145` — `calcularDistribucionGasto(mes.buckets)`, no `BUCKETS_5030` import (`rg` confirms absent) | `N-00` (inverted 3→4 pin, nonzero `SinCategoria` fixture, fill-sequence assertion) | `ResumenAnual.test.tsx` green |
| **WTA-02** (selected marker coexists with today marker) | `ResumenAnual.tsx:119` `esSeleccionado={mes.periodo === periodoSeleccionado}`; `mes-seleccionado-marker` testid at :162; `esActual`'s `✓`/`aria-current` untouched | `N-01`, `N-02`, `N-10` (disabled-cell coexistence), plus post-judgment WTA-02 same-cell test | `ResumenAnual.test.tsx` green; real-geometry `E-04` (≥64×64 box, exactly one marker) green |
| **WTA-03** (data-month nav survives restructure, verification-only) | `MesCelda` `onClick`→`onSelectPeriodo` plumbing unchanged | Pre-existing clickable-month pin, re-verified byte-identical post-restructure (C2a-1/C2a-6) | `ResumenAnual.test.tsx` green; `E-02` (URL change + window-sentinel no-reload + marker follows) green |
| **WTA-04** (disabled-cell semantics survive restructure, verification-only) | `div[role=button][aria-disabled=true]`, no `tabIndex`/`onClick`, unchanged | Pre-existing disabled-month pin, re-verified byte-identical (C2a-1/C2a-6); `N-04`, `N-09` | `ResumenAnual.test.tsx` green |
| **WTA-05** (independently clickable semáforo tag, every month, sibling not nested, ≥24×24 real geometry) | `ResumenAnual.tsx:173-218` — sibling `<span class="absolute top-1 right-1">` wraps `MiniSemaforoTag`, outside the disabled branch's `opacity-60`; `MiniSemaforoTag.tsx` `h-7 w-7` (28×28) | `N-03`, `N-04`, `N-05`, `N-06`, `N-08`, `N-09`; `M-01..M-08` | `E-01` (all 12 links, real `boundingBox()` ≥24×24 at 360px, never className) green |
| **WTA-06** (header + caption literal copy) | `ResumenAnual.tsx:70` `Año {anio} — vista macro por mes`; `:127` caption template literal | `N-07`; title/region-name tests (B7 blast radius, 5 assertions across 3 files) | Confirmed byte-identical in source; `rg "Resumen Anual 2026" apps/web/src` → 0 matches (verified) |

## 3. CA-01..CA-06 (issue #282) mapped to WTA + evidence

| CA | Mapped WTA | Evidence |
|---|---|---|
| CA-01 | WTA-01 | PR1/#378, `N-00` green |
| CA-02 | WTA-02 | PR2/#379 (`N-01`/`N-02`), PR5 (`E-04`) green |
| CA-03 (verification-only) | WTA-03 | PR4/#381 regression re-verification + PR5 `E-02` green |
| CA-04 (verification-only) | WTA-04 | PR4/#381 (`N-04`/`N-09`) green |
| CA-05 | WTA-05 | PR4/#381 (`N-03`/`N-05`/`N-06`/`N-08`), PR5 (`E-01`/`E-03`) green |
| CA-06 | WTA-06 | PR2/#379 (`N-07`) green |

`proposal.md`'s own Success Criteria section: all 9 boxes checked `[x]`, each annotated with the proving PR/test — confirmed present in the file (read directly, §"Success Criteria").

## 4. Task completeness

`tasks.md`: every task across Slices A (A1-A6), B (B1-B11), C1 (C1-1..C1-5), C2a (C2a-1..C2a-9), C2b (C2b-1..C2b-5), and cross-cutting (X1-X4) is `[x]`. C2a-6 correctly documents the 25/25 count (not 24). No unchecked task found.

Apply-progress (engram #745) confirms 5 batches, one per PR, with runtime evidence per batch, consistent with the file-level checklist state.

## 5. Cross-cutting checks

- **Zero diff outside `apps/web` + `openspec` for the change's merge range** — verified: `git diff --stat f0cd13b..889ccea -- . ':!apps/web' ':!openspec'` is empty (`f0cd13b` = merge commit of PR #377, the archive of US-047, immediately preceding US-048's first commit `8036d39`).
- **Merged PR set** — confirmed via `gh pr list --state merged --search "us-048"`: #378 (PR1, minis), #379 (PR2, marker/caption/copy), #380 (PR3, MiniSemaforoTag), #381 (PR4, restructure+wiring), #384 (PR5, e2e) — all `baseRefName: main`, all merged.
- **`ResumenScreen`/main-chart T14 unregressed** — `ResumenScreen.test.tsx:613` T14 test still present and green; its `getByRole('link', { name: /Semáforo: Verde/ })` query (main-chart `SemaforoTag`) remains unambiguous because the 12 mini tags are named `Semáforo de {mes}: {estado}` (D-07), never colliding with `Semáforo: Verde` — verified by reading the source and by the full green vitest run.
- **Known accepted deviations, confirmed recorded:**
  - Grid stays `2/3/4`-column vs the wireframe's 6-per-row — recorded in `proposal.md` Out of Scope / R-6, `design.md` §2.3/§11, spec preamble `WDS-04` row.
  - `WDS-04` unratified provenance disclosed — spec preamble states it is defined only in the un-archived `web-dashboard-redesign-mobile` change, its own verify-report marking the deviation ⚠️ PARTIAL/SUGGESTION, not a ratified requirement. Confirmed disclosed in spec.md, design.md §11 item 5, and proposal.md.
  - Ingresos-chevron — no open item found referencing an "Ingresos-chevron" concern within this change's artifacts; treated as N/A to this change's scope (not a WTA-* concern; not present in proposal/design/tasks). No action taken.
  - Ledger 57→58 — confirmed recorded in tasks.md X4 and design.md's known-stale §6.8 table; see §1 above.

## 6. Follow-ups tracked

- **#382** (OPEN) — `chore(web): SemaforoBadge is a dead component after US-048`. Confirmed exists, references US-048/D-16, `type:chore`.
- **#383** (OPEN) — `chore(web): calcularDistribucionGasto's bucketsIncluidos param is now default-only in production`. Confirmed exists, references US-048/D-16, `type:chore`.
- **`web-dashboard-redesign-mobile`** archive backlog note — `design.md` §11 item 5 explicitly records archiving/promoting that un-archived change (to give `WDS-04` a canonical, ratified home) as backlog for a future change. Confirmed present.
- **US-049** — proposal.md Dependencies section confirms US-049 fills `/semaforo` content; this change adds callers only. With PR4/#381 + PR5/#384 merged, the annual grid now contributes 12 new semáforo entry points to `/semaforo` (plus the existing 1 from the main-chart `SemaforoTag`) — **13 entry points** total, consistent with the task brief.

## Findings

**CRITICAL:** None.

**WARNING:** None.

**SUGGESTION:**
1. `design.md` §6.8's test-ledger table (line 650, "Total: 34/16/23/57") is stale — real total is 58 (see §1). This is already acknowledged in `tasks.md` X4 and is out of scope to fix per the tasks.md preamble ("Do not reopen D-01..D-16 or WTA-01..06 — they are APPROVED"). No action required before archive; noted for completeness only.

## Issue #282 status

Confirmed **CLOSED** via `gh issue view 282`.

---

**Conclusion:** All spec requirements (WTA-01..06) have passing, non-trivial covering tests at both jsdom and real-viewport (Playwright) layers where required. All tasks are complete. All success criteria in the proposal are checked and evidenced. Cross-cutting scope (zero diff outside apps/web+openspec) holds. Registered debt is tracked with live GitHub issues. No regressions found in adjacent surfaces (T14, dashboard-donut, tablet-grid all green with zero assertion diff). **Ready for `sdd-archive`.**
