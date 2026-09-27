# Exploration: distribucion-torta-completa

Revert the main "Distribución del gasto" chart (apps/web) from a donut to a full (filled) pie so on-wedge
percentage labels stop getting cramped and clipped.

## Current State

- Hand-rolled SVG. Geometry in `apps/web/src/domain/pie-geometry.ts`; rendering in
  `apps/web/src/components/DistribucionPie.tsx`.
- `arcoPath(cx, cy, r, inicio, fin, rInterior = 0)`: filled wedge when `rInterior === 0`, annular wedge otherwise.
- `DistribucionPie` exposes `conInterior?: boolean` (default `false`, filled pie). The only production call site,
  `apps/web/src/components/ResumenScreen.tsx:150`, passes `conInterior` → the live dashboard renders the donut.
- Labels sit at `radioEtiqueta(r, rInterior) = (r + rInterior) / 2`: 50% of the outer radius for a full pie,
  about 79% for the donut. Labels for slices under 5% are suppressed.
- The "IDEAL 50/30/20" mini-pie renders absolutely at `right-1 bottom-0`, on top of the main chart's bottom-right corner.
- `apps/mobile` has its own label-less donut (US-050) and is out of scope.
- `openspec/specs/web-app/spec.md` `WG5-01` mandates "renders as a 3-wedge donut"; `WG5-12` mentions "the donut ring".

## Root Cause

The donut pushes labels out to about 79% of the radius, straight into the corner the IDEAL inset overlays.
A full pie brings them back to 50%, which clears the inset for realistic splits. A skewed split whose midpoint
lands near 135° could still come close, so it needs one visual check.

## Approaches

1. **Minimal flip** — drop `conInterior` in `ResumenScreen.tsx`, refresh docblocks, add a spec delta for WG5-01/WG5-12. Low effort; reuses a tested path. (Recommended)
2. Keep the donut and move the IDEAL inset — does not meet the user's request.
3. Flip + relocate the inset pre-emptively — YAGNI unless the visual check shows overlap.

## Open Decisions

1. Keep or delete the donut machinery (`RATIO_INTERIOR`, `rInterior`, `conInterior`), which would be dead in production.
2. Touch the IDEAL inset now, or only if the post-flip check shows overlap.

## Risks

- Spec drift if the WG5-01 delta is skipped.
- A residual overlap edge case for skewed splits (one visual check).
- Stale docblocks in `DistribucionPie.tsx` / `ResumenScreen.tsx`.
- Re-run the mobile-floor harness at 360px.
