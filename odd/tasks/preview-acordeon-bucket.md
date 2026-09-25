# Feature: preview-acordeon-bucket

**Locator:** `odd/tasks/preview-acordeon-bucket.md` · Engram mirror: `odd/preview-acordeon-bucket/tasks` (via `engram save` CLI; MCP `mem_save` fails with ambiguous sessions)
**Branch:** `feat/preview-acordeon-bucket` (from `main` @ `5b1f49c5`)

## Objective

Turn the import preview (`PreviewMuestra`) grouping into a two-level accordion: level 1 = bucket, level 2 = category (with icon), rows inside each category.

## Problem / Why

Today every bucket · category is a flat list of groups. The user wants to see only the main buckets first and drill down.

## Decisions (user, 2026-09-25)

- Level 1 shows the 3 main buckets — Necesidades, Gustos (`Deseos`), Ahorro — plus **Ingreso as a 4th entry**. Ingreso has no category, so opening it shows its rows directly (no level 2).
- Opening a bucket reveals a second accordion: one entry per category with its icon (`IconoCategoriaBadge`) and row count; opening a category shows its rows, date-ascending.
- There is **no "Sin categoría" group**: since #778 the API always returns `sugerido` (never `null`), and every non-Ingreso row has a category (`Desconocido` of its bucket when no pattern matched) — verified in `apps/api/src/application/use-cases/preview-ingesta.use-case.ts:104-110`. The web's Sin-categoría branch is dead code and is removed.
- Unchanged from `preview-agrupacion-categoria`: grouping key = server suggestion (`sugerido`), an edited row stays in its group until the preview is re-run; icon from the client catalog.

## Assumptions (parent, not user-decided — revisit if wrong)

- Both levels start **collapsed** ("al presionar se despliegue"). Expansion state keyed by stable keys (bucket / clave), so it survives re-renders.
- Bucket header: UI label (`ETIQUETA_BUCKET`) + row count. Category header: icon + name + row count.
- Empty buckets (no rows) are not rendered.
- Focus continuity: if a re-run moves the focused row into a collapsed group, that bucket and category open so focus can land on its trigger.

## Scope

- In: `apps/web` — grouping domain fn, `PreviewMuestra`, affected unit tests (`PreviewMuestra`, `SubirCartola`, …), e2e that interact with preview rows (`crear-categoria-preview`, `preview-stress`, `subir-tal-cual`), `openspec/specs/web-import-preview/spec.md` (WEB-PRV-20).
- Out: API, mobile, `MuestraAgrupada` (read-only decision summary).

## Constraints

- TDD: **enabled** (source: `~/.claude/CLAUDE.md` "Strict TDD Mode: enabled"). Runner: `npx vitest run <file>` in `apps/web`; typecheck `npx tsc -b`; e2e `npx playwright test <file>` (stubbed API, no backend).
- Removing/hiding UI: search the literal copy and selectors across `apps/web/e2e/` (lesson from #808).

## Tasks

- [x] **T1 — Two-level grouping + accordion** · commit `36412668` · RDD assess (base `main`): high (`process_boundary` in e2e) → consent **granted** → 4-lens review **approved**, acknowledged (lineage `review-904b7227b77c8c16`). Advisory: W-null (R3/R4) rows with `sugerido: null` are silently dropped from the table but still counted in resumen/commit; W-stress (R2) stress fixture counts Desconocido rows as classified; S unknown bucket dropped; S duplicated FilaRevision render; S module name; S comment typo `abirGrupo`; S Ingreso focus path untested.
  - (route: delegated writer — 2+ non-trivial files + tests + e2e)
  - Domain: bucket → categories → rows structure (reuse `agrupar-filas-por-categoria-sugerida`), bucket order from `BUCKETS_ASIGNABLES` + Ingreso last; remove the Sin-categoría branch.
  - `PreviewMuestra`: nested accordion, both levels collapsed, stable keys, focus continuity into collapsed groups.
  - Update unit tests + e2e that reach rows (expand before interacting); spec WEB-PRV-20.
  - Checks: `tsc -b`, full vitest, eslint, the 3 preview e2e files locally.

- [x] **T2 — Review warnings 1–3** (route: delegated writer; user-authorized 2026-09-25)
  - Rows the accordion cannot place (`sugerido: null`, or a bucket outside Necesidades/Deseos/Ahorro/Ingreso) go to a trailing level-1 entry **"Revisar"** that exists only when such rows exist; opening it shows the rows directly (no level 2). Never visible in the normal flow.
  - Stress e2e fixture: classified/unclassified counts must not count Desconocido rows as classified.
  - Checks: `tsc -b`, full vitest, eslint, preview e2e locally.

## Acceptance criteria

- Level 1 shows only the present buckets among Necesidades, Gustos, Ahorro, Ingreso, in that order, all collapsed.
- Opening a bucket shows its categories (icon + name + count), collapsed; opening a category shows its rows by date; Ingreso shows rows directly.
- No "Sin categoría" group or code path remains in the web grouping.
- `tsc -b` 0, vitest green, eslint clean, preview e2e green locally.

## Progress / evidence

- 2026-09-25: created.
- 2026-09-25: T1 implemented, UNCOMMITTED (11 files, +1234/−544). Domain rewritten to `agruparFilasPorBucketYCategoria` (bucket → categorías, Ingreso `filasDirectas`; `sugerido: null` rows dropped; non-Ingreso `categoriaId: null` → "Categoría no disponible" under its bucket). **TDD deviation:** domain tests were written together with the implementation and first ran GREEN (20/20) — no observed RED for the domain layer. Component/integration: 31 failing tests after the rewrite → fixed to 0. Fixture default `unaFilaPreview().sugerido` changed from `null` to a real category (post-#778 reality); e2e stress fixture gets real `sugerido` on every row. Focus continuity expands both collapsed levels (ref-based two-phase effect). Headings: h4 bucket, h5 categoría. Writer: `tsc -b` 0; vitest 2266/2266; eslint clean; Playwright (crear-categoria-preview, preview-stress, subir-tal-cual) 7 passed / 5 skipped (by-design viewport skips) / 0 failed. Parent spot check: `tsc -b` 0; 4 touched test files 204/204.

- 2026-09-25: T2 implemented. Revisar entry as a discriminated union (`kind: 'revisar'`). RED domain 7 failed → GREEN 24/24; RED component 3 failed (crash reading `.categorias` on Revisar) → GREEN 33/33. W3: vitest excludes `e2e/**`, RED observed via `npx tsx` (`classified 278 / unclassified 8`) → GREEN (`94 / 192`, sum 300); fixture mirrors `estaClasificada` (alias not resolvable under `tsconfig.e2e.json`). Spec WEB-PRV-20: rule 9 + 3 scenarios (writer and parent edited concurrently; parent verified a single consistent result). Writer: `tsc -b` 0; vitest 2273/2273; eslint clean; Playwright 5 passed / 4 skipped / 0 failed. Parent spot check: `tsc -b` 0; 2 touched test files green.

## Delivery

- Forecast ~400–600 authored lines (test churn from collapsed default). Strategy `ask-on-risk`: actual +1234/−544 (11 files). No cohesive split (the domain rewrite replaces the function the component consumes; splitting e2e out leaves CI red). User chose (2026-09-25) **single PR with `size:exception`**.

## Next step

Push and open the PR and open the PR with `size:exception`.
