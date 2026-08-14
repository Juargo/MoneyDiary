# Verify Report — us-042-web-configuracion-perfil

**Verified against**: `feat/us-042-pr2-google-layout` (tip of the 3-PR chain: pr1a-infra → pr1b-perfil-form → pr2-google-layout), HEAD `de1fc19`
**Date**: 2026-08-13 (re-verification pass, supersedes the first pass recorded in this file's prior revision / engram obs #631)
**Verdict**: **PASS** — 0 CRITICAL, 1 WARNING (process debt, already accepted), 1 SUGGESTION (documentation lag). 13/13 WCFG requirements fully satisfied.

## What changed since the first verify pass

Two commits landed in direct response to the first pass's findings, on top of the previously-verified tip (`ba78f39`):

1. `783fdcb fix(web): block dialog confirm when Password actual is empty (WCFG-08)` — closes **CRITICAL-1**.
2. `de1fc19 docs(sdd): narrow WCFG-03 invalidation rule, pin the link exclusion` — closes **WARNING-1** by correcting the spec text (not the code) and adding a pinning test.

Both were re-verified from scratch in this pass, not carried over on trust.

## Gates (observed directly)

| Gate | Result |
|---|---|
| `pnpm web typecheck` | Clean — `tsr generate && tsc -b` exits 0, no errors |
| `pnpm web test` | **710/710 passed, 76 test files** (+3 over the first pass's 707: the two `ConfirmarPasswordDialog` tests + the `useVincularGoogle` link-exclusion pin) |
| `pnpm web lint` | **0 errors, 2 warnings** — both `jsx-a11y/no-noninteractive-element-interactions` in `EliminarIngestaControl.tsx:128` / `ReclasificarCategoriaControl.tsx:163`, pre-existing baseline, unrelated to this change |
| `apps/api` / `apps/mobile` diff | `git diff --stat main...feat/us-042-pr2-google-layout -- apps/api apps/mobile` → **0 lines** |
| Tasks | 42/42 checked in `tasks.md`, 0 unchecked |

All numbers match the values expected at time of writing.

## WCFG-01…13 compliance matrix

| Req | Verdict | Evidence |
|---|---|---|
| WCFG-01 | ✅ Satisfied | Unchanged since first pass. `_authenticated/configuracion.tsx` nests under the pathless `_authenticated` layout, zero new guard code. `nav-items.ts` (`Configuración` → `/configuracion`) + `_authenticated.tsx` sidebar-footer icon link (`aria-label="Configuración de la cuenta"`, no name rendered). Test: `test/configuracion-entry-points.test.tsx` — real route tree, unauthenticated → `/login?redirect=/configuracion`, both entry points reach `/configuracion`. |
| WCFG-02 | ✅ Satisfied | Unchanged. `ConfiguracionPage.tsx` renders heading → `ConfiguracionTabs` → `PerfilForm` → `GoogleVinculoSection`, single right-aligned `Guardar cambios`. Google block's two symmetric states driven by `me.googleVinculado`. Tests: `ConfiguracionPage.test.tsx`, `GoogleVinculoSection.test.tsx`. |
| WCFG-03 | ✅ **Satisfied — re-verified against the narrowed spec text** | Spec now states the principle (a mutation invalidates exactly when it changed a `MeDto` field the endpoint reports **and** the client remains on the page) and names four consequences. Checked each directly against `use-guardar-perfil.ts:160-167` and `use-google-vinculo.ts`: **profile success → invalidates** (`onSuccess`: `identidadCambio = (tipo==='ok' && perfilGuardado) \|\| (tipo==='password-fallo' && perfilGuardado)`, true whenever the profile call actually succeeded, including partial failures where it did); **unlink success → invalidates** (`useDesvincularGoogle`'s `onSuccess` unconditionally invalidates); **password-only success → does NOT invalidate** (`tipo==='ok' && perfilGuardado===false` → `identidadCambio` false); **link → does NOT invalidate** (`useVincularGoogle` has no `queryClient`/`invalidateQueries` call at all — it only calls `window.location.assign`). All four consequences are accurate; the spec is not overstating the code. Tests, one per consequence, all non-vacuous (verified by reading assertions, not just presence): `use-guardar-perfil.test.tsx` "un password-fallo con perfilGuardado=true SÍ invalida" (row 11, pre-existing) and "un password-only éxito (perfilGuardado=false) NO invalida nada" (pre-existing, asserts both `invalidateSpy` not called AND the single HTTP call made — would fail if the code invalidated unconditionally); `use-google-vinculo.test.tsx` "en éxito SÍ invalida ['auth-me']" for unlink (pre-existing) and the **new** "en éxito NO invalida [auth-me] — el cliente se va a Google y beforeLoad re-primea al volver" for link (added in `de1fc19`; spies on `invalidateQueries`, drives the mutation to `isSuccess`, asserts the spy was never called — would fail if a future edit added an invalidate call to `useVincularGoogle`). Exactly-once-fetch-per-visit half unchanged: `use-me-priming.test.tsx`, `configuracion-google-aviso.test.tsx`. |
| WCFG-04 | ✅ Satisfied | Unchanged. `auth.ts`'s `esMeDto` validates `nombre: string` and `googleVinculado: boolean`, rejecting via `{tag:'parse'}`. Test: `auth.test.ts` — missing/mistyped cases for both fields plus a valid-payload-accepted case. |
| WCFG-05 | ✅ Satisfied | Unchanged. `construirPerfilPatch` returns `undefined` when nothing changed; password call gated on `passwordNueva !== ''`; `sin-cambios` short-circuits to zero requests. Tests: `use-guardar-perfil.test.tsx` rows 1/2/5. |
| WCFG-06 | ✅ Satisfied, test-honesty confirmed by mutation (first pass) | Unchanged. `guardar()`: profile block runs first, `return`s on failure before the password block. Mutation-tested live in the first pass (abort removal, call-order swap) — both caught by the suite, file restored, verified clean. Not re-mutated this pass since the file is untouched by either fix commit; re-ran the full suite green instead. |
| WCFG-07 | ✅ Satisfied | Unchanged. Partial-failure copy + field-clearing behavior verified in `PerfilForm.tsx`/`use-guardar-perfil.ts`. Tests: `use-guardar-perfil.test.tsx` row 11, `PerfilForm.test.tsx`. |
| WCFG-08 | ✅ **Satisfied — both scenarios now covered** | Scenario 1 (email dirty blocks `Guardar cambios`) unchanged, still covered by rows 3/4 of `use-guardar-perfil.test.tsx`. **Scenario 2 (dialogs block confirm on empty password) is now implemented and tested.** `ConfirmarPasswordDialog.tsx`: `CampoTexto` gained `required` (native affordance) AND `enviar()` gained `if (passwordActual === '') return;` before calling `onConfirmar` (the real gate — `required` alone doesn't block `user-event`/`fireEvent` submits under jsdom's constraint-validation behavior, which is exactly why the JS guard is load-bearing, not decorative). `GoogleVinculoSection.confirmar()` only ever receives a non-empty password from the dialog's `onConfirmar` callback, so no duplicate guard is needed there (single point of enforcement, consistent with `dry`). Two new tests in `ConfirmarPasswordDialog.test.tsx`: "Confirmar con la password vacía NO llama a onConfirmar" (clicks Confirmar with the default empty password, asserts `onConfirmar` never called — non-vacuous, fails without the guard) and "el input de password del diálogo es required" (asserts `toBeRequired()`). |
| WCFG-09 | ✅ Satisfied | Unchanged. `mensajes.ts` closed translation table, verbatim-matched. Test: `mensajes.test.ts`. |
| WCFG-10 | ✅ Satisfied | Unchanged. `validateSearch` narrows to the literal union; message survives the `replace:true` rewrite. Test: `configuracion-google-aviso.test.tsx`. |
| WCFG-11 | ✅ Satisfied | Unchanged. `ConfiguracionPage.tsx`'s `grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]`, no `layout.ts` edit. Test: `ConfiguracionPage.test.tsx`. |
| WCFG-12 | ✅ Satisfied | Unchanged. `eslint-plugin-jsx-a11y` scoped `error` on `src/components/configuracion/**` + route file, `warn` elsewhere. Live `pnpm web lint` confirms 0 errors. All four labels reachable via `getByLabelText`. |
| WCFG-13 | ✅ Satisfied | Both gates re-run directly by this pass: `pnpm web typecheck` clean, `pnpm web test` 710/710. |

**Score: 13/13 fully satisfied. No open CRITICAL or WARNING tied to unimplemented/untested spec behavior.**

## Issues

### CRITICAL-1 — CLOSED (was: WCFG-08's dialog-blocking scenario unimplemented)
Fixed in `783fdcb`. `ConfirmarPasswordDialog.tsx` now carries a two-layer guard (`required` affordance + `if (passwordActual === '') return;` gate in `enviar()`), matching the pattern already used by `PerfilForm` (design Q1c) for exactly the reason documented in-code: `fireEvent.submit`/`user.click` on a submit button bypass native HTML5 constraint validation under jsdom, so `required` alone would not have blocked the empty submit in the test environment (and arguably not reliably across real browsers on programmatic form submission either) — the JS guard is the actual gate. Verified two new tests are non-vacuous: the "NO llama a onConfirmar" test drives a real click with the default empty state and asserts the callback was never invoked; the `toBeRequired()` test pins the native affordance separately so a future refactor can't silently drop it while keeping the JS guard. Re-read the code and both tests directly (not the task-file note) to confirm.

### WARNING-1 — CLOSED (was: WCFG-03's literal text broader than the shipped code)
Closed by narrowing the spec text in `de1fc19`, not by changing code — correct call, since the maintainer confirmed the code's behavior (link excluded from invalidation) was itself the intended design, and the earlier spec sentence was simply imprecise. Re-verified the narrowed wording is accurate against the current code (all four named consequences checked directly against `use-guardar-perfil.ts` and `use-google-vinculo.ts`, see WCFG-03 row above) and that the two new scenarios in `spec.md` ("A password-only success does not invalidate identity", "Unlink invalidates identity, link does not") each have a covering, non-vacuous test — the password-only case was already covered by a pre-existing test; the link-exclusion case needed (and got) a new one, since without it the "link does NOT invalidate" half of the spec would have been a claim with zero test backing, the same category of gap that produced CRITICAL-1 in the first pass. No regressions: the four-consequence table's wording was independently checked against the code rather than assumed correct because a test exists — a test asserting the wrong thing would not have been caught by this framing alone.

### WARNING-2 — Unchanged, not re-litigated per instructions
Both PR#1b (~1953 lines) and PR#2 (1581 lines) shipped as accepted `size:exception` slices; the ~2x sdd-tasks forecast miss is registered process debt (engram #627). No code defect, does not block archive.

### SUGGESTION-1 — Still open
`mensajes.ts`'s `google`-origin `403 PERFIL_RECHAZADO` row (apply-time addition, task 5.5) is still not folded into `design.md`'s Q8b table as of this pass. Confirmed via `rg` against `design.md`: Q8b's table still rows only `perfil`/`password` origins for that code. Non-blocking (documentation lag only, code and tests are correct and complete) — carry forward to archive.

## Design coherence

- Re-confirmed no regressions elsewhere: `git diff --stat` between the first pass's verified tip (`ba78f39`) and the current HEAD (`de1fc19`) touches exactly `ConfirmarPasswordDialog.tsx`, `ConfirmarPasswordDialog.test.tsx`, `use-google-vinculo.test.tsx`, `spec.md`, `tasks.md`, and `verify-report.md` — no other production file changed, consistent with the full suite passing at 710/710 (a clean +3 over 707, matching exactly the three new tests added).
- `GoogleVinculoSection.confirmar()` was checked and confirmed to need no changes of its own: it only ever receives `passwordActual` values the dialog's `onConfirmar` already filtered to non-empty, so the fix's single point of enforcement is sufficient and does not duplicate the guard per caller.
- `design.md`'s `ensureQueryData` correction and the jsx-a11y severity-derivation fix, both verified in the first pass, remain intact (untouched by this diff).

## Mutation-testing note
No new mutation testing performed this pass — `use-guardar-perfil.ts` (the file mutated in the first pass for WCFG-06) is untouched by either fix commit, so the first pass's mutation results still stand. The full suite was re-run green (710/710) as the regression check instead. No scratch files or uncommitted mutations remain; `git status --short` at the end of this pass shows only pre-existing untracked directories/files unrelated to this change (`.agents/`, various `.claude/skills/*` additions, `openapi.html`, `openspec/changes/dast-ci-wiring/`, `skills-lock.json`) — none touched by this verification.

## Archive readiness
**Clear to archive once the three PRs (#324, #325, #326) merge.** No CRITICAL or WARNING remains that blocks archive. SUGGESTION-1 (design.md Q8b table) and WARNING-2 (forecast-bias process debt) are both non-blocking follow-ups already registered.
