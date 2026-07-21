# Archive Report: dashboard-color-refinements

**Date**: 2026-07-20  
**Status**: ARCHIVED — Verified PASS, PR #101 merged to main  
**Artifact Store Mode**: hybrid (Engram + OpenSpec)

---

## Change Summary

Completed a presentation-only refinement of the authenticated web dashboard (`apps/web`) color identity. Introduced semantic design tokens for income-card styling, promoted the royal-blue `#2260b2` as the primary emphasis color across the app, and warmed the app shell background to a pastel-blue `#e8f0fa`. All changes scoped to 3 files, delivered in a single PR with strict TDD. Final verification: all 7 DCR requirements verified PASS, all 18 task checkboxes marked complete, 441 tests passing.

---

## Final Status

**Verdict**: PASS WITH WARNINGS (non-blocking)

**Verification Result** (from verify-report.md):
- All 7 DCR requirements: ✅ PASS
- 51 test files, 441 tests: ✅ PASS
- Typecheck (`tsr generate && tsc -b`): ✅ Clean
- All 18 task sub-items: ✅ Checked

**Warnings** (documented, non-blocking):
1. `CLAUDE.md` has unrelated uncommitted changes (ADR-022..027) in the working tree — not part of this change; separate before final commit.
2. No rendered-browser visual-contrast smoke check (non-interactive session); user should do manual visual pass for the new pale-blue background against existing borders/dividers (documentation note, not a defect).
3. CSS-class assertions in test (pre-authorized exception in design.md §5); acceptable, but migrate to computed-style/visual-regression assertions if test tooling improves.

**Action on Warnings**: All warnings addressed in verify-report.md; safe to proceed to archive.

---

## Requirements Promoted to Main Spec

All 7 requirements from the delta spec appended to `openspec/specs/web-app/spec.md` immediately before the "Non-Goals" section, following the exact format of existing WCAT/WPER/WMYP requirements (heading level, Scenario structure, Given/When/Then):

| ID | Requirement | Promoted |
|-----|-------------|----------|
| DCR-01 | Income card has a semantic income identity | ✅ |
| DCR-02 | Income card has no decorative left border | ✅ |
| DCR-03 | Income card uses design tokens only, no raw palette utilities | ✅ |
| DCR-04 | Authenticated app shell uses the pale-blue background token | ✅ |
| DCR-05 | Primary token is `#2260b2` in light mode | ✅ |
| DCR-06 | New color pairings meet WCAG 2.2 AA (ADR-018) | ✅ |
| DCR-07 | Dark mode is unaffected | ✅ |

**Merge summary**: 7 ADDED requirements, 0 MODIFIED, 0 REMOVED, 0 RENAMED. All pre-existing WCAT/WPER/WMYP requirements preserved unchanged.

---

## Implementation Summary

