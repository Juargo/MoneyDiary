# Feature: entrega-final-ocultar

## Objective

For the final project delivery, hide two features without deleting their code, so they can be re-enabled later.

## Problem / Why

The user wants the delivered product to leave out manual transaction entry and the "save this reclassification as a pattern" popup for now. Both are explicit user decisions made on 2026-09-27.

## Scope

- **T1 (#825):** hide manual transaction entry in `apps/web`.
  - Remove the "Registrar" nav item, the `/registrar` route and the Help link.
  - Keep `RegistrarMovimientoForm`, its hook, its API client and their tests in the codebase.
  - Update `openspec/specs/web-registro-manual/spec.md` (WEB-REG-01).
- **T2 (#826):** disable the pattern-offer popup (#745) in `apps/web` and `apps/mobile`.
  - Comment out its trigger and render sites.
  - Keep `OfrecerPatronControl` / `OfrecerPatronMobileControl` and the shared `useCrearPatron` / `crearPatron` API.

## Constraints

- The API (`POST /api/movimientos`, `POST /api/patrones`) is untouched.
- `/subir` is untouched.
- The Configuración pattern editor must keep working.
- Strict TDD (source: `sdd-init/moneydiary`, `strict_tdd: true`). Runners:
  - web: `pnpm web test`
  - mobile: `pnpm --filter @moneydiary/mobile test`

## Delivery

- One branch (`feat/entrega-final-ocultar`), one work-unit commit per task, and one PR that closes #825 and #826.
- Forecast: about 200 authored changed lines. Strategy: ask-on-risk; no split expected.

## Tasks

- [x] **T1** — Hide manual entry (web). Route: delegated direct, because it is 2+ non-trivial files (nav-items, AyudaPage, route, tests, spec).
  - RED: `BottomTabs` asserts 4 tabs without "Registrar"; `AyudaPage` asserts no `/registrar` link.
  - Checks:
    - `pnpm web test`
    - `pnpm --filter @moneydiary/web exec tsc -b`
    - `pnpm web lint`
    - `pnpm web test:e2e`
- [x] **T2** — Disable the pattern popup (web + mobile). Route: delegated direct, because it touches 2+ non-trivial files across two apps.
  - RED: after a successful reclassify, no "Crear patrón" offer appears (web `ReclasificarCategoriaControl`, mobile `BucketDetalleScreen`).
  - Checks:
    - web suite
    - mobile suite
    - `tsc` for both apps
    - lint for both apps

## Acceptance criteria

See #825 and #826.

## Progress

- 2026-09-27: issues #825 and #826 created; branch `feat/entrega-final-ocultar` created off `b31965ae`.
- 2026-09-27: T1 done, commit `2f0efc0452896db839ca177f24ba10cb6c02f8b7` on `feat/entrega-final-ocultar`.
  - RED confirmed first: `BottomTabs.test.tsx` (4-tab assertion + no-"Registrar" link) and
    `AyudaPage.test.tsx` (3-task assertion + no-"/registrar" link) failed as expected before
    any source change (3 failing tests, rest of suite green).
  - Removed the "Registrar" `NAV_ITEMS` entry (and now-unused `PencilLine` import), deleted
    `routes/_authenticated/registrar.tsx`, regenerated `routeTree.gen.ts` via `tsr generate`
    (gitignored, not committed), removed the "Registrar movimiento" link from `AyudaPage.tsx`,
    and removed the `/registrar` sentinel from `test/router-harness.tsx` (no remaining consumer).
    Added a top-of-file note to `RegistrarMovimientoForm.tsx` documenting it is intentionally
    unrouted (#825) and how to re-enable it. Updated `openspec/specs/web-registro-manual/spec.md`
    (WEB-REG-01 marked suspended, status line, footer consumer note).
  - `rg -n "/registrar|'Registrar'" apps/web/src apps/web/e2e` confirmed the only remaining
    hits are in the kept form/hook/API-client files and their tests, plus an unrelated
    `registrar()` helper function in `preview-stress.e2e.ts`.
  - Checks observed: `pnpm web test` → 162 files / 2275 tests passed. `pnpm --filter
    @moneydiary/web exec tsc -b` → clean, no errors. `pnpm web lint` → clean, no errors.
    `pnpm web test:e2e` (movil/tablet/escritorio projects) → 157 passed, 56 skipped
    (pre-existing skips, unrelated to this change), 0 failed.
  - Pre-commit hook ran `eslint --fix` on staged files as part of lint-staged; diffed the
    pre-hook backup stash against the final commit and confirmed it made zero additional
    changes beyond what was already staged.

- 2026-09-27: T2 done, commit `1e0113cfe4be312ec31270f49ab557d17bae6a9f` on
  `feat/entrega-final-ocultar`.
  - RED confirmed first, against unmodified production source: a new web test
    in `ReclasificarCategoriaControl.test.tsx` ("no pattern offer appears")
    failed (found the "próximas cartolas" text); a new mobile test in
    `ReclasificarMobileControl.spec.tsx` ("never calls onOfrecerPatron")
    failed (`onOfrecerPatron` was called); a new mobile test in
    `BucketDetalleScreen.spec.tsx` ("does NOT offer to create a pattern")
    failed (found `testID="ofrecer-patron"`).
  - Web: in `ReclasificarCategoriaControl.tsx`, commented out the
    `OfrecerPatronControl` import, the `ofrecerPatron`/`setOfrecerPatron`
    state, all three `setOfrecerPatron(...)` call sites (commit's onSuccess,
    `alCambiar`, `abrirCreacion`), and the offer's render block — each with a
    `// Disabled for now (#826)...` marker. `onPatronCreado` stays in the
    prop's inline type (so `GrupoMovimientos`/`BucketDetalleMesPage` keep
    threading it unchanged) but is no longer destructured, since web's
    `@typescript-eslint/no-unused-vars` (`argsIgnorePattern: '^_'`, error
    level) flags an unused destructured prop — verified empirically with a
    throwaway scratch file before relying on it. No changes were needed in
    `GrupoMovimientos.tsx`/`BucketDetalleMesPage.tsx`: the only real
    trigger/render lived in `ReclasificarCategoriaControl`, so the prop
    plumbing stays dead-but-harmless.
  - Mobile: in `ReclasificarMobileControl.tsx`, commented out the
    `onOfrecerPatron({...})` call inside `commit()`. In
    `BucketDetalleScreen.tsx`, commented out the `OfrecerPatronMobileControl`
    import and the `ofrecerPatronOverlay` JSX block, hardcoding
    `ofrecerPatronOverlay = null`. Confirmed mobile's
    `@typescript-eslint/no-unused-vars` is `warn`-level with `args: 'none'`
    (eslint-config-expo), so the now-unused `onOfrecerPatron` param and the
    `ofrecerPatron`/`handlePatronCreado` leftovers produce only warnings
    (0 errors, `pnpm --filter @moneydiary/mobile lint` exits 0) — left as
    dead-but-harmless per the task's "minimal disable point" guidance rather
    than chasing warning-level noise.
  - Pre-existing tests marked `it.skip`/`describe.skip` with
    `// Disabled for now (#826) — re-enable with the pattern offer.`:
    5 tests in `ReclasificarCategoriaControl.test.tsx` (issue #745 section),
    1 in `BucketDetalleMesPage.test.tsx`, 1 in `GrupoMovimientos.test.tsx`,
    the `onOfrecerPatron (issue #745)` describe (3 tests) in
    `ReclasificarMobileControl.spec.tsx`, and the
    `OfrecerPatronMobileControl integration (issue #745)` describe (5 tests)
    in `BucketDetalleScreen.spec.tsx`. `OfrecerPatronControl.test.tsx` and
    `OfrecerPatronMobileControl.spec.tsx` were left untouched and still run.
  - `rg -n "Crear patrón|Ahora no|próximas cartolas" apps/web/e2e` found
    nothing — no e2e assertion of the offer's copy needed updating.
  - Checks observed:
    - `pnpm web test` → 162 files / 2269 passed, 7 skipped, 0 failed.
    - `pnpm --filter @moneydiary/web exec tsc -b` → clean, no errors.
    - `pnpm web lint` → clean, no errors.
    - `pnpm --filter @moneydiary/mobile test` → 92 suites / 1022 passed,
      8 skipped, 0 failed.
    - `pnpm --filter @moneydiary/mobile exec tsc --noEmit` → clean, no errors.
    - `pnpm --filter @moneydiary/mobile lint` → 0 errors, 4 warnings (2
      pre-existing `no-require-imports` warnings in
      `BucketDetalleScreen.spec.tsx`, unrelated to this change; 2 new
      `no-unused-vars` warnings — `ofrecerPatron`/`handlePatronCreado` in
      `BucketDetalleScreen.tsx` — accepted as dead-but-harmless, see above).
  - Reclassification itself and its "Movida a…" announcement (#749) still
    pass in both apps' full suites (not touched by this change).
  - Pre-commit hook ran `eslint --fix` on staged files (same as T1); diffed
    the resulting commit against the pre-hook edits and confirmed no
    unexpected changes beyond what was staged.

## Next step

None — both T1 and T2 are done. Ready for the PR closing #825 and #826
(per Delivery: one PR for both tasks; not opened yet — pushing/PR creation
is the user's call).
