# Feature: resumen-acordeon-bucket

**Locator:** `odd/tasks/resumen-acordeon-bucket.md` · Engram mirror: `odd/resumen-acordeon-bucket/tasks` (via `engram save` CLI)
**Branch:** `feat/resumen-acordeon-bucket` (from `main` @ `5ec7d970`)

## Objective

The read-only decision-step summary (`MuestraAgrupada`, "Movimientos por categoría", shown right after upload next to "Subir tal cual" / "Revisar y editar") uses the same two-level accordion as the editable table: bucket → categoría with icon → rows.

## Problem / Why

`preview-acordeon-bucket` (#813) changed only the editable table (`PreviewMuestra`). The user looks at the summary first and still sees the flat "Bucket · Categoría" list with no icons. The parent excluded `MuestraAgrupada` from scope in three features without asking which screen the user meant — scope error acknowledged 2026-09-26.

## Decisions (user, 2026-09-26)

- The summary uses the two-level accordion too (not removed).

## Assumptions (parent — revisit if wrong)

- Same shape and order as `PreviewMuestra`: Necesidades, Gustos, Ahorro, Ingreso (rows direct), then "Revisar" (unplaceable rows, only when needed); both levels collapsed; category header with icon + name + count; rows by date. Reuse `agruparFilasPorBucketYCategoria` (DRY).
- Status quo kept for duplicates: the summary keeps a separate trailing level-1 entry "Duplicadas (no se importan)" with its rows direct (they are not imported, WEB-PRV-19). Duplicates are excluded from the bucket groups here.
- The summary stays read-only: no selects, no "+" trigger.
- The old summary-only grouping module (`agrupar-preview-por-categoria.ts`) is removed if nothing else uses it.

## Scope

- In: `MuestraAgrupada.tsx` (+ test), domain reuse/removal, `SubirCartola.test.tsx` assertions on the summary, `e2e/subir-tal-cual.e2e.ts`, `openspec/specs/web-import-preview/spec.md` (WEB-PRV-19).
- Out: API, mobile (its own spec references the old module only in prose — check), `PreviewMuestra`.

## Constraints

- TDD: **enabled** (`~/.claude/CLAUDE.md`). Runner `npx vitest run <file>` in `apps/web`; typecheck `npx tsc -b`; e2e `npx playwright test <file>`.
- Removing/hiding UI: search the literal copy and selectors across `apps/web/e2e/`.

## Tasks

- [x] **T1 — Two-level accordion in the summary** (route: delegated writer).

## Acceptance criteria

- Summary level 1 shows the present buckets (+ Ingreso, Revisar, Duplicadas when present), collapsed; opening a bucket shows categorías with icon + count; opening one shows its rows (read-only) by date.
- `tsc -b` 0, vitest green, eslint clean, `subir-tal-cual` e2e green locally.

## Progress / evidence

- 2026-09-26: created.
- 2026-09-26: T1 implemented (writer). `MuestraAgrupada` rewritten as a two-level read-only accordion reusing `agruparFilasPorBucketYCategoria` (non-duplicates) + trailing "Duplicadas (no se importan)" (rows direct); `compararFilas` exported for reuse. h3 → h4 (level 1) → h5 (categoría + `IconoCategoriaBadge`). No shared chrome with `PreviewMuestra` (its header is entangled with focus continuity and inline creation). Old `agrupar-preview-por-categoria.ts` (+12 tests) removed — no other importer. Behavior change: the summary's "Sin clasificar" and top-level "Categoría no disponible" groups are gone; unresolved ids nest under their real bucket, unplaceable rows go to "Revisar" (matches WEB-PRV-20). RED: new test file against old component 5 failed / 5 passed → GREEN 10/10. Spec WEB-PRV-19 rewritten; mobile spec wording fixed (dead path). e2e unaffected (subir-tal-cual asserts no group labels; the other two act after "Revisar y editar"). Writer: tsc -b 0; vitest 2272/2272 (2280 − 12 removed + 4 new); eslint clean; Playwright 7 passed / 5 skipped / 0 failed. Parent spot check: tsc -b 0; MuestraAgrupada + SubirCartola tests 114/114.

- 2026-09-26: commit `5dbe4ba1`. RDD assess (base `main`): medium, `slice_budget_reached` → consent **granted** → 1-lens (reliability) review **approved**, acknowledged (lineage `review-c8a5d1ac9e9b32d9`). W (direct rows dropped for an asignable bucket) already covered by the domain invariant test from #815. S (no component test for the "Categoría no disponible" fallback) fixed: `it.each` over loading / error / stale id — pinned GREEN, mutation (hide the badge for the fallback) → 3 RED, restored → GREEN. Spec WEB-PRV-19 corrected to the real behavior: fallback shows the generic glyph (not "no icon") and sorts alphabetically with the other categorías (same as WEB-PRV-20), not last. Checks: tsc -b 0; vitest 2275/2275; eslint clean.

## Delivery

- Actual +541/−701 (mostly the removed summary-only module and its tests); no cohesive split. User chose (2026-09-26) single PR with `size:exception`.

## Next step

PR open with `size:exception`; merge after CI.
