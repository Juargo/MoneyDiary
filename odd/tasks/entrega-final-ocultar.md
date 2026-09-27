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
- [ ] **T2** — Disable the pattern popup (web + mobile). Route: delegated direct, because it touches 2+ non-trivial files across two apps.
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

## Next step

T2.
