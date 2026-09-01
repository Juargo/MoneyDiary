# Archive Report: Create a categoría (with patrones) from the upload preview

**Change**: `crear-categoria-desde-preview`  
**Status**: COMPLETE & DEPLOYED  
**Archived**: 2026-08-31  
**Artifact Store**: hybrid (engram + openspec files)

---

## Executive Summary

Feature complete: the preview → create-categoría → re-evaluate → commit flow is live. Users can now click "+" next to a preview row's categoría select to create a new categoría with patrones in one atomic call, adopt it on the originating row, and immediately see the new patrones applied to every other matching row before committing — closing the "abandon preview, create category, re-upload file, redo all overrides" loop.

All four chained PRs (#534 API, #535 client seam, #536 preview UI, #537 orchestration) merged to main (commit `404e6a85`). Two CRITICAL defects caught by fresh review during verification were fixed post-initially-green and included in the final PR #537 merge.

---

## What Shipped

### Capabilities Modified

- **`catalogo-clasificacion-ownership`**: `POST /api/categorias` now accepts optional `patrones[]` created atomically with the categoría in one transaction (CAT038-10, CAT038-11, CAT038-12).
- **`web-import-preview`**: preview rows now show a "+" control (bucket-gated, demo-disabled) to create a categoría in-place, with an inline form supporting patrones editing, atomic creation, and preview re-evaluation (WEB-PRV-12 through WEB-PRV-18).

### Merged PRs

| # | Slice | Branch | Commits | Status |
|---|-------|--------|---------|--------|
| #534 | API: atomic nested-patrones create + indexed errors + contract regen | `feat/categorias-patrones-atomico` | 4ce68853, e39e4a80, 0db20cb9, d58c1ff6, 9970f662, cf55caf3, a346fb72, d79c41e3 (merge acc97bad) | Merged 2026-08-31 |
| #535 | Web client seam: generated types + postCategoria returns CategoriaDto + cache seeding | `feat/web-catalogo-client-seam` | 47b4a6ce, 3c2b5a33, 6d765e58, 2ba7f5d1 (merge 1f3a4dd5) | Merged 2026-08-31 |
| #536 | Preview UI: "+" trigger, inline form, row adopts categoría (no re-run) | `feat/preview-nueva-categoria-ui` | 3ebc8225, 5528416c, f617e8d0, c7009743, b875d7ef (merge 2d5d6756) | Merged 2026-08-31 |
| #537 | Orchestration: previewData hoist, re-run, diff announcement, e2e | `feat/preview-reevaluacion` | cfe303b8, bc6b568f, 13a1cdaa, bee91991, d7d7c920 (merge e4a786b5) | Merged 2026-08-31 |

### Test Coverage at Merge

- **Backend (API)**: `pnpm api test` → all unit + integration specs green; `pnpm api exec tsc --noEmit` clean.
- **Frontend (Web)**:
  - Unit: `pnpm web test` → **1726 tests** across **138 files** (1717 pre-existing + 9 new).
  - Type safety: `pnpm web typecheck` clean.
  - Lint: `pnpm web lint` clean.
  - E2E: `pnpm web test:e2e` → **72 passed**, 69 pre-existing viewport skips, **0 failed** (new `crear-categoria-preview.e2e.ts` passes on movil + escritorio).

### Verification Findings

**Fresh-review audit (sdd-verify phase)** ran all four commands listed above. Verdict: **PARTIAL** — defects were found despite command green:

#### CRITICAL-1: Stale Live-Region Message on Commit Success

**Issue**: `mensajeOverride` state (set during re-evaluation announcement) is never cleared when the user commits the preview. The primary `role="status"` region always renders `mensajeEstado = mensajeOverride ?? MENSAJE_POR_ESTADO[estado]`, so the stale "«X» se aplicó a N filas más." announcement persists through the `committing` → `exito` state transition, silently swallowing "Subiendo transacciones…" and "Importación completada." messages.

**Root Cause**: `handleConfirmar` (line 599–630) never calls `setMensajeOverride(null)`. No test verifies the "Importación completada" text in `SubirCartola.test.tsx`.

**Fix** (merged in `d7d7c920`): Added `setMensajeOverride(null)` in `commitMutation.onSuccess`.

#### CRITICAL-2: Double Live Region on Re-run Failure (D-13)

**Issue**: When a preview re-run fails after a successful categoría creation, two separate `role="status"` nodes exist in the DOM simultaneously: the primary region (:959) and the D-13 failure notice (:1104). Screen readers announce both, creating a confusing double-announcement exactly as design.md D-12 explicitly rejected.

**Root Cause**: The test (SubirCartola.test.tsx:3292, labeled "4.5/D-13") remocked the mutation hook's return value directly (`isError: true`) instead of invoking the real `onError` callback that the component registers via `previewMutation.mutate(archivo, {onSuccess, onError})`. This bypassed the production code path and gave false confidence.

**Fix** (merged in `d7d7c920`): 
1. Removed `role="status"` from the failure notice; changed to plain visible text (no live region).
2. Extended the test to invoke the real `onError()` callback, exposing the defect and confirming the fix.

#### WARNING: "+" Trigger Not Disabled During Re-evaluation

**Issue** (low likelihood): The "+" trigger button in `FilaRevision` does not disable during `reevaluando`, unlike "Agregar transacciones" and "Descartar". A fast user could fire overlapping `previewMutation.mutate()` calls.

**Recommendation**: Follow-up ticket to add `disabled={reevaluando}` to the "+" trigger.

---

## Notable Process Findings

### Test Double Gap

Tests that mock a hook's return value directly (e.g., `isError: true`) without invoking the captured callback (e.g., `onError()`) silently skip the exact code path they're meant to prove. The pattern that caught this: compare how the test invokes sibling operations — `handleCategoriaCreada` correctly invokes `opciones.onSuccess(...)` in the success case but the failure test only flipped the flag.

### Stale Test Doubles in TypeScript

PR1's API tests included manually-written test doubles for the new `validarPatron` function. The doubles encoded the validation logic inline. When the actual implementation was written, a small difference in order of operations (demo gate → nombre/bucket → patrones, vs. patrones → nombre) went unnoticed in vitest (which transpiles without typechecking). Only `pnpm api exec tsc --noEmit` (the exact CI command) caught the stale double by type-signature mismatch. Decision: vitest coverage alone is insufficient for refactors; always `tsc --noEmit` as part of local apply verification, not just CI.

---

## Blocked Deliverables

None. All planned slices shipped.

---

## Risks & Technical Debt

**Resolved**:
- **rowIndex stability** (blocker, design D-07): Proved by T-01 (`apps/api/test/preview-rowindex-estable.spec.ts`) — parsing the same file bytes twice yields identical `rowIndex` ↔ row mappings across empty and non-empty catalogs, Excel and PDF.

**Deferred (follow-up tickets)**:
- #331 / US-062: Retroactive reclassification of already-committed transactions (not in-flight preview rows).
- Re-evaluate motion: auto-refresh of persisted catalog on other devices (not in scope; session-scoped only).
- "+" trigger accessibility: disable during re-evaluation to prevent overlapping preview calls (low likelihood but best-practice guard).

---

## Artifact Traceability

| Topic Key | Source |
|-----------|--------|
| `sdd/crear-categoria-desde-preview/proposal` | sdd/crear-categoria-desde-preview/proposal.md |
| `sdd/crear-categoria-desde-preview/spec` | sdd/crear-categoria-desde-preview/specs/catalogo-clasificacion-ownership/spec.md + web-import-preview/spec.md |
| `sdd/crear-categoria-desde-preview/design` | sdd/crear-categoria-desde-preview/design.md |
| `sdd/crear-categoria-desde-preview/tasks` | sdd/crear-categoria-desde-preview/tasks.md |
| `sdd/crear-categoria-desde-preview/apply-progress` | Engram #1142 (full session trace of all 4 PR implementations + fresh-review fixes) |
| `sdd/crear-categoria-desde-preview/verify-report` | Engram #1143 (fresh-review findings) |
| `sdd/crear-categoria-desde-preview/archive-report` | This file (merged specs + artifact traceability) |

---

## Canonical Spec Merges

Delta specs (CAT038-10/11/12, WEB-PRV-12–18) have been folded into:
- `openspec/specs/catalogo-clasificacion-ownership/spec.md` (lines 543–726)
- `openspec/specs/web-import-preview/spec.md` (lines 305–352 + testing emphasis section)

All requirements maintain exact numbering and wording from the deltas for audit continuity.
