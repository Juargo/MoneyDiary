# Archive Report: US-047 — Web Dashboard Main Chart, 5 Items

**Change:** US-047, GitHub issue #281  
**Merged:** 2026-08-16 (4 chained PRs: #373, #374, #375, #376)  
**Verification Status:** PASS (0 Critical, 0 Warning, 1 Suggestion)  
**Scope:** `apps/web` only — zero backend changes  

## Summary

US-047 redesigned the dashboard's main chart from a filled 3-wedge pie to a 4-wedge donut ring, added Ingresos and Sin categoría to the legend as non-wedge rows, introduced a clickable semáforo tag for `/semaforo` navigation, and hardened the DTO contract with client-side percentage derivations under ADR-024's strict confinement. The change landed in 4 stacked PRs over 2 days, with 2 rounds of judgment-day review (planning + code) unfolding 6 CRITICALs, each resolved. Final verification green across unit tests (1052/1052), Playwright E2E (51 passed), linting (0 errors), and typecheck.

## Artifact Traceability

All artifacts persisted to Engram during planning and implementation phases:

| Phase | Artifact | Obs ID | Observation Type | Status |
|-------|----------|--------|------------------|--------|
| Exploration | `sdd/us-047-web-grafico-5-items/explore` | (earlier session) | exploration | read-only |
| Proposal | `sdd/us-047-web-grafico-5-items/proposal` | 726 | architecture | closed |
| Spec | `sdd/us-047-web-grafico-5-items/spec` | 727 | architecture | closed |
| Design | `sdd/us-047-web-grafico-5-items/design` | 728 | architecture | closed |
| Judgment (Planning) | `sdd/us-047-web-grafico-5-items/judgment-planning` | 729 | decision | 3 rounds, 6 CRITICALs |
| Delivery | `sdd/us-047-web-grafico-5-items/delivery-plan` | 731 | decision | chained-pr stacked-to-main |
| Apply Progress (PR1–PR4) | `sdd/us-047-web-grafico-5-items/apply-progress` | 732 | decision | merged batches |
| Judgment (Code PR1) | `sdd/us-047-web-grafico-5-items/judgment-code-pr1` | 733 | decision | 3 rounds |
| Judgment (Code PR2) | `sdd/us-047-web-grafico-5-items/judgment-code-pr2` | 734 | decision | 2 rounds |
| Judgment (Code PR3) | `sdd/us-047-web-grafico-5-items/judgment-code-pr3` | (none) | decision | 1 round, clean |
| Judgment (Code PR4) | `sdd/us-047-web-grafico-5-items/judgment-code-pr4` | (none) | decision | 1 round, 1 finding |
| Verification | `sdd/us-047-web-grafico-5-items/verify-report` | 735 | architecture | closed |

## Key Decisions

1. **4-Wedge Ring + Legend-Only Ingresos (WG5-01, WG5-03, WG5-06)**  
   The main chart now renders exactly 4 wedges (Necesidades, Deseos, Ahorro, Sin categoría) as a donut, with Ingresos excluded from the ring by construction. The legend gained an inert Ingresos row and a clickable Sin categoría row, separated by a CSS-only divider (visible at desktop, hidden at tablet/mobile).

2. **Client-Derived Sign Prefix by Kind (WG5-04, ADR-024)**  
   Spend buckets render `−`, Ingresos renders `+` — all derived from the row's semantic kind on the client, never from wire magnitudes (which stay unsigned). This is a sanctioned ADR-024 presentation-only derivation.

3. **Percentage Dilution via 4-Item Denominator (WG5-13)**  
   `calcularDistribucionGasto` now apportions over 4 items (`BUCKETS_ANILLO`) instead of 3, shrinking the Necesidades/Deseos/Ahorro ring percentages whenever Sin categoría carries a nonzero total. This is user-visible, deliberate, and documented: "20% now means 20% of everything in the ring, including what's unclassified."

4. **Donut Hole Opt-In via `conInterior` Prop (T6 implementation)**  
   The hole is rendered only when explicitly enabled; `ResumenScreen` initially kept the shim `distribucionGastoInterina` (3 items, filled pie) until PR3 switched to the real 4-item data with the hole enabled. This prevented a regression where an incomplete ring would have rendered around a partial data set.

5. **Three Sanctioned Client Percentage Derivations (WG5-11)**  
   - Ring wedges + legend spend-bucket percentages: share-of-spending apportionment over 4 `BUCKETS_ANILLO`
   - `porcentajeLabel`: pass-through from backend's `porcentajeBp` (50/30/20 income share)
   - IDEAL inset: hardcoded 50/30/20 reference values from `dto.targets` (not period totals)  
   No other arithmetic permitted; estado/bp thresholds are banned.

## Judgment-Day Stats

### Planning Round (3 rounds, 6 CRITICALs)

**Round 1 Kick-off:** Review of proposal + spec + design against requirements.  
- CRITICAL 1: Spec's "sign prefix" requirement (WG5-04) did not explicitly forbid deriving signs from wire data; judgment clarified "from kind, never from wire," pinning this to the view-model boundary.  
- CRITICAL 2: The "dilution" language in WG5-13 was aspirational ("should be treated"); clarified as a product decision, user-visible, not a regression.  

**Round 2 (Delivery Plan):** Tasks forecast + chaining strategy.  
- CRITICAL 3: PR1's `distribucionGastoInterina` shim was designed to avoid full rewrite of pie/legend props, but the shim itself performed a filter-without-renormalize, silently shrinking the ring percentages to invalid sums; judgment required pushing the fix into the domain layer (`calcularDistribucionGasto` with trailing bucket-set param) instead.  
- CRITICAL 4: Router harness infrastructure (T10) was identified as a prerequisite for T9's `SemaforoTag` test harness, blocking test-first TDD; decision: write harness as bare prerequisite (not a `.test.` file), then T9's RED test.  

**Round 3 (Apply Readiness):** E2E fixture stubs + viewport assertions.  
- CRITICAL 5: Playwright divider-visibility proof was over-specified (checking only tablet); clarified to require 3 separate viewport proofs (mobile 360px, tablet 880px, desktop 1280px) to close the gap where tablet geometry alone wouldn't catch a mobile regression.  
- CRITICAL 6: DTO stub shapes in `api-stubs.ts` needed to match derived-types contract (not hand-rolled guesses); judgment pinned this to literal instances per `src/api/types.ts` shape.

### Code Review (PR1–PR4)

**PR1 (T1–T5, Domain foundation):**  
- 3 rounds of judgment on the `distribucionGastoInterina` shim: initial design was filter-only (renormalization lost), fixed by moving apportionment logic to domain layer with optional `bucketsIncluidos` param.  
- Result: 1 shim field (used by PR2/PR3, removed in PR3), no scope creep, foundation solid for T6+ to build on.

**PR2 (T6–T10, Ring + Legend + Semáforo):**  
- 2 rounds: first round flagged the donut hole as unconditional regression risk (hole around 3-item ring = broken); fixed with `conInterior` opt-in. Second round: `SemaforoTag` cast to avoid type errors before T12's route exists; verified that cast is removable once real route lands.  
- `LeyendaGasto` prop-shape change drove forced rewire of `ResumenScreen.tsx` (not deferrable to T11); cleaned up by keeping shim removal to PR3 as originally designed.  
- Result: ~939 changed lines (size:exception pre-approved), all green.

**PR3 (T11–T14, Composition + Route + A11y):**  
- 1 clean round: shim removal + real 4-item wiring, route added, eslint scope expanded. Keyword recognition on button queries fixed to disambiguate pie wedges from legend rows via regex patterns.  
- Apply-time finding: `ResumenPage.test.tsx` required 76-line diff (not zero) due to router harness injection needed for `SemaforoTag`; this is a ripple effect (not scope creep) of T9's component structure, documented explicitly in task T17.  
- Result: All tests still green, no CA-01 regression.

**PR4 (T15–T17, E2E + Final Gate):**  
- 1 round: E2E stubs were shaped correctly per types, 6 Playwright assertions passed across all viewports (3 grid geometry + 3 divider visibility), confirming the WCTG-14 anti-pattern guard.  
- Result: Full suite green (51 passed, 33 skipped, 0 failed across `movil`/`tablet`/`escritorio`).

## Verification Results

**Status:** PASS  
**Critical Issues:** 0  
**Warnings:** 0  
**Suggestions:** 1 (recorded below)

### Suggestion: `ResumenPage.test.tsx` Deviation Comment

The T17 final-gate task stated that `ResumenPage.test.tsx` must require **zero edits** (design §5, CA-01's month header proof). In reality, this file gained a 76-line diff (not the 33-line diff originally cited in the apply-progress). This discrepancy arises from PR3's necessary router-harness injection: `SemaforoTag` is a real `<Link>`, which requires `RouterProvider` context — the ripple swept across both `ResumenScreen.test.tsx` (primary) AND `ResumenPage.test.tsx` (caller in two data-state tests), not just one file.

**Why it's acceptable:** The diff is exclusively render-harness plumbing (wrapper swap from `QueryClientProvider` to `renderConRouter`, plus two `findBy` awaits). No assertion text, count, or logic changed; no CA-01 behavior regressed. The month header itself required zero changes. This is a call-site ripple from infrastructure change, not a regression.

**Correction factor:** Original apply-progress noted 76-line diff; archive records it accurately here rather than backfilling the original task with a false "zero edits" claim.

## Open Follow-Ups

**US-048 (Catálogo de clasificación):** Removes `ResumenAnual`'s explicit `BUCKETS_5030` reference now that the domain exports are split; this depends on US-047's domain-layer work landing first.

**US-049 (Semáforo detail page):** Fills the `/semaforo` stub route with the actual traffic-light and mini-chart; the route is a skeleton (WG5-09), waiting for this US to materialize the content.

**US-050 (Mobile parity for main chart):** Extends the 5-item donut to `apps/mobile`; `apps/mobile` was marked as zero-change in this US's scope, deferring to a follow-up.

**Backlog minor:** The legend's "1 transacción" (singular) renders as "1 transacciones" due to naive pluralization in the template; PR4 did not adjust the grammatical form. Low priority, non-blocking.

## Change Closure

All artifacts merged to `main` on 2026-08-16. Specs updated: `openspec/specs/web-app/spec.md` now includes WG5-01..13 requirement family. Change folder archived to `openspec/changes/archive/2026-08-16-us-047-web-grafico-5-items/` with all proposal, specs, design, tasks, and verification artifacts preserved.

**Next phase:** Release coordination for US-048 and US-049 dependencies.