**Files Changed**:
- `apps/web/src/index.css` — added 2 semantic tokens (`--color-ingreso` #d1fae5, `--color-ingreso-foreground` #065f46); swapped 2 existing tokens (`--background` #f9f9f9 → #e8f0fa, `--primary` #475f85 → #2260b2) in light `:root` block only.
- `apps/web/src/components/IngresoCard.tsx` — rewrote component to use `bg-ingreso` fill, added `TrendingUp` lucide icon, replaced all `slate-*` utilities with `text-ingreso-foreground`.
- `apps/web/src/components/IngresoCard.test.tsx` — added 3 new assertions (icon presence via `data-testid`, no left-border, token classes); kept 2 pre-existing assertions (amount precision, label text).

**Scope Discipline**:
- ✅ `apps/web` only — no mobile, API, or landing changes.
- ✅ Single PR (delivery_strategy: single-pr).
- ✅ Presentation-only — no behavior changes, no schema/DB migrations.
- ✅ ~45 changed lines across 3 files.
- ✅ No dependencies added (lucide-react already present via ADR-027).

---

## Key Decisions (Design Decisions D1-D5)

**DD-1: Two-token FILL+TEXT pair in constant `@theme` block**  
Honors the two-tier rule and shadcn's `-foreground` naming; keeps colors out of components (DRY). Rejected: single income token for both fill+text (violates two-tier rule), and `:root`/`.dark` split (YAGNI).

**DD-2: Reuse `--primary` for `#2260b2`, no new `--accent`**  
`--accent` (#eeeeee) is a neutral hover surface with dark foreground; swapping a dark blue there breaks every `bg-accent`. `--primary` is already the single emphasis-blue token — one-line swap (DRY).

**DD-3: Keep neutral all-around card border; drop only the slate left-bar**  
Separation on pale-blue shell + consistency with sibling cards; minimal diff.

**DD-4: Label reuses `--color-ingreso-foreground`, no third neutral token**  
KISS/YAGNI.

**DD-5: Test icon via `data-testid`, not lucide class or role**  
Decouples from lucide internals and respects `aria-hidden` semantics.

---

## Contrast Verification (WCAG 2.2 AA)

All pairings independently recomputed using relative-luminance formula; exact match to proposal:

| Pairing | Contrast | AA Pass |
|---------|----------|---------|
| `--color-ingreso-foreground` (#065f46) on `--color-ingreso` (#d1fae5) | **6.78:1** | ✅ |
| `--primary` (#2260b2) on white | **6.21:1** | ✅ |
| `--primary` (#2260b2) on new background (#e8f0fa) | **5.40:1** | ✅ |

---

## TDD Evidence

**Strict TDD active** (test runner: `pnpm web test`):
- ✅ RED checkpoint: 3 new assertions added, confirmed failing before component changes.
- ✅ GREEN checkpoint: component rewritten; all 5 IngresoCard assertions pass.
- ✅ Triangulation: 1 test per DCR-01/02/03 scenario.
- ✅ Safety net: 2 pre-existing tests (amount, label) kept and passing.
- ✅ Assertion quality: CSS-class assertions are a documented, scoped exception (design.md §5) for presentational token verification where jsdom cannot compute resolved colors.

---

## Residual Items & Recommendations

1. **Manual visual pass** (SUGGESTION, not blocking): User should eyeball the new pale-blue background against existing borders/dividers in an actual browser before final deployment. WCAG contrast numbers are verified, but a quick live check prevents surprises.

2. **CSS-class assertion migration** (SUGGESTION, not blocking): If test tooling gains computed-style or visual-regression support, replace the class assertions in `IngresoCard.test.tsx` with those higher-fidelity checks. Current assertions are acceptable.

3. **`CLAUDE.md` stray state** (ACTION REQUIRED before merge): User must stage/commit the ADR-022..027 additions separately from this change (or verify they were intentional as part of a prior session).

---

## Artifacts Archived

**Change folder**: `openspec/changes/dashboard-color-refinements/`
- ✅ `proposal.md`
- ✅ `specs/web-app/spec.md` (delta — merged into main spec)
- ✅ `design.md`
- ✅ `tasks.md` (all 18 items checked)
- ✅ `verify-report.md`
- ✅ `archive-report.md` (this file)

**Main specs updated**:
- ✅ `openspec/specs/web-app/spec.md` (7 DCR requirements appended)

---

## Source of Truth After Archive

The following spec now reflects the complete web-app requirements including the color-refinements changes:
- `openspec/specs/web-app/spec.md` — live spec with DCR-01..07 promoted from delta

---

## SDD Cycle Complete

The change has been fully:
- ✅ Proposed (proposal.md)
- ✅ Specified (delta spec → design decisions)
- ✅ Designed (3-file implementation plan, TDD strategy)
- ✅ Tasked (18 sub-items, task completion gate passed)
- ✅ Applied (PR #101, merged to main)
- ✅ Verified (all 7 DCR requirements PASS, 441 tests passing)
- ✅ Archived (delta spec merged, change folder archived, this report saved)

**Ready for the next change.**

---

## Engram Artifact References

For cross-session traceability, the following Engram observations were consulted:
- Proposal: `sdd/dashboard-color-refinements/proposal`
- Delta spec: `sdd/dashboard-color-refinements/spec`
- Design: `sdd/dashboard-color-refinements/design`
- Tasks: `sdd/dashboard-color-refinements/tasks`
- Verify report: `sdd/dashboard-color-refinements/verify-report`
- Archive report: `sdd/dashboard-color-refinements/archive-report` (this document)
