# Proposal: Full (filled) pie for the "Distribución del gasto" chart

## Intent

The dashboard's main "Distribución del gasto" chart (`apps/web`) renders as a donut. The donut pushes each
on-wedge `%` label out to the ring's mid-band, about 79% of the outer radius (`radioEtiqueta(r, 0.58 r)`).
That has two visible effects:

- labels get cramped inside the thin band; and
- the label of a large wedge lands in the bottom-right corner, where the absolutely positioned
  "IDEAL 50/30/20" mini-pie (`right-1 bottom-0`) covers it. The user observed a `64%` label hidden this way.

A full, filled pie puts labels back at 50% of the radius, which clears the inset for realistic splits and
gives each label the whole wedge to sit in. The donut code path then has no production caller. Keeping it
leaves a flag that is never toggled, a parameter that only receives its default, and tests that pin shapes
nobody renders. YAGNI rule 3 ("delete dead paths") says to remove it in the same change.

Success means the live dashboard shows a filled 3-wedge pie, every visible `%` label is readable and not
covered by the IDEAL inset, the spec matches the rendered shape, and no donut code remains in `apps/web`.

## Scope

### In Scope

- **Flip the call site.** Remove `conInterior` from `DistribucionPie` at
  `apps/web/src/components/ResumenScreen.tsx:150`.
- **Delete the donut code, which is dead in production:**
  - the `conInterior` prop, the `RATIO_INTERIOR` constant and `rInteriorAnillo` in `DistribucionPie.tsx`;
  - the `rInterior` prop on the internal `Pie` component, and the `rInterior` parameter of `centroidLabel`;
  - the `rInterior` parameter of `arcoPath` (`domain/pie-geometry.ts`), including its annular-wedge branch
    and its annular full-360° branch;
  - `radioEtiqueta`. The label radius becomes the full-pie value `r / 2`, which is exactly what
    `radioEtiqueta(r, 0)` returns today.
- **Delete or adapt the donut-only tests:**
  - `pie-geometry.test.ts`: the annular-wedge, annular-360°, `rInterior >= r` clamp and `radioEtiqueta`
    cases. Keep the filled-wedge regression cases.
  - `DistribucionPie.test.tsx`: the "donut hole when `conInterior` is enabled" test. Turn the
    "filled pie by default, opt-in hole" test into an unconditional filled-pie assertion.
- **Refresh the docblocks and comments** in `DistribucionPie.tsx`, `ResumenScreen.tsx` (the `conInterior`,
  D-01 note near line 48) and `pie-geometry.ts`, so they describe a filled pie only.
- **Add a spec delta for `web-app`:**
  - MODIFY `WG5-01` from "renders as a 3-wedge donut" / "a ring (donut), replacing today's filled pie" to a
    filled 3-wedge pie.
  - MODIFY `WG5-12` so the title and the "donut ring" `<svg>` wording in its accessibility scenario name
    the chart without asserting a donut shape.
- **Run a grep gate** over `apps/web` (source, tests and e2e) to confirm nothing else references
  `conInterior`, `RATIO_INTERIOR`, `rInterior` or `radioEtiqueta`. The pre-proposal grep found one other
  `arcoPath` caller, `MiniDistribucionPie.tsx`. It already calls the 5-argument filled form, so it is
  unaffected.
- **Do a visual acceptance check** with a skewed split (one bucket above 70%): no `%` label overlaps the
  IDEAL inset.

### Out of Scope

- **Moving or resizing the IDEAL mini-pie.** If the skewed-split check still shows an overlap after the
  flip, that is recorded as a follow-up, not fixed here.
- **`apps/mobile`.** It has its own label-less donut port (US-050) and is left untouched.
- **Renaming `apps/web/e2e/dashboard-donut.e2e.ts`** or its test titles. The e2e checks layout by bounding
  box and does not depend on the chart's shape.
- **General "ring" wording in the spec.** Phrases such as "ring-share", "ring apportionment", "ring
  wedge", "ring's data set", `BUCKETS_ANILLO`, and the `WTA-01` "mini ring" name the apportionment or the
  data set, not the shape, so they stay. The spec phase flags any sentence that does assert a hole or
  annulus. It does not rename wording in bulk.
- Any change to wedge proportions, colours, label content, the `< 5%` label suppression, interaction or
  accessibility semantics.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `web-app`:
  - `WG5-01` changes the required shape of the main chart from a donut or ring to a filled 3-wedge pie.
    Its proportion, ordering and exclusion rules do not change.
  - `WG5-12` changes only its shape wording ("the donut ring's `<svg>`", "the donut" in the title). Its
    accessibility and lint requirements stay the same.

## Approach

Exploration approach 1, "Minimal flip", extended with deletion of the dead code, as the user decided.

1. **Delete from the domain outward.** `arcoPath` loses its optional sixth parameter and both annular
   branches, which leaves only the filled-wedge and filled-360° paths. Those paths already have
   byte-for-byte regression tests. `radioEtiqueta` is removed. The component then computes the label
   radius as `r / 2` inline, or through a small local constant if the design phase prefers one. That is a
   design detail, not a new abstraction.
2. **Component.** Remove `conInterior`, `RATIO_INTERIOR`, `rInteriorAnillo` and the `rInterior` prop and
   argument that runs through `Pie` and `centroidLabel`. The IDEAL inset already renders filled wedges, so
   its output does not change.
3. **Call site.** Drop the `conInterior` attribute in `ResumenScreen.tsx`.
4. **Tests (Strict TDD).** First change the filled-pie test to an unconditional assertion that the main
   pie's wedges start at the centre (`M cx cy`), and add or keep a label-position assertion at `r / 2`.
   Watch them go RED against the current donut call path where they apply, then flip the code to GREEN.
   Delete the donut-only tests in the same step that deletes the code they pinned.
