# Feature: preview-acordeon-sugerencias

**Locator:** `odd/tasks/preview-acordeon-sugerencias.md` · Engram mirror: `odd/preview-acordeon-sugerencias/tasks` (via `engram save` CLI)
**Branch:** `refactor/preview-acordeon-sugerencias` (from `main` @ `ec4630a1`)
**Origin:** advisory suggestions from the 4-lens review of `36412668` (lineage `review-904b7227b77c8c16`, PR #813).

## Objective

Close the four non-blocking suggestions left on the two-level preview accordion. No user-visible change.

## Tasks

- [x] **S1 — Deduplicate the row render** (`PreviewMuestra.tsx` ~466). The nine-prop `FilaRevision` element is written once per direct-rows panel (Ingreso, Revisar) and once per categoría panel; extract one local render helper. Also make the row count and the JSX pick "direct rows vs categorías" from the same discriminant (today `conteoBucket` uses `categorias.length` while the JSX uses `bucket === BUCKET_INGRESO`).
- [x] **S2 — Rename the domain module.** `agrupar-filas-por-categoria-sugerida.ts` (+ test) now exports `agruparFilasPorBucketYCategoria`; rename the files to match (e.g. `agrupar-filas-por-bucket-y-categoria.ts`) and update imports. Historical `odd/tasks` documents keep the old name (they record the past).
- [x] **S3 — Comment typo** `abirGrupo` → `abrirGrupo` (`SubirCartola.test.tsx:3611`).
- [x] **S4 — Test the Ingreso focus path.** Component tests: a re-run that moves the focused row into a collapsed Ingreso bucket expands only the bucket and focus lands on the trigger; the pending-focus ref is cleared when the focused row disappears from the preview (no stale refocus on a later render).

## Constraints

- TDD: **enabled** (`~/.claude/CLAUDE.md`). Runner `npx vitest run <file>` in `apps/web`; typecheck `npx tsc -b`.
- S1–S3 are refactors/renames covered by existing tests (GREEN before and after). S4 pins existing behavior, so its proof is a mutation (break the path → RED → restore → GREEN).

## Acceptance criteria

- `tsc -b` 0, full vitest green, eslint clean on touched files; no user-visible change.
- S4 has an observed mutation RED for each new test.

## Progress / evidence

- 2026-09-25: created.
- 2026-09-25: S1–S4 implemented (writer). S1: `renderFilaRevision` + `filasDirectasDeGrupo` as the single discriminant for count and JSX; PreviewMuestra tests 33 → 33 unchanged. S2: `git mv` to `agrupar-filas-por-bucket-y-categoria.{ts,test.ts}`, 2 import sites. S3: typo fixed. S4 finding: an Ingreso row never renders a "+" trigger (`esFilaIngreso` suppresses all controls), so "focus lands on the trigger in Ingreso" is unreachable; test (a) pins the reachable behavior — the bucket auto-expands with no categoría level. Mutation (a): neutralize `ubicarFila`'s `filasDirectas` branch → RED (`data-abierto` stayed "false"). Mutation (b): drop `pendingFocoRowIndexRef.current = null` → RED (focus stolen by a later row reusing rowIndex 0). Both restored. Writer: `tsc -b` 0; vitest 2275/2275; eslint clean. Parent spot check: `tsc -b` 0; 2 touched test files 59/59.

- 2026-09-25: commit `c0a56aa2`. RDD assess (base `main`): medium, `slice_budget_reached` (2122 lines counts the rename as delete+add; real diff +237/−45) → consent **granted** → 1-lens (reliability) review **approved**, acknowledged (lineage `review-3ab341d2741b996e`).

## Later work (not scheduled, user chose to ship as is)

- No test pins that a non-Ingreso bucket never has an empty `categorias` array, which the new `filasDirectasDeGrupo` discriminant relies on (`PreviewMuestra.tsx:102-107`).
- The Ingreso test asserts "no categoría level" via the absence of an `h5`; a `data-` attribute on categoría panels would be sturdier (`PreviewMuestra.test.tsx:1136-1138`).

## Delivery

- Forecast well under 400 authored lines → single PR.

## Next step

PR open; merge after CI.
