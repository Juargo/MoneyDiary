# Archive Report: US-048 — Web annual table redesign, navigable mini-charts

**Change**: `us-048-web-tabla-anual`  
**Issue**: #282 (closed)  
**Status**: ARCHIVED  
**Verdict**: PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION)  
**Date**: 2026-08-16

## Executive Summary

US-048 redesigned the annual grid (`ResumenAnual`) to align with the 4-wedge main chart, add period-selection markers, and make the semáforo tags navigable entry points. All 5 chained PRs (#378–#381, #384) merged to `main` on 2026-08-16. Implementation verified against spec WTA-01..06, design D-01..D-16, and proposal acceptance criteria CA-01..CA-06. Spec delta merged into `openspec/specs/web-app/spec.md`, change folder archived to `openspec/changes/archive/2026-08-16-us-048-web-tabla-anual/`.

## Artifact Traceability

| Artifact | Engram ID | Topic Key | Status |
|----------|-----------|-----------|--------|
| Exploration | 738 | `sdd/us-048-web-tabla-anual/explore` | ✅ Active |
| Proposal | 739 | `sdd/us-048-web-tabla-anual/proposal` | ✅ Active |
| Spec (delta) | 740 | `sdd/us-048-web-tabla-anual/spec` | ✅ Active, merged to living spec |
| Design | 741 | `sdd/us-048-web-tabla-anual/design` | ✅ Active |
| Tasks | 743 | `sdd/us-048-web-tabla-anual/tasks` | ✅ Active (100% complete) |
| Apply Progress | 745 | `sdd/us-048-web-tabla-anual/apply-progress` | ✅ Active (final batch complete) |
| Verify Report | 746 | `sdd/us-048-web-tabla-anual/verify-report` | ✅ Active (PASS) |

## Implementation Summary

### Scope Delivered

All 6 acceptance criteria and 6 design decisions locked and implemented:

- **CA-01**: 4-wedge minis via `BUCKETS_5030` argument deletion, `calcularDistribucionGasto` called with no override.
- **CA-02**: Selected-month marker (larger, accent-filled) coexisting with today marker (`✓` + `aria-current="date"`).
- **CA-03/CA-04**: Regression tests confirming data-month navigation and disabled-cell semantics survive DOM restructure.
- **CA-05**: Every month carries an independently clickable compact semáforo tag (MiniSemaforoTag sibling component).
- **CA-06**: Section header and caption with approved literal Spanish copy; caption derives `{mes año}` from `viewModel.periodo`.

### Design Decisions (Approved)

- **D-1**: Selected and today markers coexist as distinct, separate visual channels.
- **D-2**: Disabled-month asymmetry accepted — tag always clickable, month control disabled.
- **D-3**: Mini tag ≥24×24 CSS px floor, visual design's call on compact form factor.
- **D-4**: MiniSemaforoTag built as a new sibling component (not a `compact` prop on existing SemaforoTag).
- **D-15**: New `annual-grid.e2e.ts` Playwright file for geometry verification (E-01..E-04), replaces tablet-grid edits.
- **D-16**: All 4 mini-pie, marker, caption components assembled atomically; no intermediate unstable states exposed.

### PRs and Implementation Strategy

5 chained PRs merged via Feature Branch Chain to main:

1. **PR #378** (minis): Deleted `BUCKETS_5030` override, 4-wedge ring apportionment active.
2. **PR #379** (marker/caption/copy): Selected-month marker, approved Spanish header/caption copy.
3. **PR #380** (MiniSemaforoTag): New component, sibling interactivity, tab order, 24×24 hit-area target.
4. **PR #381** (restructure+wiring): MesCelda DOM restructured, month button + tag as siblings, drill-down preserved.
5. **PR #384** (E2E): New `annual-grid.e2e.ts` with E-01..E-04 scenarios (grid widths, marker coexistence, tag geometry).

All tasks marked complete; no unchecked items remain in `tasks.md`.

## Spec Delta Merge

File: `openspec/changes/archive/2026-08-16-us-048-web-tabla-anual/specs/web-app/spec.md` → `openspec/specs/web-app/spec.md`

**Action**: Added new requirement family `WTA-*` (Web Tabla Anual)

- 6 added requirements: WTA-01 through WTA-06
- Inserted after WG5 family, before DCR family (line 1427 → new section)
- Reference table preserved, disclosing WDS-04's provenance as accepted-but-unratified deviation in un-archived `web-dashboard-redesign-mobile` change
- All scenarios preserved verbatim; no modifications to spec text

**Requirements added**:
- **WTA-01**: 4-item ring reading per month, no bucket-set override
- **WTA-02**: Selected-month marker distinct from today marker
- **WTA-03/WTA-04**: Regression tests for navigation/disabled-cell semantics
- **WTA-05**: Clickable semáforo tag on every month, 24×24 CSS px hit area
- **WTA-06**: Approved literal Spanish copy for header and dynamic caption

## Verification Report Summary

**Verdict**: PASS  
**Evidence**:
- `pnpm web test`: 103 files / 1072 tests passed
- `pnpm web typecheck`: clean
- `pnpm exec eslint .` (apps/web): 0 errors, 2 pre-existing baseline warnings, zero new
- `playwright test annual-grid`: E-01..E-04 all passed (4/4)
- Zero diff outside `apps/web` + `openspec` confirmed
- WTA-01..06 each traced to production code lines and passing tests
- Issues #382, #383 confirmed open (backlog follow-ups)
- Issue #282 confirmed closed

**Known Accepted Drift** (recorded, not flagged as new):

Design §6.8's ledger table states "final count 57"; actual final test count is **58**. The 58th test is WTA-02's same-cell coexistence scenario (both markers on one cell), added post-judgment in PR #379 but not ledgered in design §6.8. This was already disclosed in `tasks.md` (X4/C2a-6) and `apply-progress` (#745), verified only confirms it's recorded, does not force a fix (tasks.md preamble locks D-01..D-16 and WTA-01..06 as APPROVED, not reopenable). Single SUGGESTION-level finding, no CRITICAL/WARNING.

## Rollback Boundary

5 PRs independently revertible:
- PR #378: Delete one constant and re-enable the override
- PR #379: Undo text/marker visual changes  
- PR #380: Delete MiniSemaforoTag component and remove imports
- PR #381: Revert MesCelda DOM to single click-target (pre-sibling structure)
- PR #384: Delete `annual-grid.e2e.ts`

Combined revert to `main` restores pre-US-048 annual-grid behavior in ~5 minutes.

## Open Follow-ups

**Recorded in GitHub Issues** (not blockers for archive):

- **#382**: `SemaforoBadge` component is unused after US-048/US-049 — candidate for deprecation/removal
- **#383**: `bucketsIncluidos` default-only pattern (no user customization in catalog CRUD) — design may want to unify with catalog-per-user model
- **Backlog**: Archive `web-dashboard-redesign-mobile` so WDS-04 (grid column layout) gets a canonical home in openspec (currently only in un-archived change)
- **US-049**: Fills `/semaforo` content; now has 13 entry points (main chart, 12 mini tags)
- **US-050**: Mobile parity for ResumenAnual + pluralization tweaks for mini captions

## Task Completion Gate

**Status**: PASS

All implementation tasks from `tasks.md` marked complete:
- 100% checkbox coverage across Slice A (4-wedge minis), Slice B1 (marker/caption), Slice B2 (MiniSemaforoTag), Slice C (restructure), Slice C2a-6 (E2E)
- No stale unchecked tasks remain
- Apply-progress shows final batch (5 of 5) complete

## Archive Folder Contents

```
openspec/changes/archive/2026-08-16-us-048-web-tabla-anual/
  ├── proposal.md (source of truth for intent and CA-01..06)
  ├── specs/
  │   └── web-app/
  │       └── spec.md (delta: WTA-01..06, merged to living spec)
  ├── design.md (D-01..D-16, §6 test ledger, 768 lines)
  ├── tasks.md (Slices A/B1/B2/C/C2a-6 + X1-X4 cross-cutting, 100% complete)
  ├── archive-report.md (this file)
  ├── README.md (reference)
  └── (verify-report.md via engram #746)
```

## Compliance Checklist

- [x] Spec delta merged into main spec (WTA-01..06 inserted after WG5, before DCR)
- [x] Archive folder created with date prefix (2026-08-16)
- [x] All artifacts present (proposal, spec, design, tasks, apply-progress, verify-report)
- [x] Tasks artifact shows 100% completion (no unchecked items)
- [x] Verify-report verdict is PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION < threshold)
- [x] Change folder moved from `openspec/changes/` to `openspec/changes/archive/`
- [x] Traceability documented (all engram observation IDs recorded)
- [x] Archive scope declared (5 PRs, independent rollback, no external dependencies)

## Recommendation

The change is COMPLETE and READY FOR ARCHIVE. All acceptance criteria met, all tests passing, all requirements traced. The single SUGGESTION-level finding (design ledger recount) is a recording-only disclosure, not a correctness issue.

**Next work**: US-049 (fill /semaforo content) and US-050 (mobile parity + pluralization).