5. **Spec delta.** Write MODIFIED blocks for `WG5-01` and `WG5-12`. Use full requirement titles, because
   archive matches by exact canonical title. If a title changes, handle it as REMOVED + ADDED, not RENAMED.
6. **Gates.** Grep gate, web unit tests, `tsc -b`, eslint, Playwright e2e, and a visual check with a
   skewed split.

This follows KISS: it goes back to a shape and code path that already exist and are already tested, and it
adds no new geometry. It follows YAGNI: the flag and parameter have one possible value today, so both go.

### Rough changed-lines forecast (additions + deletions, authored)

| Area | Forecast |
|------|----------|
| `domain/pie-geometry.ts` (annular branches, `radioEtiqueta`, docblocks) | ~50 |
| `domain/pie-geometry.test.ts` (donut cases removed) | ~45 |
| `components/DistribucionPie.tsx` (prop, constant, threading, docblocks) | ~50 |
| `components/DistribucionPie.test.tsx` (donut test removed, default test adapted) | ~35 |
| `components/ResumenScreen.tsx` (call site + docblock) | ~8 |
| Spec delta `specs/web-app/spec.md` (`WG5-01`, `WG5-12`) | ~70 |
| **Total** | **~250, mostly deletions (Low 400-line budget risk)** |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/components/ResumenScreen.tsx` | Modified | Drop `conInterior` at line 150; refresh the docblock near line 48 |
| `apps/web/src/components/DistribucionPie.tsx` | Modified | Remove `conInterior`, `RATIO_INTERIOR`, `rInteriorAnillo`, `rInterior` threading; label radius `r / 2`; refresh docblocks |
| `apps/web/src/domain/pie-geometry.ts` | Modified | Remove the `arcoPath` `rInterior` parameter and annular branches; remove `radioEtiqueta` |
| `apps/web/src/domain/pie-geometry.test.ts` | Modified | Delete the donut-only cases; keep the filled-wedge regression contract |
| `apps/web/src/components/DistribucionPie.test.tsx` | Modified | Delete the donut-hole test; make the filled-pie assertion unconditional |
| `openspec/changes/distribucion-torta-completa/specs/web-app/spec.md` | New (delta) | MODIFIED `WG5-01`, `WG5-12` |
| `apps/web/src/components/MiniDistribucionPie.tsx` | Unaffected (verified) | Already calls the filled 5-argument `arcoPath` |
| `apps/web/e2e/dashboard-donut.e2e.ts`, `apps/web/e2e/fixtures/api-stubs.ts` | Unaffected | Layout-only assertions; "donut" appears only in names and comments (out of scope) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| With a skewed split (one bucket above 70%), a label near 135° could still come close to the IDEAL inset | Low | Explicit visual acceptance check; any remaining overlap becomes a recorded follow-up, not scope creep |
| The spec delta's MODIFIED title does not match the canonical title exactly, so archive fails to merge | Med | Copy the exact current titles; if a title's wording changes, use REMOVED + ADDED |
| A hidden consumer of `rInterior` or `radioEtiqueta` breaks the build | Low | The grep gate over `apps/web`, plus `tsc -b` (not `tsc --noEmit`, which checks nothing in this solution-style tsconfig) |
| Stale donut wording left in docblocks | Low | Grep for `donut`, `hole` and `D-01` in the touched files during apply |
| The 360px mobile layout changes because of different label geometry | Low | Re-run the mobile-floor harness at 360px; the SVG box size does not change |
| Web and mobile diverge in shape (web filled, mobile donut) | Accepted | Mobile is a separate port and explicitly out of scope; its spec already describes it on its own |

## Rollback Plan

Revert the change's commit or commits on `main` (`git revert <sha>`). The change is presentation-only and
self-contained in `apps/web` plus the spec: no API, schema, migration or data change, and no deploy
ordering dependency between Vercel and Render. After the revert, the previous donut code, its tests and the
`WG5-01` donut wording all return, and Vercel redeploys the web app from `main`.

## Dependencies

- None. No API or backend change, and no other open change touches `DistribucionPie` or `pie-geometry`
  (the latest merged work, PR #819, touched the upload summary, not the chart).

## Success Criteria

- [ ] The live dashboard's main chart renders a filled 3-wedge pie. Every main-pie wedge path starts at the
      centre (`M cx cy`), asserted in jsdom.
- [ ] On-wedge `%` labels are placed at `r / 2`, asserted in jsdom. The `< 5%` suppression is unchanged.
- [ ] Visual check with a skewed split (one bucket above 70%) shows no `%` label overlapping the IDEAL
      inset. If an overlap is observed, it is recorded as a follow-up issue and does not block this change.
- [ ] `rg 'conInterior|RATIO_INTERIOR|rInterior|radioEtiqueta' apps/web` returns no matches.
- [ ] The `web-app` spec delta MODIFIES `WG5-01` (filled pie) and `WG5-12` (no donut shape wording), with
      exact canonical titles.
- [ ] Checks pass:
  - web unit tests (`pnpm web test`);
  - `tsc -b` for `apps/web`;
  - `pnpm web lint` (eslint, including the scoped `jsx-a11y` override);
  - Playwright e2e on the mobile, tablet and desktop viewports, including `dashboard-donut.e2e.ts` and
    the mobile-floor harness at 360px.
- [ ] Authored diff under the 400-line budget (forecast about 250, mostly deletions).
