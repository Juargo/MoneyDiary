# Archive Report — us-053-web-detalle-mes-bucket

**Status**: ARCHIVED (intentional-with-warnings — W-1 accepted exception, see below)
**Date**: 2026-08-19
**Branch**: `docs/archive-us-053` (base: `main` @ cff13ddd — merge of PR #422, the verified state)
**Mode**: hybrid (openspec filesystem + Engram)
**Change**: us-053-web-detalle-mes-bucket (US-053, issue #287, Sprint-14)

## What Was Archived

| Artifact | Path | Complete |
|----------|------|----------|
| Proposal | `proposal.md` | ✅ |
| Delta specs | `specs/bucket-detalle-mes/spec.md`, `specs/web-app/spec.md` | ✅ |
| Design | `design.md` | ✅ |
| Tasks | `tasks.md` | ✅ 23/23 tasks `[x]` — no stale unchecked tasks |
| Verify report | `verify-report.md` | ✅ PASS WITH WARNINGS |

## Verify Outcome

- **Verdict**: PASS WITH WARNINGS at `main` @ cff13ddd — 1141/1141 vitest, tsc clean, lint 0 errors, 10/10 e2e executed, 25/27 spec scenarios compliant, 2 partial, 0 failing, 0 CRITICAL.
- **W-1 (accepted at archive)**: WDM-02 scenario 1 / WPER-05 page-side — the arrow → URL `periodo` mutation is not pinned by any runtime test; the route is untested by design (D-04, us-049 precedent) and jsdom pins `onPeriodoChange`, e2e proves the arrival pipeline. **Accepted explicitly by the orchestrator** as the D-04 route-untested exception; recorded here so the audit trail shows conscious acceptance.
- **W-2**: apply-progress artifact (#832) is a condensed summary without the formal per-task TDD Cycle Evidence table — format gap, substance verified independently at verify time.
- **W-3**: `buckets.$bucket.tsx` route coverage 27.3% — design-intentional (D-04), non-blocking.
- **Suggestions S-1..S-4** (design ledger drift, comment-only touches, provenance docstring): cosmetic, accepted as-is; the archive folder preserves the original artifacts unmodified.

## Spec Sync (delta → living)

| Capability | Action | Details |
|------------|--------|---------|
| `bucket-detalle-mes` | MODIFIED | Purpose prose updated (retirement shipped, flat endpoint stays deployed); **ADDED MBD-09** (flat US-017 endpoint loses its sole web consumer — informational, backend unchanged) |
| `web-app` | MODIFIED | Purpose updated (navigation replaces panel); **ADDED WDM-01..08** (page family); **MODIFIED** WCAT-01 (navigate, no panel swap), WCAT-02 (backend-ordered groups), WCAT-03 (explicit empty month), WCAT-04 (page render site + WDM-07 refresh), WCTG-09 (key renamed `['detalle-bucket-mes']`), WPER-05 (selection-reset effect retired), WG5-03 (rows navigate), WG5-06 (Ingresos restated against navigation), WTA-03 (no selection state to reset) |

No `web-dashboard-shell` living spec exists (its WDS-* grid remains an un-ratified deviation from the un-archived `web-dashboard-redesign-mobile` change — out of scope, unchanged by this archive). No destructive merge was required; all MODIFIED deltas replaced their requirement text verbatim with `(Previously: …)` provenance notes preserved per repo convention.

## Engram Traceability (project: moneydiary)

| Artifact | Observation ID | Sync ID |
|----------|----------------|---------|
| proposal | #818 | obs-22b3b8ea08ddf976 |
| spec | #819 | obs-935f7c1b1efc1761 |
| design | #821 | obs-d06f6c1b3a841ed3 |
| tasks | #828 | obs-f4c5aac44d368bbf |
| apply-progress | #832 | obs-8afc5d836fed5244 |
| verify-report | #839 | obs-836cd105ada7e2d8 |
| archive-report | this observation | `sdd/us-053-web-detalle-mes-bucket/archive-report` |

## Notes

- **Verify report was untracked at archive time** (added to the change folder after the PR #422 merge) — it is now committed inside the archive folder, completing the audit trail.
- Local `main` was 6 commits behind `origin/main` at archive time (US-044 PR4b, mobile-only, zero overlap with the synced specs). Branch base chosen at the verified state `cff13ddd`; orchestrator may rebase before opening the PR.
- Branch not pushed; PR delivery is the orchestrator's step.