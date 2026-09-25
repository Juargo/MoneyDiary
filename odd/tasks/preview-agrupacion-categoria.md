# Feature: preview-agrupacion-categoria

**Locator:** `odd/tasks/preview-agrupacion-categoria.md` · Engram mirror: `odd/preview-agrupacion-categoria/tasks`
**Branch:** `feature/design-subir`
**Mirror status:** PENDING — `mem_save` failed 2026-09-25 (multiple active runtime sessions match the project); resync when available.

## Objective

1. Make the preview UI removals already on this branch (commit `0f462ef8`) definitive: delete the commented-out code instead of leaving it commented, remove the dead state it leaves behind, and realign tests, specs and e2e.
2. Group the import preview rows (`PreviewMuestra`) by **bucket · category** with the category icon, rows ordered by date inside each group.

## Problem / Why

- `0f462ef8` commented out ~150 lines (row selection, bulk toolbar, "Solo sin clasificar" filter, progress readout, column header, helper copy). State that fed them is still alive (dead code), `tsc -b` fails (6 errors in `FilaRevision.test.tsx`) and 55 web tests are red.
- A `{/* <div data-columnas-header` comment is closed by a later comment's `*/}` — works by accident.
- New copy in `ResumenCartola.tsx` says "Deseos-Desconocido"; the UI label for the `Deseos` bucket is "Gustos" (`lib/bucket-colors.ts:57`).
- The user wants rows grouped by what they are (bucket · category), not by date.

## Decisions (user, 2026-09-25)

- All removals in `0f462ef8` are **definitive** (no flag, no revival).
- Grouping key = the **server suggestion** (`sugerido`), NOT the merged edit. A row whose category the user edits **stays in its original group** until the preview is reloaded/re-run. Stable by construction; no focus loss.
- Icon resolved client-side from the catalog (`CategoriaDto.icono`, already on the wire) — **no API change**. Fallback via `IconoCategoriaBadge` / `iconoCategoria()` (null/unknown → `Tag`, ADR-045).

## Scope

- In: `apps/web` (`PreviewMuestra.tsx`, `FilaRevision.tsx`, `ResumenCartola.tsx`, `domain/clasificacion-preview.ts`, their tests, a new pure grouping function in `apps/web/src/domain/`), `apps/web/e2e/preview-stress.e2e.ts`, `openspec/specs/web-import-preview/spec.md`.
- Out: API, mobile, `MuestraAgrupada` (read-only decision summary), commit/PR delivery.

## Constraints

- TDD: **enabled** (source: `~/.claude/CLAUDE.md` "Strict TDD Mode: enabled"). Runner: `vitest` in `apps/web` (`npx vitest run <file>`); typecheck `npx tsc -b` (NOT `tsc --noEmit`, solution-style tsconfig).
- Frontend never imports API domain (ADR-005/008). UI copy in Spanish (existing product language); code identifiers follow repo conventions.
- ~400 authored lines per task is advisory only.

## Tasks

- [ ] **T1 — Make removals definitive** (route: delegated writer — 2+ non-trivial files + test files)
  - Delete commented blocks in `PreviewMuestra.tsx` / `FilaRevision.tsx` (incl. the borrowed-close column-header comment).
  - Remove dead state/handlers: `seleccionados`, bulk toolbar + `handleAplicarBulk` + `categoriaToolbar`, `soloSinClasificar`/`cambiarFiltro`, filtered-empty state, `CheckboxIndeterminado`, `esFilaSeleccionable` (+ its tests) if unused; obsolete docblock paragraphs.
  - Delete tests asserting removed behavior; fix `FilaRevision.test.tsx` props.
  - Copy fix: "Gustos · Desconocido" in `ResumenCartola.tsx` (+ test).
  - Adjust `e2e/preview-stress.e2e.ts` (filter + "N de M clasificadas" steps).
  - Update `openspec/specs/web-import-preview/spec.md` WEB-PRV-16 (drop the progress-readout clause).
  - Checks: `npx tsc -b`, `npx vitest run`, eslint on touched files.
- [ ] **T2 — Group preview by bucket · category with icon** (route: delegated writer)
  - RED: unit tests for a pure `agruparPreviewPorCategoria` in `apps/web/src/domain/` — key from `sugerido` (bucket + categoriaId), rows date-ordered (stable by `rowIndex`), deterministic group order, Ingreso and no-suggestion rows handled, edits do NOT move rows.
  - RED: `PreviewMuestra.test.tsx` — group header shows icon + "Bucket · Categoría" + count; editing a row keeps it in its group; accordion keys stable.
  - GREEN/REFACTOR: replace `agruparPorFecha`.
  - Spec: add/modify requirement in `web-import-preview/spec.md`.
  - Checks: `npx tsc -b`, `npx vitest run`, eslint.

## Acceptance criteria

- `tsc -b` exit 0, full web vitest green, eslint clean on touched files.
- No commented-out code or unreachable UI state left from `0f462ef8`.
- Preview shows one accordion group per bucket · category with its icon; rows inside sorted by date; editing a row's category does not move it.

## Progress / evidence

- 2026-09-25: baseline — `tsc -b` 6 errors (`FilaRevision.test.tsx`), vitest 55 failed / 2244 passed, eslint clean.
- 2026-09-25: T1 implemented, UNCOMMITTED (10 files, +290/−2538, mostly deleted tests). Writer: `tsc -b` exit 0; vitest 2240 passed / 0 failed; eslint clean. ResumenCartola copy test RED (1 failed) → GREEN (6/6). Parent spot check: `tsc -b` exit 0; 4 touched test files 86/86 passed; no commented-out leftovers (rg). Judgment calls: `esFilaSeleccionable` deleted (no prod caller); `estaClasificada` kept (SubirCartola); accordion tests rewired to `toBeVisible()`; e2e select-all/bulk block also removed. Waiting on delivery strategy before commit.

## Delivery

- Forecast: T1 is deletion-heavy (likely >400 authored lines, mostly removed tests); T2 ~300–400. Strategy: `ask-on-risk` → user chose **`stacked-to-main`** (2026-09-25).
- Slice 1 (PR 1 → `main`): `0f462ef8` + T1 commit.
- Slice 2 (PR 2 stacked on PR 1): T2 commit(s).

## Next step

T1.
