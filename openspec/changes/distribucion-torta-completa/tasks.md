# Tasks: Full (filled) pie for the "Distribución del gasto" chart

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250 (additions + deletions), mostly deletions |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

The proposal's own per-file forecast (`domain/pie-geometry.ts` ~50, its test ~45, `DistribucionPie.tsx`
~50, its test ~35, `ResumenScreen.tsx` ~8, spec delta ~70 — spec delta already written, not a task here)
totals ~250 authored lines, dominated by deletions across 5 code files plus one already-written spec
delta. That is well under the 400-line budget with margin, all in one tightly-coupled presentation slice
(domain → component → call site → tests) that has no independently shippable sub-boundary — splitting it
would only fragment a single RED→GREEN→refactor sequence across PRs. No user decision is required before
apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Flip the call site (RED→GREEN) + delete the dead donut path, adapt/delete its tests, refresh docblocks, run all gates and the visual check | PR 1 (single PR) | `pnpm web test` | `pnpm web test:e2e dashboard-donut mobile-floor` (real Playwright scenario, all 3 projects), plus the temporary `tmp-torta-sesgada` visual check | `git revert <sha>` restores the donut path, its tests, and the WG5-01/WG5-12 donut wording (proposal's Rollback Plan) |

## Phase 1: RED — prove the call site is wrong (design Decision 4, step 1)

- [x] 1.1 In `apps/web/src/components/ResumenScreen.test.tsx`, add the new test "renders the spending chart
      as a filled pie with on-wedge labels at half the radius (WG5-01)" per design's "RED test shape"
      section: use the existing 50/30/20 `distribucionGasto` fixture and default `size = 240`
      (`cx = cy = 120`, `r = 120`, label radius `60`); call `mockFetchAnual()`; scope all queries with
      `within(await screen.findByRole('group', { name: 'Distribución del gasto' }))`; assert every
      `pie-slice` `d` starts with `'M 120 120'` and has exactly one `A ` command; assert the `50%` label
      (Necesidades, mid-angle 90°) has `x ≈ 180` and `y ≈ 120` via `Number(getAttribute(...))` with
      `toBeCloseTo(..., 3)`.
- [x] 1.2 Run `pnpm web test ResumenScreen` and confirm the new test is RED for the reason design
      predicts: today's donut wedge starts at `'M 120 0'` with two `A ` commands, and the label sits at
      `x ≈ 214.8` (label radius `0.79 × 120`), not `x ≈ 180`. Record the observed failure output as the
      RED evidence.

## Phase 2: GREEN — flip the call site only (design Decision 4, step 2)

- [x] 2.1 In `apps/web/src/components/ResumenScreen.tsx`, remove the `conInterior` attribute from the
      `DistribucionPie` call at line 150. Do not touch `DistribucionPie.tsx` or `pie-geometry.ts` yet — the
      `conInterior` prop and `rInterior` machinery still exist, so every other test stays green.
- [x] 2.2 Run `pnpm web test ResumenScreen` and confirm the Phase 1 test now passes (GREEN), with no other
      `ResumenScreen` test regressed.

## Phase 3: Characterisation pins — protect the refactor before deleting anything (design Decision 4, step 3)

- [x] 3.1 In `apps/web/src/domain/pie-geometry.test.ts`, add the new byte-exact case: `arcoPath(100, 100,
      80, 0, 360)` equals `'M 100 100 L 100 20 A 80 80 0 1 1 100 180 A 80 80 0 1 1 100 20 Z'`. This pins
      the restructured full-360° branch before the annular branches are removed in Phase 4. Run
      `pnpm web test pie-geometry` and confirm it is GREEN on arrival (current `arcoPath` with
      `rInterior` omitted already produces this output).
- [x] 3.2 In `apps/web/src/components/DistribucionPie.test.tsx`, add the new characterisation test "places
      each on-wedge % label at half the radius on its wedge's mid-angle", using the label-position table
      from design (same 50/30/20 fixture, `size = 240`, radius 60): `50%` at `x=180, y=120` (mid-angle
      90°), `30%` at `x≈71.459, y≈155.267` (mid-angle 234°), `20%` at `x≈84.733, y≈71.459` (mid-angle
      324°), all asserted with `toBeCloseTo(..., 3)`. Run `pnpm web test DistribucionPie` and confirm it
      is GREEN on arrival.

## Phase 4: REFACTOR (delete) — remove the dead donut path (design Decision 4, step 4; proposal Approach steps 1-2)

- [x] 4.1 In `apps/web/src/domain/pie-geometry.ts`: reduce `arcoPath` to the 5-argument signature
      (`cx, cy, r, inicio, fin`), keeping exactly the two filled branches (full-sweep `fin - inicio >=
      359.999` and the ordinary wedge). Remove the `rInt` local, the `[0, r)` clamp, and both `rInt > 0`
      branches. Drop the `Exterior` suffix from local names (`topExterior` → `top`, `p1Exterior` → `p1`,
      etc.) since "exterior" no longer contrasts with an interior. Delete the `radioEtiqueta` function and
      its docblock. Trim the module/function docblocks to describe only the filled wedge and the 360°
      split. The emitted strings for the filled paths MUST stay byte-identical to today's
      `arcoPath(..., 0)` output (verified by the Phase 3.1 pin and the adapted regression test in 4.2).
- [x] 4.2 In `apps/web/src/domain/pie-geometry.test.ts` (design Decision 5): delete `con rInterior > 0
      arranca en el borde exterior ...`, `un barrido completo (0→360) con rInterior > 0 emite dos subpaths
      ...`, `rInterior >= r degrada al wedge relleno ...`, and the `describe('radioEtiqueta')` block plus
      its now-unused import. Adapt `omitiendo rInterior devuelve el mismo string EXACTO de hoy (contrato
      de regresión, D-01)` to keep the exact same assertion
      (`'M 120 80 L 162.426 37.574 A 60 60 0 0 1 162.426 122.426 Z'`) but retitle it as a filled-wedge
      regression contract and drop the `rInterior`/`D-01` comment. Keep `calcularAngulos` (3 cases),
      `arranca en el centro y cierra el wedge (Z)`, and `marca large-arc-flag=1 cuando el barrido supera
      180°` unchanged.
- [x] 4.3 Run `pnpm web test pie-geometry` and confirm all kept/adapted/new cases are GREEN with no
      leftover reference to `rInterior` or `radioEtiqueta` in the file.
- [x] 4.4 In `apps/web/src/components/DistribucionPie.tsx`: remove the `radioEtiqueta` import; change
      `centroidLabel` to drop the `rInterior` parameter and compute `const radio = r / 2;` inline with the
      one-line "why" comment from design ("Half the radius: the middle of a filled wedge. It also keeps
      labels away from the IDEAL inset ... the old donut band sat at ~0.79 r."); remove the `rInterior`
      prop from the module-private `Pie` component and its docblock line; call `arcoPath` with exactly 5
      arguments; remove the `conInterior` prop from the exported `DistribucionPie` and its docblock, the
      `RATIO_INTERIOR` constant, `rInteriorAnillo`, and the `rInterior` attribute passed to the main `Pie`.
      Rewrite the component docblock's US-047 paragraph (lines ~271-275) and the IDEAL cut-out comment
      ("off the main donut" → "off the main pie") to describe a filled pie only.
- [x] 4.5 In `apps/web/src/components/DistribucionPie.test.tsx` (design Decision 5): delete `main-ring
      wedge paths do not start at the centre ... when conInterior is enabled`. Adapt `renders the filled
      pie (no hole) by default — the donut hole is opt-in via conInterior` into an unconditional "renders
      a filled pie: every main wedge starts at the centre with a single arc" — same assertions, no opt-in
      wording, rewritten comment. In the IDEAL inset filled-wedge test, drop the "did not inherit the
      donut ring's rInterior" phrasing from its comment; keep its assertions unchanged. Leave every other
      test (a11y, labels, classes, focus, `< 5%`, placeholder, navigation, FIX 8) unchanged.
- [x] 4.6 Run `pnpm web test DistribucionPie` and confirm every kept/adapted/new test is GREEN.
- [x] 4.7 In `apps/web/src/components/ResumenScreen.tsx`, rewrite the docblock at lines ~46-48 to describe
      the pie rendering `viewModel.distribucionGasto` as a filled pie, removing the "donut hole enabled
      (`conInterior`, D-01)" wording. Leave the `dashboard-donut` e2e filename reference at line ~113
      untouched (renaming the e2e file/title is out of scope).
- [x] 4.8 Run `pnpm web test` (full suite) and confirm zero regressions across all touched and untouched
      files.

## Phase 5: Gates — grep, types, lint, e2e (proposal Approach step 6; design Testing Strategy)

- [x] 5.1 Run the grep gate: `rg -n 'conInterior|RATIO_INTERIOR|rInteriorAnillo|rInterior|radioEtiqueta'
      apps/web` and confirm no matches.
- [x] 5.2 Run the manual-review grep over the touched files: `rg -n -i 'donut|hole|agujero|D-01'
      apps/web/src/components/DistribucionPie.tsx apps/web/src/components/DistribucionPie.test.tsx
      apps/web/src/components/ResumenScreen.tsx apps/web/src/domain/pie-geometry.ts
      apps/web/src/domain/pie-geometry.test.ts` and confirm the only residue is the `dashboard-donut` e2e
      filename in `ResumenScreen.tsx`. Fix any other stale comment found.
- [x] 5.3 Run `pnpm --filter @moneydiary/web exec tsc -b` (not `--noEmit` — this solution-style tsconfig
      checks nothing under `--noEmit`) and confirm no type errors, i.e. no remaining caller of the removed
      `conInterior` prop or `rInterior`/`radioEtiqueta` symbols.
- [x] 5.4 Run `pnpm web lint` and confirm zero errors, including the scoped `jsx-a11y` override on
      `DistribucionPie.tsx` (already listed in `apps/web/eslint.config.js`; no config change needed).
- [x] 5.5 Run `pnpm web test:e2e dashboard-donut mobile-floor` on all 3 Playwright projects (`movil`,
      `tablet`, `escritorio`) as a fast iteration signal.
- [x] 5.6 Run the full `pnpm web test:e2e` suite across `movil`, `tablet`, and `escritorio` and confirm all
      specs pass, including `dashboard-donut.e2e.ts` and the mobile-floor harness at 360px. Do not skip a
      project for speed (e2e-three-viewports convention).

## Phase 6: Visual acceptance check — temporary, uncommitted (design Decision 6 and its procedure)

- [x] 6.1 Create `apps/web/e2e/tmp-torta-sesgada.e2e.ts` (temporary, not committed to the final PR). In
      each test: call `stubApi(page)`, then register `page.route('**/api/resumen*', ...)` with a literal
      `ResumenMesDto` (same shape as `RESUMEN_MES_FIXTURE`, `sinIngreso: false`) — Playwright matches the
      most recently registered route first, so the override wins. Add three skewed cases: 80/15/5
      (Necesidades mid-angle 144°, the main target case), 64/26/10 (Necesidades mid-angle ≈115°, the
      user's originally reported `64%` case), and 10/75/15 (Deseos spans 36°-306°, mid-angle 171°).
- [x] 6.2 In each test, `page.goto('/?periodo=2026-07')`, wait for `'Toca un ítem del gráfico o la
      leyenda'`, scope to `page.getByRole('group', { name: 'Distribución del gasto' })`, collect each
      `text` element's `boundingBox()` and the IDEAL inset's box from `page.getByRole('img', { name:
      'Distribución ideal 50/30/20' })`. Assert no label box intersects the inset box. Take
      `page.screenshot()` into the scratchpad directory (not the repo).
- [x] 6.3 Run `pnpm web test:e2e tmp-torta-sesgada` on all 3 projects, with `movil` (360px, narrowest
      column) as the most important signal. Record the pass/fail outcome per case and per project.
- [x] 6.4 Delete `apps/web/e2e/tmp-torta-sesgada.e2e.ts` (it must not be committed). If any case shows an
      overlap, do not fix it here (moving/resizing the IDEAL inset is out of scope) — record it as a
      follow-up issue referencing the case, project, and screenshot; attach the deleted spec's content to
      that issue for reuse as its RED test.

## Phase 7: Close out

- [x] 7.1 Re-run `pnpm web test`, `pnpm --filter @moneydiary/web exec tsc -b`, and `pnpm web lint` one
      final time after all edits (Phases 4-6) to confirm a clean state before committing.
- [x] 7.2 Confirm the spec delta at
      `openspec/changes/distribucion-torta-completa/specs/web-app/spec.md` (already written) matches the
      shipped behavior: filled 3-wedge pie for `WG5-01`, no donut/ring shape wording in `WG5-12`. No edit
      expected — read-only confirmation.
- [x] 7.3 Commit the work unit on a feature branch off `main` (e.g. `fix/web-distribucion-torta-completa`,
      branching first since `main` is protected), as one or more Conventional Commits (no AI attribution),
      keeping tests alongside the behavior they pin (RED/GREEN/pins/refactor may be one or several commits
      as long as each commit's tests match its code). Record the commit SHA(s) as evidence of completion.
