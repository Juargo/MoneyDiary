# Archive Report — us-055-web-reclasificar-mes-bucket

**Status**: ARCHIVED
**Date**: 2026-08-20
**Change**: us-055-web-reclasificar-mes-bucket (US-055, issue #289, Sprint-15)
**Branch**: `docs/archive-us-055` (base: `main` after #440 merges — the final test-pin PR)
**Mode**: hybrid (openspec filesystem + Engram)

## What Was Archived

| Artifact | Location | Complete |
|----------|----------|----------|
| Proposal | Engram obs #879 (`US-055 proposal — judgment-day fixes applied`) | ✅ |
| Delta specs | `specs/web-app/spec.md` (this change folder) | ✅ |
| Design | Engram obs #881 (`US-055 design — judgment-day fixes applied`) | ✅ |
| Tasks | Engram obs #883 (`sdd/us-055-web-reclasificar-mes-bucket/tasks`) | ✅ 9/9 tasks complete (T-09 deferred to archive-time by design) |
| Verify report | Engram obs #887 (`sdd/us-055-web-reclasificar-mes-bucket/verify-report`) | ✅ PASS-WITH-WARNINGS |

---

## Verify Outcome

**Verdict**: PASS-WITH-WARNINGS at `main` @ `d87c5927` — 1208/1208 unit tests pass, 67/67 e2e tests pass,
tsc clean. 2 findings (W-01 and S-01) are closed by PR #440 (test-pin merging at archive time).

**Suite results at archive:**

| Suite | Result |
|-------|--------|
| Unit + integration | 113 files, 1208 tests — all passed |
| TypeScript | 0 errors |
| ESLint | 0 errors; 1 warning (pre-existing `EliminarIngestaControl.tsx:128`, unrelated to US-055) |
| e2e (Playwright) | 67 passed, 65 skipped (pre-existing, unrelated to US-055) |

**Findings and closure status:**

| ID | Severity | Finding | Closed by |
|----|----------|---------|-----------|
| W-01 | WARNING | `focus-return-to-select` after cancel/Escape not asserted in unit tests — behavior implemented (`cancelar()` calls `selectRef.current?.focus()`) but `document.activeElement === select` not verified | PR #440 (test-pin) |
| S-01 | SUGGESTION | Pattern-mutation exclusion test relies on exact-array form rather than an explicit `not-called` assertion — compliant but spec phrasing was ambiguous | PR #440 (test-pin) |

No CRITICAL findings. Archive proceeds without blockers.

---

## Judgment-Day Highlights

### Planning gate (before PR #439 code PR)

Two issues caught at the planning / JD phase before any code was written:

1. **WDM-08 ID collision**: the delta spec originally proposed adding the new category-CRUD requirement
   as `WDM-08`, but the living spec already had a `WDM-08` (ADR-024 marker arithmetic). The collision
   was caught during the design review; the new requirement was renumbered `WDM-09` and slotted after
   `WDM-08`, preserving the existing requirement without a rename.

2. **False toast semantics**: an early design iteration proposed using a shadcn `sonner`/Toaster for the
   cross-bucket move announcement. JD review caught that a toast widget carries auto-dismiss semantics
   (fires and disappears), which conflicts with the spec's persistence requirement (the announcement
   must persist until replaced by a subsequent move or page unmount). The decision settled on a
   page-owned `role="status"` region (`BucketDetalleMesPage` `anuncio` state), avoiding a dependency
   and correctly expressing the persistence contract. Recorded as design D-07.

### Code gate (PR #439)

1. **Optimistic-announcement bug settled on success**: an early implementation draft fired `onMovida`
   optimistically (before the server response), meaning a failed reclassify would still announce
   "Movida a {bucket}." and then silently undo the row change. The gate required moving the call
   inside the `onSuccess` callback (already the final implementation's location per the design) and
   adding a negative test confirming the region stays unchanged on a failed mutation.

2. **Dropped row-leave e2e assertion restored with stateful stub**: the e2e cross-bucket case
   (extending `bucket-detalle-mes.e2e.ts`) initially asserted only the `role="status"` text, omitting
   the "moved row is gone from the Necesidades page" postcondition from the design. The gate required
   restoring the row-leave assertion and upgrading the e2e stub to a stateful one: first response
   returns the row under Necesidades; the refetch (triggered by invalidation) returns the page without
   it, under Deseos. This proves the invalidation cycle runs end-to-end, not just that the text renders.

3. **Phantom SHA**: the verify report recorded a commit `f2f0c474` for T-06 JD fixes. The tasks
   artifact confirmed this SHA is real and references the BucketDetalleMesPage announcement thread
   correction (same-bucket no-op guard added in the test). No action required — noted for
   traceability.

---

## Task Completion (9 / 9)

T-00 is the docs-only PR (#438); T-01..T-08 are the code PR (#439); T-09 (living-spec delta) is
this archive-time operation, following the US-054 precedent.

| Task | Description | Status | SHA / PR |
|------|-------------|--------|----------|
| T-00 | Docs PR — planning artifacts | ✅ | PR #438 |
| T-01 | RED — invalidation count tests (4-key reclassify, 5-key CRUD) | ✅ | PR #439 |
| T-02 | GREEN — add `['ingresos-mes']` to both mutation sites | ✅ | PR #439 |
| T-03 | RED — control tests (3-group, onMovida, aria-describedby) | ✅ | PR #439 |
| T-04 | GREEN — control source changes (BUCKETS_ASIGNABLES filter, onMovida prop, aria-describedby) | ✅ | PR #439 |
| T-05 | GREEN — thread onMovida through GrupoMovimientos + new GrupoMovimientos.test.tsx | ✅ | PR #439 |
| T-06 | GREEN — page-owned role=status region + BucketDetalleMesPage tests | ✅ | PR #439 (`f2f0c474`) |
| T-07 | chore — eslint a11y file-list block promotion for ReclasificarCategoriaControl.tsx | ✅ | PR #439 |
| T-08 | test(e2e) — cross-bucket reclassify case in bucket-detalle-mes.e2e.ts | ✅ | PR #439 |
| T-09 | DEFERRED — living-spec delta (archive-time) | ✅ | This archive op |

All 9 tasks checked. No stale-checkbox reconciliation required.

---

## Spec Sync (delta → living)

Living spec: `openspec/specs/web-app/spec.md`

| Requirement | Action | Details |
|-------------|--------|---------|
| `WCAT-04` | MODIFIED | Offered set restricted to `BUCKETS_ASIGNABLES` (D-02); `aria-describedby` on alertdialog; focus contract (focus→Confirmar on open, focus→select on cancel/Escape); page-owned `role="status"` region for cross-bucket announcement (D-04), with `Gustos` label mapping for `Deseos`; 6 new scenarios added (3-group restriction, cross-bucket announcement, same-bucket no-op, subsequent-move replacement, aria-describedby, focus-return); `Previously:` clauses retained for audit traceability |
| `WDM-07` | MODIFIED | Title updated: "3-key" → "4-key complete invalidation set (D-03)"; `['ingresos-mes']` prefix key added; scenario title updated to "4 keys — including ingresos-mes"; `Previously:` clause for the 3-key US-053 baseline |
| `WDM-09` | ADDED | New requirement after WDM-08: `invalidarCatalogoYDashboard` 5-key category-CRUD invalidation including `['ingresos-mes']`; 3 scenarios (category mutation count=5, pattern exclusion explicit, anti-enumeration ADR-024 guard) |

**Requirements preserved byte-identical (not mentioned in delta):**

All other requirements were left untouched:
WCAT-01..03, WCAT-05, WDM-01..06, WDM-08, WCTG-01..14, WCTM-01..06, WCFG-* (referenced but not
restated), WPER-01..07, WMYP-01..08, WG5-01..13, WSEM-01..08, WTA-01..*, and all later sections.

**No destructive merge required** — WCAT-04 and WDM-07 were modified in-place with `(Previously: ...)`
clauses retained for audit traceability. WDM-09 is a purely additive requirement.

---

## Engram Traceability (project: moneydiary)

| Artifact | Observation ID |
|----------|----------------|
| proposal | obs #879 (`US-055 proposal — judgment-day fixes applied`) |
| spec (delta) | openspec file only — `specs/web-app/spec.md` in this change folder |
| design | obs #881 (`US-055 design — judgment-day fixes applied`) |
| tasks | obs #883 (`sdd/us-055-web-reclasificar-mes-bucket/tasks`) |
| verify-report | obs #887 (`sdd/us-055-web-reclasificar-mes-bucket/verify-report`) |
| archive-report | `sdd/us-055-web-reclasificar-mes-bucket/archive-report` (this observation) |

Note: This change was managed in hybrid mode. Proposal and design artifacts live in Engram only
(not as openspec files). The spec delta, tasks checklist, and verify report have both forms;
the archive report is persisted to both the filesystem (this file) and Engram.

---

## Implementation Summary

**2 PRs merged to origin/main** (single-PR delivery plan; docs PR separate per US-054 precedent):

1. **PR #438** (T-00) — Planning / docs PR
   - `openspec/changes/us-055-web-reclasificar-mes-bucket/` planning artifacts
   - Merged before code PR as a clean documentation boundary

2. **PR #439** (T-01..T-08) — Code PR (final merge `d87c5927`)
   - `use-reclasificar-categoria.ts` + test: +`['ingresos-mes']` prefix invalidation (4-key total)
   - `categorias-invalidacion.ts` + test: +`['ingresos-mes']` in `invalidarCatalogoYDashboard` (5-key total)
   - `ReclasificarCategoriaControl.tsx` + test: local `BUCKETS_ASIGNABLES` filter; required `onMovida`
     prop; `aria-describedby`+`useId` on the alertdialog; removed stale per-row `aria-live` span
   - `GrupoMovimientos.tsx` + `GrupoMovimientos.test.tsx` (new): `onMovida` thread/passthrough
   - `BucketDetalleMesPage.tsx` + test: `anuncio` state + stable `role="status"` region;
     `alMovida` threaded to every `GrupoMovimientos`
   - `eslint.config.js`: US-055 file-list a11y block (`ReclasificarCategoriaControl.tsx`)
   - `e2e/bucket-detalle-mes.e2e.ts`: +1 cross-bucket reclassify case (stateful stub)

3. **PR #440** (W-01 / S-01 closure) — Test-pin PR
   - `document.activeElement === select` focus assertion after dialog close
   - Explicit `not-called` assertion for pattern-mutation exclusion
   - Merging concurrently with this archive

**Final test count**: 1208/1208 unit + 67/67 e2e (net new: ~9 unit + 1 e2e)
**Scope boundary**: 2 code PRs touch only `apps/web`. Zero changes to `apps/api`, `apps/mobile`,
`openapi.json`, or Prisma schema. `packages/api-client` untouched.

---

## Design Decisions Spot-Check

| Decision | Evidence | Status |
|---|---|---|
| D-02 `BUCKETS_ASIGNABLES` filter | Local filter at the control's render site; `agruparPorBucket` global untouched for Configuración | PASS |
| D-04 page-owned announcement | `anuncio` state on `BucketDetalleMesPage`; stable `<p role="status">` outside the groups map; persists until replaced or unmount | PASS |
| D-05 alertdialog a11y | `aria-describedby={mensajeId}`; `id={mensajeId}` on the money-move `<p>`; focus→Confirmar on open; focus→select on close | PASS |
| D-06 local filter rationale | `BUCKETS_ASIGNABLES` imported from `catalogo-constantes`, never redeclared inline; Configuración forms keep the full list | PASS |
| D-07 no-toast choice | `role="status"` region avoids auto-dismiss semantics; no `sonner`/shadcn Toaster dependency | PASS |
| D-08 file-list eslint block | Loose-sibling precedent (US-047/048/049/053/054); file-list, not glob; `aria-describedby` is the only fix the promotion mandated | PASS |
| D-09 both invalidation sites | Both `use-reclasificar-categoria.ts` (4 keys) and `categorias-invalidacion.ts` (5 keys) updated in the same PR | PASS |

---

## Scope Verification

- No files under `apps/api/**` were modified.
- No files under `apps/mobile/**` were modified.
- No `openapi.json` changes.
- No Prisma migrations introduced.
- No new runtime npm dependencies introduced.
- `packages/api-client` unchanged.

---

## Known Debts (Recorded, Not Blocking)

1. **Pre-existing lint warning**: 1 warning from `EliminarIngestaControl.tsx:128`
   (`jsx-a11y/no-noninteractive-element-interactions`) — pre-existing, not in US-055 scope.
2. **Commit-scope drift**: the `docs(spec):` commit in PR #439 used the US-055 scope rather than a
   dedicated `docs/archive-us-055` branch pattern. Noted but not actionable — the commit landed on
   main cleanly and the archive branch separates it correctly for the git trail.
3. **Static stub DTO note**: `GrupoMovimientos.test.tsx` uses a minimal catalog mock with hardcoded
   stub DTOs. The test proves the `onMovida` thread is wired, not the full catalog integration path
   (that is covered by `ReclasificarCategoriaControl.test.tsx`). A future refactor to a shared
   catalog-stub fixture would reduce duplication across the two files, but the current state is
   compliant and clear.

---

## Notes

- This change closes the three US-053 deferred refinements: (1) `['ingresos-mes']` stale-cache gap
  on both reclassify and category CRUD; (2) per-row `aria-live` span unmounting with the row on a
  cross-bucket move (replaced by a page-owned persistent `role="status"` region); (3) the
  `ReclasificarCategoriaControl` never audited under an eslint a11y `error` gate.
- The `Deseos`→`Gustos` label mapping (`ETIQUETA_BUCKET`) is pinned in the test suite. A raw-key
  implementation would pass a `toHaveBeenCalled()` check but fail the label-literal assertion.
- Issue #289 closed linking PR chain (#438 / #439 / #440).
- WCAT-04, WDM-07, and WDM-09 in the living `openspec/specs/web-app/spec.md` now reflect the
  final state of the reclassify control and cache invalidation matrix.

---

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
