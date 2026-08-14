# Archive Report — US-042 Web Configuración, Perfil Section

**Change**: `us-042-web-configuracion-perfil` (issue #276)  
**Date archived**: 2026-08-13  
**Status**: CLOSED, deployed to production  
**Verification verdict**: PASS — 13/13 WCFG requirements satisfied, 0 CRITICAL

## What Shipped

Frontend-only change (zero `apps/api` / `apps/mobile` changes). The web app gains a session-protected route `/configuracion` with a "Perfil" section where logged-in users can:
- Read and edit their `nombre` and `email`
- Rotate their password (authorized by the current password)
- Link/unlink their Google account

Consuming two already-deployed API contracts:
- `perfil-usuario` (PERF040-*)
- `vinculacion-google` (VINC041-*)

## PR Chain and Merge

| Slice | PR | Base | Size | Status |
|---|---|---|---|---|
| #1a | #324 | `feat/us-042-web-configuracion-perfir` (tracker branch) | 670 lines | Merged to main |
| #1b | #325 | PR #1a's branch | 1953 lines (`size:exception`) | Merged to main |
| #2 | #326 | PR #1b's branch | 1581 lines (`size:exception`, 925 test lines) | Merged to main |

**Integration**: PR #327 merged the tracker feature branch to `main`, commit `eff22cb`.  
**Production deployment**: Code live on `https://app.moneydiary.cl` (Vercel auto-deploy on `main`).

## Verification Summary

**Verified by**: `sdd-verify` (re-verification pass, 2026-08-13 22:03:59 UTC)  
**Against**: `feat/us-042-pr2-google-layout` HEAD `de1fc19`  
**Verdict**: PASS — 0 CRITICAL, 1 WARNING (process debt, non-blocking)

### Gates (all passed)
- `pnpm web typecheck` — clean
- `pnpm web test` — 710/710 tests passing (76 test files)
- `pnpm web lint` — 0 errors (2 pre-existing baseline warnings)
- `apps/api` / `apps/mobile` diffs — 0 lines changed
- Tasks — 42/42 checked, 0 unchecked

### Requirements Matrix
All 13 WCFG requirements fully satisfied:

| Req | Evidence |
|---|---|
| WCFG-01 | Route session-protected under `_authenticated` layout; `Configuración` nav item + sidebar-footer icon link both reach `/configuracion` |
| WCFG-02 | `ConfiguracionPage.tsx` renders heading → tabs → `PerfilForm` → `GoogleVinculoSection`; Google block's linked/not-linked states driven by `me.googleVinculado` |
| WCFG-03 | `['auth-me']` cache primed once per landing by `beforeLoad`; invalidated on profile save + unlink success; NOT on password-only success or link (cache discarded by full-page navigation) |
| WCFG-04 | `esMeDto` guard hardens with `nombre: string` + `googleVinculado: boolean` validation, returning `{tag:'parse'}` on failure |
| WCFG-05 | `Guardar cambios` diffs form against `me`, calls only `PATCH /api/perfil` and/or `PATCH /api/perfil/password` as needed; no-change shows generic message |
| WCFG-06 | Profile call gates password call; profile failure aborts the sequence (account protection — no password rotation on rejected email) |
| WCFG-07 | Partial failure (profile saved, password failed) shows specific message, re-derives fields from cache, retains password inputs for retry |
| WCFG-08 | `Password actual` required when email differs (client-side + server-side); link/unlink dialogs require password confirmation (two-layer guard: native `required` + JS gate) |
| WCFG-09 | Closed, verbatim error/success copy table with 11 rows; no server-supplied strings; demo copy provided |
| WCFG-10 | `?google=` validated to literal `'vinculado'` \| `'error'`, URL rewritten on mount, message survives the rewrite, does not reappear on refresh |
| WCFG-11 | Fluid grid (fixed sidebar + flexible panel) reproduces T1 proportions; stacks below `lg` breakpoint; no new `layout.ts` constant |
| WCFG-12 | `eslint-plugin-jsx-a11y` scoped to `error` on new files + route file (`warn` elsewhere); all inputs labeled and reachable via `getByLabelText` |
| WCFG-13 | Both `pnpm web typecheck` and `pnpm web test` gates pass |

### Findings

**CRITICAL-1** (now closed): WCFG-08's second scenario (dialogs block confirm on empty password) was unimplemented at first verification. Fixed in `783fdcb` with two-layer guard (`required` affordance + JS gate in `enviar()`), matching the pattern already used by `PerfilForm`. Re-verified with two new non-vacuous tests.

**WARNING-1** (now closed): WCFG-03's spec text was overstated vs. the code's actual behavior. Narrowed in `de1fc19` to name four precise consequences, all verified accurate against implementation. Link-exclusion from invalidation now has a dedicated test.

**WARNING-2** (non-blocking process debt): `sdd-tasks` forecast underestimated all three slices by 1.7–3.1x due to including production code in the budget while Strict TDD adds ~1.4x test lines. Registered at engram #627 for future planning.

**SUGGESTION-1** (non-blocking, documentation lag): `mensajes.ts` gained a Google-origin `403 PERFIL_RECHAZADO` row during apply (task 5.5), but `design.md`'s Q8b table was not updated to reflect it. Code and tests are complete and correct; this is a documentation follow-up only.

## Carried-Forward Debt

Four items from this change require follow-up work (all non-blocking):

1. **Skip-refetch guard state migration (design debt)**: Task 6.2's final note documents the intent to migrate `lib/skip-next-auth-refetch.ts` module-level flag to history state (`router.history.replace(path, { skipAuthRefetch: true })`). Current implementation is correct but relies on synchronous JS execution timing; history state would make it structurally true. **Deferred deliberately**: this would be the third rewrite of the same code in one session, the shipped mechanism is verified safe by two independent source-level traces, and a TanStack Router upgrade should get its own change. **Rationale**: `configuracion.tsx` cleanup effect arms the flag before calling `router.history.replace(...)`, and `_authenticated.tsx`'s `beforeLoad` consumes it on the very next run only, reading the already-primed cache instead of re-fetching. Breakage requires an async gap between arm and consume, which no current code path has, but future upgrades could introduce one silently.

2. **Design Q8b table documentation lag**: `design.md`'s Q8b (error copy table) still rows only `perfil`/`password` origins for the `403 PERFIL_RECHAZADO` code, but `mensajes.ts` gained a `google`-origin row during apply (task 5.5: "the same `403 PERFIL_RECHAZADO` code" that `GoogleVinculoSection` uses for password validation on link/unlink). The rows use identical copy: "No se pudo completar la acción. Revisa tu password actual." The omission is documentation only — code and test are correct. Update Q8b table to include three rows for that code, one per origin.

3. **Issue #323 — Google login button cold-start hide**: `GoogleLoginButton` in `apps/web/src/components/app-shell/GoogleLoginButton.tsx` fails closed (hides the Google login option) when the API is cold on first visit of the day, because the Google config fetch races the button render. Not caused by this change (pre-existing), but became visible during testing. Separate issue, separate change.

4. **Process debt: TDD-strict forecast bias** (engram #627): `sdd-tasks` forecast for `us-042-web-configuracion-perfil` systematically underestimated all three slices (1.7–3.1x actual), always low. Root cause: the forecast sized production code (estimated 350-450 / 900-1100 / 450-550 lines) while Strict TDD obliges a test suite running ~1.4x the production line count. Both PR #1b and PR #2 shipped as accepted `size:exception` slices. Recommendation for future TDD-strict changes: forecast production and test lines separately, or state that budget numbers exclude tests.

## Artifact Traceability (Engram)

| Artifact | ID | Observation |
|---|---|---|
| Exploration | #612 | Current-state map, contract inventory, stack baseline |
| Proposal | #613 | Scope, approach, rollback plan, business decision record |
| Spec | #614 | 13 WCFG requirements, delta spec for web-app contract |
| Design | #615 | Detailed architecture, Q&A, wiring diagram, verification matrix |
| Apply-progress | #619 | Work batches, task execution state, runtime discoveries |
| Verify-report | #631 | Full compliance matrix, CRITICAL/WARNING/SUGGESTION findings, re-verification pass |
| Archive-report | #634 | Closure summary, shipped deliverables, carried-forward debt |

## Specs Merged to Main

**File**: `openspec/specs/web-app/spec.md`

**Before merge**: 29 requirements (WCAT-01-05, WPER-01-07, WMYP-01-08, DCR-01-07, WAC-01-02)  
**Delta added**: 13 requirements (WCFG-01-13)  
**After merge**: 42 requirements

The delta requirements were added as a new family block after existing requirement families, maintaining the file's existing structure and Markdown formatting. All 29 pre-existing requirements remain byte-identical. Non-Goals section updated to reflect the scope boundaries for this change (US-043/US-044 deferred, API contracts already deployed, etc.).

## Archive Contents

Entire change folder `openspec/changes/us-042-web-configuracion-perfil/` moved to `openspec/changes/archive/2026-08-13-us-042-web-configuracion-perfil/` with full artifact trail:

- ✅ `proposal.md` — PRD and scope
- ✅ `specs/web-app/spec.md` — Delta spec (13 WCFG requirements)
- ✅ `design.md` — Detailed design with Q&A
- ✅ `tasks.md` — Work breakdown, guard decisions, forecast accuracy record
- ✅ `verify-report.md` — Full compliance matrix and re-verification findings
- ✅ `pr-1a-body.md` — PR #324 description (infrastructure, query foundation)
- ✅ `pr-1b-body.md` — PR #325 description (Perfil form, save orchestration)
- ✅ `pr-2-body.md` — PR #326 description (Google link/unlink, layout)

## SDD Cycle Complete

The change has been:
- ✅ Explored (current-state analysis, contract inventory)
- ✅ Proposed (scope, approach, stakeholder decisions)
- ✅ Specified (13 WCFG requirements, delta spec merged to main)
- ✅ Designed (detailed architecture, wiring, Q&A)
- ✅ Tasked (work breakdown, guard decisions, slice boundaries)
- ✅ Applied (3-PR chain, 100% test coverage under Strict TDD)
- ✅ Verified (full compliance matrix, CRITICAL closed, 0 blockers)
- ✅ Archived (all artifacts preserved, debt recorded)

**Ready for the next change.** The web app now has a complete, tested, user-facing Configuración page where logged-in users can manage their profile, password, and Google account link — consuming the already-deployed API contracts from US-040 and US-041.
