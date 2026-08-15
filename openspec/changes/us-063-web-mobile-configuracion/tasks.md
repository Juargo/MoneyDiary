# Tasks: US-063 — Web Configuración, mobile viewport variants (M2/M3)

- **Change**: `us-063-web-mobile-configuracion` · **Issue**: [#332](https://github.com/Juargo/MoneyDiary/issues/332)
- **Inputs**: `design.md` (mechanism, authoritative for HOW; D-01…D-12) · `specs/web-app/spec.md`
  (`WCTM-01..06` ADDED, `WCTG-13`/`WCTG-14`/`WCFG-11` MODIFIED — **frozen, wins over design and
  proposal on conflict**) · `proposal.md` (binding decisions, delivery forecast) ·
  `openspec/changes/archive/2026-08-14-us-043-web-configuracion-categorias/{tasks.md,archive-report.md}`
  (precedent + lessons).
- **Delivery**: `delivery_strategy: ask-on-risk` · `chain_strategy: feature-branch-chain` — PR #1
  targets the tracker branch; every later PR targets the immediately previous PR's branch. Only the
  tracker merges to `main`.
- **Strict TDD is ACTIVE** (`pnpm web test`). Every task is marked `RED, GREEN`, `RED (test.fail)`,
  or `GREEN`. Component/unit tasks (jsdom) are genuine red→green cycles. Playwright tasks are marked
  `GREEN` unless the task is D-12's deliberate defect-commit (task 5, `RED (test.fail)`) or its
  repair (task 10) — Playwright is the **acceptance** layer (D-08): its specs are authored to prove
  a mechanism this PR's own earlier tasks already implement, not cycled red→green within the task
  itself. Labelling these `RED, GREEN` would overstate what actually happened; §"Testability" below
  states this once so it isn't re-litigated per task.
- **Baseline**: `main` has 98 test files / 980 tests green, lint 0 errors (2 pre-existing warnings in
  `EliminarIngestaControl.tsx`/`ReclasificarCategoriaControl.tsx`, not ours). `@playwright/test` is
  **not installed anywhere in the monorepo** — this change installs it.

```text
Decision needed before apply: RESOLVED (maintainer, 2026-08-14)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

## Delivery decisions — maintainer, 2026-08-14. Binding; do not re-open.

**D-A · Four PRs, each carrying `size:exception`.** The slicing below stands as written. Splitting
further would fragment things that must land together: a harness without its viewports verifies
nothing, and D-10's footer reorder cannot be separated from its `E-08` assertion. Every PR opens with
the `size:exception` label and states this rationale in its body — the exception is a recorded
decision, not an administrative afterthought.

**D-B · The Playwright job is a BLOCKING required check from PR #1.** It enters `main`'s branch
protection as a required status check, and **PR #2 must not merge until it is enforced**.

Rationale, stated plainly because it is the whole reason this change is shaped the way it is:
**Playwright is the ONLY acceptance layer.** D-08 chose CSS-only, so jsdom cannot assert a single one
of CA-01…CA-05 as a user-visible outcome — the unit suite proves mechanism only. If the harness slice
is descoped, deferred, or left advisory, this change ships with **zero verification of its acceptance
criteria**. That is not hypothetical: `WCTG-14` shipped false through six layers of review for exactly
this reason, and ADR-021's DAST job was introduced as advisory and has never been hardened since.

⚠️ **Adding a required status check is a repository-admin action** (branch protection on `main`,
ADR-030 C.7). It cannot be done from a PR. PR #1 delivers the job and the workflow wiring; **the
maintainer must add it to the required-checks list before PR #2 merges.** Task 9 records this as an
explicit hand-off, not an assumption.

---

## Testability — D-08's consequence, stated once

CSS-only responsive behaviour (D-08, chosen once for all five criteria) means **the Vitest/jsdom
suite cannot assert a single one of CA-01…CA-05 as a user-visible outcome.** What it proves is
mechanism: the class literal is present, `EtiquetaResponsiva` emits the right spans for the right
bands, the delete button carries `hidden md:inline-flex`, the back link exists with its accessible
name, the h1 is still in the a11y tree. **Every task below says explicitly which layer (jsdom
mechanism vs. Playwright acceptance) it satisfies — a task whose test only asserts a className never
reads as if it verified the criterion.** That exact confusion is how `WCTG-14` shipped false through
six layers of review (archive-report). The Playwright harness (PR #1) is this change's **only**
acceptance layer. **If PR #1 is descoped or deferred, this change ships with no acceptance layer at
all — CA-01…CA-05 become unverifiable claims, exactly like `WCTG-13`/`WCTG-14` shipped in US-043.**

---

## Re-slicing note — why 4 PRs, and the open questions resolved against the frozen spec

Design's §8 sketches 4 conceptual slices and explicitly assigns the binding forecast to this phase.
This document keeps design's 4-PR shape — unlike US-043, none of these four slices individually
forecasts past ~450 production lines (§ Review Workload Forecast), so none needs splitting further,
and design's own dependency ordering (harness → tier → labels/list → edit) is preserved exactly:
D-12 is non-negotiable (the harness must land before the tier, with `WCTG-14`'s defect committed as
`test.fail()`), and PR #3/#4 both sit on PR #2's `md` tier existing.

**Open questions resolved against the frozen spec (design §6, Q-01…Q-06):**

| id | Design's question | Resolution against the frozen spec |
|---|---|---|
| Q-01 | Does `Nueva categoría` really run long→short→long? | **Yes — settled.** `WCTM-06`'s table and its "Nueva categoría is non-monotonic" scenario state it explicitly. Not blocking; task 19 implements it as written |
| Q-02 | Does the list's back control go to `/`? | **Yes — settled.** `WCTM-04`'s destination mapping states "From `/configuracion/categorias` or `/configuracion`, back navigates to the dashboard (`/`)" verbatim. Task 15 implements it |
| **Q-03** | Does the mobile header need a layout-owned title above the tabs (route `staticData`), or is the panel's own `<h2>` enough? | **Not blocking — the spec does not require the "above the tabs" reading.** `WCTM-04`'s scenarios only require "a back-icon control plus the screen's own section title" replacing the h1/breadcrumb, reusing "the screen's own existing title text — no new copy is introduced." Nothing in `WCTM-02` or `WCTM-04` places that title above the tab list or requires a second, layout-owned source of the string. Design's D-07 reading (the panel's existing `<h2>`, no `staticData`) stands as written. No task sizing changes as a result |
| Q-04 | Does `Categorías y patrones` shorten at mobile? | **No — settled.** It is absent from `WCTM-06`'s six-string table. No task touches it |
| Q-05 | Does the always-rendered `sin patrones` note keep its static-helper-text semantic at mobile? | **Yes — settled.** `WCTM-06` only swaps the *string*; `WCTG-06`'s "always rendered, not a zero-state" semantic is untouched. Task 21 swaps text only |
| Q-06 | Does `WCFG-11` reword to the kind-level claim? | **Yes — done in the frozen spec.** `WCFG-11`'s MODIFIED text explicitly states "The claim is kind-level, not pixel-level" and explains the 113px (frame) vs. 200px (shipped) divergence. **No task asserts 113px** — see task 9 |

**One conflict the frozen spec resolves against design, found while planning — recorded, not
silently encoded (per this project's own lesson: never write a test that pins behaviour believed
wrong).** Design §1.5 says `EditarCategoria`'s `sm:grid-cols-[1fr_220px]` must **not** be changed to
`md:`, claiming that "would break `WCTG-14`'s second scenario (side-by-side at 880)." **That claim is
arithmetically wrong, and the frozen spec (`WCTM-05`) explicitly requires the opposite:**

- `WCTG-14` scenario 2 requires side-by-side **at 880px**. `880 ≥ 768` (`md`) is true whether the
  boundary is `sm`(640) or `md`(768) — moving `sm:` → `md:` does **not** stop the grid activating at
  880; it only *raises the floor* at which it activates, from 640 to 768.
- `WCTM-05` explicitly requires closing the 640–767px gap ("moving this grid's own boundary to `md`,
  or an equivalent mechanism — is required... `sdd-design`/`sdd-tasks` MUST account for it
  explicitly, and verification MUST NOT rely solely on the 360px width").

Moving `sm:` → `md:` satisfies **both** requirements simultaneously with no regression — see task 25's
full arithmetic table. Per this document's mandate (spec wins on conflict), task 25 performs the
move design's §1.5 declined to make. **`design.md` §1.5 should be corrected** to drop the false
"would break `WCTG-14`" claim; that edit is out of this document's scope (no `apps/web` file), noted
here so it isn't lost.

---

## Traceability legend

Every task cites the exact `WCTM-*`/`WCTG-*`/`WCFG-*` requirement id(s) it satisfies, from the
**frozen spec** (`openspec/changes/us-063-web-mobile-configuracion/specs/web-app/spec.md`). Design's
`E-01…E-12` assertion ids (§4) are cited alongside as the executable definition of each scenario.

---

## PR #1 — Playwright harness (D-11/D-12, zero product dependency)

*Runs against `main` as shipped. Lands first per D-12: the `WCTG-14` defect is committed as an
executable `test.fail()` before anything is repaired — the epistemic position that let `WCTG-14` ship
false must not repeat here. Targets the tracker branch.*

- [x] 1. **GREEN** — Add `@playwright/test` devDependency and `apps/web/playwright.config.ts` (D-11):
  three projects — `movil` 360×740, `tablet` 880×1000, `escritorio` 1280×800 (the executable
  definition of D-01's tier) — Chromium only; `webServer: { command: 'pnpm run build && pnpm exec
  vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer:
  !process.env.CI }` (serves the real compiled Tailwind CSS, not `vite dev`'s pipeline); `testMatch`
  for `e2e/*.e2e.ts`. Add `test:e2e`/`test:e2e:ui` scripts to `apps/web/package.json`.
  *Requirement*: D-11 (harness infrastructure, no CA directly).
  *Files*: `apps/web/playwright.config.ts` (new), `apps/web/package.json` (modify).

- [x] 2. **GREEN** — Add `apps/web/tsconfig.e2e.json` (`types: ["node"]`, `include: ["e2e/**/*.ts",
  "playwright.config.ts"]`) and add it to `tsconfig.json`'s `references` — closes the trap that
  `pnpm web typecheck` (`tsr generate && tsc -b`) today covers neither `e2e/` nor
  `playwright.config.ts`, silently leaving this change's only real verification layer untypechecked.
  *Requirement*: D-11 detail 2.
  *Files*: `apps/web/tsconfig.e2e.json` (new), `apps/web/tsconfig.json` (modify).

- [x] 3. **GREEN** — `apps/web/vitest.config.ts` gains `exclude: [...configDefaults.exclude,
  'e2e/**']` — closes the trap that Vitest's default `include`
  (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) would collect `e2e/*.e2e.ts` and fail importing
  `@playwright/test`. Verify `pnpm web test` still reports 98 files / 980 tests after this PR's e2e
  specs (tasks 5/6) land.
  *Requirement*: D-11 detail 1.
  *Files*: `apps/web/vitest.config.ts` (modify).

- [x] 4. **GREEN** — `e2e/fixtures/api-stubs.ts`: a `stubApi(page)` helper using `page.route`
  (`'**/api/**'`) fulfilling `GET /api/auth/me`, `GET /api/categorias`, `GET /api/version` from
  static fixtures — no real backend, so `_authenticated.beforeLoad`'s `requireSession` is satisfied
  with no login flow.
  *Requirement*: D-11 (backend stubbing).
  *Files*: `apps/web/e2e/fixtures/api-stubs.ts` (new).

- [x] 5. **RED (test.fail)** — `e2e/tablet-grid.e2e.ts`, `E-02`: commit the currently-false
  `WCTG-14` assertion as `test.fail()` — `getComputedStyle(grid).gridTemplateColumns` at 880px MUST
  resolve to two tracks with the first `200px`; as shipped (`lg:grid-cols-[200px_1fr]`, 880 < 1024)
  it resolves to **one** track. `test.fail()` inverts the expectation: the run fails if the test
  *passes*. This puts the defect in CI as an executable, reviewable fact (D-12) — the repair is a
  one-line annotation removal in PR #2 (task 10), same file as the one-word grid change (task 9).
  *Requirement*: `WCTG-14` (defect committed, not yet repaired).
  *Files*: `apps/web/e2e/tablet-grid.e2e.ts` (new).

- [x] 6. **GREEN** — `e2e/mobile-floor.e2e.ts`: assertions that must already be true on `main`,
  zero product dependency —
  - `E-07` (360/880): `Nombre`/`Bucket` have different `y` and equal width at 360; equal `y` at 880
    (the existing `sm:grid-cols-[1fr_220px]` boundary already satisfies both today).
  - `E-10` (360/880/1280): `documentElement.scrollWidth <= clientWidth` on both screens, all three
    widths (`WCTG-13`(a)).
  - `E-11` (360/880/1280): every icon-only control and standalone button/link inside `main` has a
    bounding box ≥24×24 CSS px, all three widths (`WCTG-13`(c)) — **scoped to icon-only/standalone
    controls, explicitly excluding inline text links** (the breadcrumb links, `Volver a Categorías`
    in the error states — `text-sm` inline text, ~20px tall). SC 2.5.8's *Inline* exception applies to
    them; a naive `a, button, input, select` sweep would flag them as a false red. The exemption and
    its reason go in a comment in this spec file.

  **If any of these three assertions is red against `main`, that is a genuine pre-existing `WCTG-13`
  defect the harness just found — report it, do not adjust the assertion to fit** (this is exactly
  what US-043's archive-report debt 1 left open).
  *Requirement*: `WCTG-13` (guarantees a/c), `WCTG-14` scenario 2 (E-07, already true).
  *Files*: `apps/web/e2e/mobile-floor.e2e.ts` (new).

- [x] 7. **GREEN** — New `web-e2e` CI job in `.github/workflows/ci.yml`: gated on the same
  `needs.changes.outputs.web` filter as `web`; installs Chromium via `pnpm --filter
  @moneydiary/web exec playwright install --with-deps chromium`; `actions/cache` on
  `~/.cache/ms-playwright` keyed by the resolved Playwright version; added to `ci-success`'s `needs`.
  A **separate** job, not extra `web` steps — a geometry failure must be distinguishable at a glance
  from a unit failure, and the browser download must not slow the fast gate.
  *Requirement*: D-11 (CI wiring).
  *Files*: `.github/workflows/ci.yml` (modify).
  *Hand-off (D-B, done as part of this task)*: the workflow job is delivered here. It is **NOT**
  yet a blocking required status check on `main`'s branch protection — that is a repository-admin
  action (ADR-030 C.7) this PR cannot perform. Recorded in the job's own comment block in
  `ci.yml`; the maintainer must add "E2E (Playwright, web)" to the required-checks list before
  PR #2 merges.

- [x] 8. **GREEN** — Verify zero files touched under `apps/api/**` and `apps/mobile/**`:
  `git diff --stat main... -- apps/api apps/mobile` must be empty. **Repeat this exact check as the
  last task of every subsequent PR.**
  *Requirement*: none (proposal's Affected Areas + Success Criteria).
  *Files*: none (verification only).

**Gates (PR #1)**: `pnpm web typecheck` (now covers `e2e/` via task 2) · `pnpm web test` (98
files/980 tests unchanged — `e2e/**` excluded) · `pnpm web lint` · `pnpm web test:e2e` (task 6's
specs green; task 5's `test.fail()` reports as expected-fail, i.e. the run is green because the
assertion did NOT unexpectedly pass) · task 8.

---

## PR #2 — Tier + shared chrome (D-01/D-02, D-05/D-06/D-07)

*Depends on PR #1 (targets its branch). Slices #3/#4 all sit on `md` existing.*

- [x] 9. **RED, GREEN** — `ConfiguracionLayout.tsx` (+ test): grid `grid grid-cols-1 gap-8
  lg:grid-cols-[200px_1fr]` → `md:grid-cols-[200px_1fr]` (D-02). Arithmetic (checked against
  Tailwind's real scale — the check whose absence shipped `WCTG-14` false): 360 → `md` inactive →
  one track (M2/CA-01); 880 → `md` active, `lg` inactive → two tracks, `200px` first (repairs
  `WCTG-14`); 1280 → both active → two tracks, unchanged from shipped. Unit test updates its
  class-literal assertion from `lg:` to `md:`.
  *Requirement*: `WCTG-14` (repaired — the intent, not the "no `layout.ts` entry" clause, which
  stays true), `WCFG-11` (both scenarios — **kind-level claim only: fixed column beside fluid panel,
  never assert 113px** — Q-06).
  *Files*: `apps/web/src/components/configuracion/ConfiguracionLayout.tsx` (+ test).

- [x] 10. **GREEN** — Remove PR #1 task 5's `test.fail()` annotation from
  `e2e/tablet-grid.e2e.ts` — `E-02` becomes a normal passing assertion (D-12). Must land in the same
  PR as task 9 (the annotation and the grid change are the same repair, split across two files only
  by necessity of PR #1's chain position).
  *Requirement*: `WCTG-14` (E-02 now green, not `test.fail()`).
  *Files*: `apps/web/e2e/tablet-grid.e2e.ts` (modify).

  ⚠️ **A green run is NOT sufficient evidence for this task — a human diff review is required**
  (judgment-day on PR #1, both judges). `test.fail()` inverts pass/fail but **cannot distinguish**
  "fails because the `WCTG-14` defect is still present" from "fails for any other reason" — a
  renamed `data-testid`, a broken `stubApi` auth chain that redirects before the grid renders, or a
  thrown error would all satisfy it equally. Both judges confirmed it fails for the *right* reason
  **today** (stripping the annotation yields `Expected length: 2, Received: 1, ["832px"]` — genuinely
  one 832px track), but that is a fact about today, not a property of the mechanism.
  **When removing the annotation, confirm the assertion now passes because the grid renders two
  tracks with `200px` first — not merely because some `evaluate` call stopped throwing.** Paste the
  observed `gridTemplateColumns` value into the PR body.

  **Observed** (2026-08-14, sdd-apply): `getComputedStyle(grid).gridTemplateColumns` at 880px
  resolves to `"200px 600px"` — two tracks, `200px` first, confirming the grid genuinely renders
  fixed+fluid, not merely that some `evaluate` call stopped throwing.

- [x] 11. **RED, GREEN** — `ConfiguracionTabs.tsx` (+ test): `flex flex-col` → `flex flex-row
  md:flex-col`; `TAB_BASE` gains `flex-1 text-center md:flex-none md:text-left`.
  *Requirement*: `WCTM-02` (tabs render horizontal, full-width, below `md`).
  *Files*: `apps/web/src/components/configuracion/ConfiguracionTabs.tsx` (+ test).

- [x] 12. **RED, GREEN** — `ConfiguracionLayout.tsx`'s `<h1>Configuración</h1>` gains
  `max-md:sr-only` (D-07) — the **one** deliberate `max-*` variant in the change (everything else is
  mobile-first `md:`). The h1 stays in the a11y tree at every width (unlike a conditional removal);
  test: `getByRole('heading', {name:'Configuración'})` still resolves, unchanged from shipped.
  *Requirement*: `WCTM-04` (the shared h1 is absent — visually — below `md`, on both list/Perfil and
  edit screens; mechanism half — see task 16 for the Playwright geometry half, since `sr-only` is
  visible to `getByRole` but not to the eye).
  *Files*: `apps/web/src/components/configuracion/ConfiguracionLayout.tsx` (modify + test).

- [x] 13. **RED, GREEN** — `components/configuracion/estilos.ts` (+ test, new — moved): relocate
  `CLASE_BOTON_ICONO` from `categorias/estilos.ts` one level up (D-06 — `ConfiguracionLayout` is one
  level above `categorias/`, and a shared-level file importing *into* a section folder would signal
  ownership that isn't real, per US-043's own D-09). Delete `categorias/estilos.ts`; re-point its two
  existing importers (`CategoriaFila`, `PatronFila`) — import path only, mechanical, no behaviour
  change. The `size-6` pin test moves with it.
  *Requirement*: housekeeping (D-06), no requirement directly — prerequisite for task 14.
  *Files*: `apps/web/src/components/configuracion/estilos.ts` (new), `apps/web/src/components/configuracion/categorias/estilos.ts` (deleted), `CategoriaFila.tsx`, `PatronFila.tsx` (import line only).

- [x] 14. **RED, GREEN** — `components/configuracion/BotonVolver.tsx` (+ test, new, D-05/D-06): a
  typed `<Link to>` — `to: Extract<NavRoute, '/' | '/configuracion/categorias'>` (a third
  destination must be a decision, not an accident) — `label` prop for the accessible name, `ArrowLeft`
  icon, `CLASE_BOTON_ICONO` (task 13's new location, reused not redefined), visible focus ring.
  Explicit `<Link to>`, **never** `router.history.back()` (D-05 — the edit screen is deep-linkable,
  so a cold open has no history entry and `back()` is unpredictable exactly where this matters most).
  *Requirement*: `WCTM-04` (back control a11y minimum — ≥24×24 CSS px, non-empty accessible name,
  reachable by name not only visually).
  *Files*: `apps/web/src/components/configuracion/BotonVolver.tsx` (+ test).

- [x] 15. **RED, GREEN** — Wire `BotonVolver` into `ConfiguracionLayout`, `md:hidden`, `to="/"`,
  `label="Volver al inicio"` — shown on both `/configuracion` and `/configuracion/categorias` (shared
  chrome, so both screens get it from one wiring point; Q-02 resolved by the frozen spec).
  *Requirement*: `WCTM-04` (scenario: back from list/Perfil exits to `/`, regardless of history).
  *Files*: `apps/web/src/components/configuracion/ConfiguracionLayout.tsx` (modify + test).

- [x] 16. **GREEN** — `e2e/mobile-header.e2e.ts` (new): `E-05` (list: `Volver al inicio` visible at
  360, hidden at 1280; `Configuración` h1's `boundingBox().height <= 1` at 360, `> 1` at 1280 —
  **geometry assertion, never `toBeHidden()`** — `sr-only` renders a 1×1 clipped box and IS visible
  to Playwright, so a `toBeHidden()` assertion on task 12's h1 would falsely fail); `E-12` (Perfil at
  360: `E-05`/`E-10`/`E-11` all hold with **zero** `perfil/**` diff — D-5's "for free" claim, asserted
  not assumed); the tabs-row half of `E-01` (the two tab links share a `y`, differ in `x`, nav width
  ≈ content band — the `Nueva categoría` full-width half of `E-01` lands in PR #3, task 22, since
  `CategoriasPanel` isn't touched yet).
  *Requirement*: `WCTM-02` (partial — tabs), `WCTM-04` (E-05, E-12/M1 inheritance, D-5).
  *Files*: `apps/web/e2e/mobile-header.e2e.ts` (new).

- [x] 17. **GREEN** — Verify zero files touched under `apps/api/**` and `apps/mobile/**` (task 8).

**Gates (PR #2)**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · `pnpm web test:e2e`
(`E-02` now green, not `test.fail()`; `E-05`/`E-12`/tabs-half-of-`E-01` green) · task 17.

**PR #2 status (2026-08-14, sdd-apply): COMPLETE — tasks 9-17, all Gates green.**
`pnpm web typecheck` clean · `pnpm web lint` 0 errors (the same 2 pre-existing warnings) ·
`pnpm web test` 99 files / 987 tests · `pnpm web test:e2e` 19 passed / 8 skipped (`E-02` a normal
pass, `"200px 600px"` observed at 880px) · `git diff --stat feat/us-063-pr1-harness... -- apps/api
apps/mobile` empty. One unplanned but necessary fix: `e2e/mobile-floor.e2e.ts`'s
`standaloneControlsInMain` waited for the FIRST matching control to become VISIBLE before
snapshotting; task 15's `BotonVolver` (rendered `md:hidden`, first `a[href]` in `<main>`) is
legitimately never visible at tablet/desktop, so that wait timed out there. Changed the wait to
`state: 'attached'`, which still closes the loading-skeleton race the wait exists for. 5 commits
(`dec9104`, `b9f3151`, `4da1afe`, `181fd60`, `10eb27b`) on `feat/us-063-pr2-tier`.

---

## PR #3 — Labels + list surface (D-03/D-04, D-09, CA-01 completion, CA-02, CA-05)

*Depends on PR #2. The helper and its consumers must land together — a helper with no call site is
unreviewable, and `E-09` needs all six strings.*

- [x] 18. **RED, GREEN** — `components/configuracion/EtiquetaResponsiva.tsx` (+ test, new, D-03):
  typed `{ movil: string; tablet?: string; escritorio: string }`. Emits `md:hidden` (mobile span) +
  `hidden md:inline lg:hidden` (tablet span, **omitted** when `tablet` is undefined, so a 2-band
  input collapses to two spans, not three) + `hidden lg:inline` (desktop span). Classes written
  **literally** in this file (Tailwind 4 scans literals only). Pure, no React state; `it.each` test:
  a 3-band input emits three spans with the right classes+strings, a 2-band input emits two. The
  docblock states D-01's three bands in prose — the one file that must encode all three at once.
  *Requirement*: `WCTM-06` (mechanism only — **jsdom cannot prove which band is visible**; that is
  Playwright's job, task 22).
  *Files*: `apps/web/src/components/configuracion/EtiquetaResponsiva.tsx` (+ test).

- [x] 19. **RED, GREEN** — `CategoriasPanel.tsx` (+ test): header `flex-col md:flex-row`; `Nueva
  categoría` button `w-full md:w-auto`, positioned below the tab list — completes `WCTM-02`; its
  label via `EtiquetaResponsiva({movil:'Nueva categoría', tablet:'Nueva', escritorio:'Nueva
  categoría'})` — **non-monotonic**, `aria-label="Nueva categoría"` (D-04, keeps the accessible name
  stable across the three-way swap). Subtitle `hidden md:block` (CA-05 omission below `md`). Footer
  note via `EtiquetaResponsiva` with all three bands genuinely distinct (mobile `Toca una categoría
  para editarla o eliminarla.`, tablet `Eliminar en uso: advertencia, transacciones a Sin
  categoría.`, desktop the long form) — **this is a non-interactive `<p>`, so D-04's `aria-label`
  rule does NOT apply**; its test queries the variant string directly (`getByText(...)`), never the
  paragraph's `textContent` (which in jsdom is all three variants concatenated).
  *Requirement*: `WCTM-02` (Nueva categoría full-width below tabs, completing `E-01`), `WCTM-03`
  (mobile footer note, 3-way), `WCTM-06` (Nueva categoría non-monotonic, subtitle omission).
  *Files*: `apps/web/src/components/configuracion/categorias/CategoriasPanel.tsx` (+ test).

- [x] 20. **RED, GREEN** — `CategoriaFila.tsx` (+ test): delete button className `cn(CLASE_BOTON_ICONO,
  'hidden md:inline-flex', …)` — **the added class MUST come second** (D-09's mechanical note):
  tailwind-merge treats `display` as one group, so `hidden` wins over `CLASE_BOTON_ICONO`'s
  `inline-flex` while the `md:` variant survives as a separate group; reversing the argument order
  silently produces a bare `inline-flex` with no test to catch it. Test asserts the className
  **contains** `hidden md:inline-flex` and does **not** contain a bare `inline-flex` — D-09's trap,
  explicitly pinned. `display:none` removes the control from the accessibility tree AND the tab
  order — CA-02's "exactly one delete path" guarantee is satisfied by CSS alone (D-08 correction to
  the proposal's risk table); what CSS cannot give is jsdom verification, which is Playwright's job
  (task 22).
  *Requirement*: `WCTM-03` (exactly one action control below `md`).
  *Files*: `apps/web/src/components/configuracion/categorias/CategoriaFila.tsx` (+ test).

- [x] 21. **RED, GREEN** — `PatronesSection.tsx` (+ test): three labels via `EtiquetaResponsiva`, all
  2-band (`tablet` omitted, since `WCTM-06`'s table marks tablet "(unchanged)" for these three):
  `Patrones de auto-categorización`→`Patrones`, `Agregar patrón`→`Agregar`, the zero-patterns note
  (`WCTG-06`)→`Sin patrones: solo asignación manual.` — text swap only, the "always rendered, not a
  zero-state" semantic is untouched (Q-05). `<h2 id="titulo-patrones">` gains `aria-label={escritorio
  string}` despite not being interactive, because `PatronesSection`'s `<section>` is named via
  `aria-labelledby` — an unstable heading name would silently rename the landmark (D-04's one
  exception to "only interactive controls get `aria-label`").
  *Requirement*: `WCTM-06` (Patrones heading, Agregar control, zero-patterns note).
  *Files*: `apps/web/src/components/configuracion/categorias/PatronesSection.tsx` (+ test).
  ⚠️ *Status history*: this task was first checked off `[x] RED, GREEN` with `(+ test)` while
  `PatronesSection.test.tsx` had a **zero-line diff** — the component shipped, the test did not.
  Both judgment-day judges caught it independently; Judge B proved it was a real gap rather than
  bookkeeping by removing the `<h2>`'s `aria-label` (the exact mechanism D-04 exists to protect)
  and watching all 10 existing tests stay green. Its two sibling tasks (19, 20) did get their
  dedicated mechanism tests. The tests landed in the fix round and are mutation-verified: dropping
  the `aria-label`, swapping `movil`/`escritorio` on either call site, or breaking the mobile note
  string each turn the suite red. **Reviewer note for the remaining tasks: a `[x]` plus a
  `RED, GREEN` marker is a claim, not evidence — `git diff -- <the named test file>` settles it.**

- [x] 22. **GREEN** — `e2e/list-surface.e2e.ts` (new): `E-01` completed (tabs one row **+** `Nueva
  categoría`'s width ≈ content band and its `y` > the tabs' `y`); `E-03` (360/880/1280: `Editar
  categoría {n}` visible at all three; `Eliminar categoría {n}` `toBeHidden()` at 360, visible at
  880/1280); `E-04` (360: the mobile footer note visible, the other two variants hidden); `E-09`
  (360/880/1280: for each of the six `WCTM-06` strings, the band's expected variant is visible and
  the others `toBeHidden()` — assert against **rendered/visible content at a real viewport, never
  className-literal presence**, the exact gap that shipped `WCTG-14` false).
  *Requirement*: `WCTM-02`, `WCTM-03`, `WCTM-06` (the acceptance layer for CA-01/CA-02/CA-05).
  *Files*: `apps/web/e2e/list-surface.e2e.ts` (new).

- [x] 23. **GREEN** — Verify zero files touched under `apps/api/**` and `apps/mobile/**` (task 8).

**Gates (PR #3)**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · `pnpm web test:e2e`
(`E-01`/`E-03`/`E-04`/`E-09` green) · task 23.

**PR #3 status (2026-08-14, sdd-apply): COMPLETE — tasks 18-23, all Gates green.**
`pnpm web typecheck` clean · `pnpm web lint` 0 errors (same 2 pre-existing warnings) ·
`pnpm web test` 100 files / 998 tests · `pnpm web test:e2e` 38 passed / 13 skipped (all of
`E-01`/`E-03`/`E-04`/`E-09` green) · `git diff --stat feat/us-063-pr2-tier... -- apps/api
apps/mobile` empty.

*Test count history*: this line read `995` while the branch had 5 commits. Two judgment-day
fix rounds then landed on top, and the count is now `998` — the 3 added tests are task 21's
missing `PatronesSection` mechanism coverage (see the status history on task 21).

**Judgment-day round 2 (2026-08-14) — one WARNING (real), reproduced and fixed.**
`@testing-library/jest-dom`'s `toHaveTextContent` matches by **substring** when given a
string literal, so an assertion reads as exact but passes on any superstring. Mutating
`CategoriasPanel.tsx`'s `tablet="Nueva"` → `tablet="Nueva categoría"` — collapsing the very
non-monotonic mapping `WCTM-06` singles out as the unusual, easy-to-get-wrong row — left all
24 tests green. A repo-wide sweep found the same trap in `EtiquetaResponsiva.test.tsx` (the
helper's OWN contract test) for both `Nueva` and `Agregar`: each band was compared against a
**prefix of its own long variant**. All anchored; the Playwright `E-09` layer already caught
this failure mode, so production behaviour was never wrong — the jsdom mechanism layer simply
was not load-bearing for it.
**Reviewer note**: prefer an anchored regex over a bare string whenever the expected text is
a prefix of another variant the same element could legitimately render.

---

## PR #4 — Edit surface (D-05/D-06 second call site, D-10, the `WCTM-05` gap fix)

*Depends on PR #3. The riskiest slice — it reorders a shipped footer whose every `disabled` condition
is judgment-day scar tissue (US-043). Reviewed unmixed.*

- [x] 24. **RED, GREEN** — `EditarCategoria.tsx` (+ test): the 3-level breadcrumb gains
  `hidden md:block` (stays visible ≥`md`, unchanged look at tablet/desktop); add `BotonVolver
  md:hidden` (`to="/configuracion/categorias"`, `label="Volver a Categorías"` — reused **verbatim**
  from the shipped error-state `<Link>` copy, D-05, not invented).
  *Requirement*: `WCTM-04` (the edit screen's breadcrumb is absent below `md`; back navigates to the
  list, regardless of history).
  *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (+ test).

- [x] 25. **RED, GREEN** — **Correction recorded in the re-slicing note above; spec wins over
  design §1.5.** `EditarCategoria.tsx`'s identity field grid: `grid-cols-1
  sm:grid-cols-[1fr_220px]` → `grid-cols-1 md:grid-cols-[1fr_220px]`. Arithmetic, verified against
  Tailwind's real scale (the check whose absence shipped `WCTG-14` and `WCFG-11` false — do not skip
  it here either):

  | Viewport | `sm`(640) active? | `md`(768) active? | Grid (after this task) | Satisfies |
  |---|---|---|---|---|
  | 360 | yes | no | `grid-cols-1` (stacked) | `WCTG-13`(b), unchanged |
  | 700 (the 640–767 gap) | yes | **no** | `grid-cols-1` (stacked) | **`WCTM-05` — the gap this task closes; `sm:` alone would wrongly render side-by-side here** |
  | 880 (T3) | yes | yes | `[1fr_220px]` (side-by-side) | `WCTG-14` scenario 2, **unaffected by this change** — 880 ≥ 768 holds regardless of which boundary is used |
  | 1280 | yes | yes | `[1fr_220px]` (side-by-side) | unchanged from shipped |

  Design §1.5 declined this move, claiming it "would break `WCTG-14`'s second scenario (side-by-side
  at 880)" — the table above shows that claim does not hold; moving the boundary raises the *floor*
  from 640 to 768, it does not remove 880 from the "at or above" side. Unit test updates the
  class-literal assertion from `sm:` to `md:`.
  *Requirement*: `WCTM-05` (Nombre/Bucket stack across the **full** mobile range, including
  640–767px — not only the 360px floor `WCTG-13` already covers).
  *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [x] 26. **GREEN** — `e2e/edit-surface.e2e.ts` (new), the 640–767px gap check: a dedicated test
  using `test.use({ viewport: { width: 700, height: 800 } })` — a one-off override, **not** a fourth
  named tier project (D-11's three projects remain the executable definition of D-01's tier) —
  asserting `Nombre`/`Bucket` have different `y` (stacked) at 700px. Neither of D-11's named widths
  (360, 880) falls inside 640–767, so without this test a regression there would go undetected —
  exactly what the spec (`WCTM-05`) flags explicitly.
  *Requirement*: `WCTM-05` (the 640–767px scenario).
  *Files*: `apps/web/e2e/edit-surface.e2e.ts` (new).

- [x] 27. **RED, GREEN** — `EditarCategoria.tsx`'s footer (+ test): reorder the DOM to `[Guardar,
  Cancelar]`, then `Eliminar categoría` (D-10 — CSS can reorder pixels, never tab order; D-09
  forbids duplicating the buttons, so some DOM/visual divergence is unavoidable and this design
  deliberately lands it on the **desktop** row, not the mobile stack). Outer `<footer>` gains
  `md:flex-row-reverse md:flex-wrap md:items-center md:justify-between`; the `Guardar`/`Cancelar`
  wrapper gains `flex flex-col gap-2 md:flex-row-reverse md:items-center`; `Guardar` gains `w-full
  md:w-auto`; `Cancelar` stays a text-style control. `Eliminar categoría` is **not** moved, resized,
  or given a separation rule (design's correction to the proposal's contradictory Success Criteria —
  §2's note wins). **Ships in the SAME task as task 28's `E-08` assertion** — reordering a footer
  without the assertion that pins the resulting order repeats the `WCTG-14` failure inside the change
  that exists to repair it. Every existing footer behavioural test (`form=` association, per-row
  pattern announcements, disambiguated accessible names) MUST still pass **unchanged** — a
  behavioural test needing an edit here is a signal this task's mechanism is wrong, not a chore; flag
  it instead of forcing it green.
  *Requirement*: `WCTM-05` (`Guardar` full-width above a text-style `Cancelar` below `md`;
  `Eliminar categoría` stays in the same footer).
  *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [x] 28. **GREEN** — `e2e/edit-surface.e2e.ts` additions: `E-06` (360/1280: edit screen —
  `nav[aria-label="Ruta de navegación"]` `toBeHidden()` at 360, visible at 1280; `Volver a
  Categorías` inversely); `E-08` (360/1280: footer — at 360, `Guardar`.y < `Cancelar`.y and
  `Guardar`'s width ≈ the content band; at 1280, `Guardar`/`Cancelar` share a `y` with `Cancelar`.x <
  `Guardar`.x — the desktop `flex-row-reverse` restoring the shipped visual order byte-for-byte).
  *Requirement*: `WCTM-04` (E-06), `WCTM-05` (E-08, D-10).
  *Files*: `apps/web/e2e/edit-surface.e2e.ts` (modify).

- [x] 29. **GREEN** — Verify zero files touched under `apps/api/**` and `apps/mobile/**` (task 8,
  final).

**Gates (PR #4)**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · `pnpm web test:e2e`
(`E-01`…`E-12` all green, zero `test.fail()` remaining anywhere in the suite) · task 29.

**PR #4 status (2026-08-14, sdd-apply): COMPLETE — tasks 24-29, all Gates green.**
`pnpm web typecheck` clean · `pnpm web lint` 0 errors (same 2 pre-existing warnings) ·
`pnpm web test` 100 files / 1005 tests · `pnpm web test:e2e` 45 passed / 21 skipped ·
**zero executable `test.fail()` anywhere in the suite** — the change closed its own `WCTG-14`
pin, which was the point of D-12's defect-commit. `git diff --name-only feat/us-063-pr3-labels..
-- apps/api apps/mobile perfil` empty. 6 commits on `feat/us-063-pr4-editar`.

**SC 2.5.8 product defect: CLOSED, not exempted.** Both `<Link>Volver a Categorías</Link>`
instances (the `query.isError` and `!categoria` branches) took the `Cancelar` footer pattern —
`rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold` — so the control now
clears 24×24 on its own geometry. Pinned by a Playwright test measuring `boundingBox()` at 360px
on the not-found state. `e2e/mobile-floor.e2e.ts`'s exemption logic was **not** touched: it still
exempts the breadcrumb only, structurally via `closest()`, never by text.

**Extension beyond the frozen spec — maintainer decision, 2026-08-14.** `NuevaCategoriaForm.tsx:69`
carried the same `sm:grid-cols-[1fr_220px]` as `EditarCategoria` and renders on the same surface
(inside `CategoriasPanel`). Task 25 moved only the edit screen's grid to `md:`, so between 640 and
767px this PR would have shipped the edit screen stacking while the create form did not — **a
divergence this PR itself introduced by fixing one of two identical grids.** `WCTM-05` names only
`EditarCategoria` and never mentions `NuevaCategoriaForm`; `design.md:371` names both. Spec wins
over design, so this is **not** "the spec required it" — it is a decision not to ship a
self-inflicted inconsistency in the chain's last PR. Recorded here so a future reader who checks
`WCTM-05` and finds no mention knows the code is deliberate, not orphaned.

*Also corrected while implementing*: `design.md` §1.5's claim that moving the grid to `md:` "would
break `WCTG-14`'s second scenario" is arithmetically false — `880 ≥ 768` holds regardless of
whether the boundary is `sm` or `md`. The re-slicing note above had already caught this; the
implementer re-derived the table independently rather than trusting the note, which is the
standard this change adopted after five arithmetic errors were found in its own plan layers.

---

## Product defect found by the harness — owned by PR #4

**`EditarCategoria`'s error and not-found states violate WCAG 2.2 AA SC 2.5.8.** Found during
judgment-day on PR #1, 2026-08-14; measured in a real browser at `{ width: 147.8, height: 20 }`.

`EditarCategoria.tsx:147,158` render `<Link to="/configuracion/categorias">Volver a Categorías</Link>`
as a **sibling** of a `<p>`, alone on its own line. It is a standalone back control with no
surrounding non-target text, so SC 2.5.8's *Inline* exception does **not** apply — that exception
covers targets "in a sentence, or whose size is otherwise constrained by the line-height of non-target
text", which the breadcrumb genuinely is (links separated by literal "/" within a path) and this is
not. At 20px tall it misses the 24×24 floor.

This is a **pre-existing defect shipped by US-043**, not introduced here. It went unseen because
`WCTG-13`'s manual pass was skipped and jsdom cannot measure geometry.

**A round-1 fix briefly exempted it by exact text match — that was wrong and has been reverted.**
Exempting it would have made the harness, this change's only acceptance layer, assert a compliance
that does not exist. `mobile-floor.e2e.ts` now exempts the breadcrumb only, structurally via
`closest()`, never by text.

**Consequence, deliberate**: no current spec reaches those branches, so nothing is red today. **The
first spec that renders the error/not-found state will fail `E-11`, and that failure is correct.**
PR #4 owns the edit surface — give the control real padding so it legitimately clears 24×24 (the
`Cancelar` pattern already in that footer). **Do not silence it by re-adding an exemption.**

---

## Prohibitions (carried from design §8, apply to every PR)

1. **Do not reorder the footer (task 27) in a PR that does not also carry `E-08` (task 28).**
2. **Do not "fix" `EditarCategoria`'s field grid boundary a second time** — task 25 already moves it
   to `md:`; do not touch it again in PR #3 or elsewhere.
3. **Do not touch `perfil/**`.** M1 is a verification scenario (`E-12`, task 16); a diff there means
   the "for free" claim was false and needs revisiting, not patching.
4. **Zero files under `apps/api/**` and `apps/mobile/**`**, re-verified as the last task of every PR
   (tasks 8/17/23/29).
5. **No `matchMedia`/`useMediaQuery` anywhere in this change** (D-08). If a task's own mechanism
   looks like it needs one, report it — do not add a second responsive model beside `md:`.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1030–1480 production / ≈2500–3550 total (×2.4, US-043's own calibration) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 (harness) → PR #2 (tier + chrome) → PR #3 (labels + list) → PR #4 (edit) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Playwright harness, CI job, `test.fail()`-committed defect | PR #1 | Base = tracker branch. Zero product dependency — safe to land alone |
| 2 | `md` tier, shared chrome, back control, `estilos.ts` move | PR #2 | Base = PR #1 branch. Repairs `WCTG-14`/`WCFG-11`; everything else sits on it |
| 3 | Responsive-label mechanism + list surface | PR #3 | Base = PR #2 branch. Helper + all six call sites land together |
| 4 | Edit surface: back control, field-grid gap fix, footer reorder | PR #4 | Base = PR #3 branch. Highest risk — footer reorder isolated with its own assertion |

| PR | Production (est.) | Total (est., ×2.4) | >400 total? | `size:exception`? |
|---|---:|---:|---|---|
| **#1** — Playwright harness | 250–400 | 600–950 | Yes | Likely — new tooling, config, CI, fixtures |
| **#2** — Tier + shared chrome | 180–280 | 430–670 | Yes (borderline) | Likely — grid repair + `BotonVolver` + `estilos.ts` move + `sr-only` h1 |
| **#3** — Labels + list surface | 350–450 | 840–1080 | Yes | Likely — a new typed helper + 3 modified components + 6 call sites + `E-09`'s six-string suite |
| **#4** — Edit surface | 280–380 | 670–910 | Yes | Likely — footer DOM reorder is high-risk, reviewed unmixed regardless of size |
| **Total** | **1030–1480** | **≈2500–3550** | | |

**Decision needed before apply**: Yes, per `delivery_strategy: ask-on-risk` — the orchestrator asks
before `sdd-apply` starts, per session-cached settings (already resolved: `feature-branch-chain`).

**Corollary risk restated**: if PR #1 is descoped, deferred, or merged without its `test:e2e` gate
enforced in CI, this change ships with **no acceptance layer at all** — CA-01…CA-05 remain
unverifiable claims exactly like `WCTG-13`/`WCTG-14` did after US-043 (archive-report debt 1, which
this change's harness is also meant to close via `E-07`/`E-10`/`E-11`).
