# Delta for web-app

**Title-matching note (per this change's spec-phase instructions):** both `WG5-01` and `WG5-12` change a
word in their canonical `### Requirement:` heading (donut/ring wording removed). Archive matches
`MODIFIED` requirements by the exact heading string, so a wording change there cannot be expressed as
`MODIFIED` — it is expressed as `REMOVED` (the exact current heading) + `ADDED` (the new heading), per
this repo's documented gotcha. All other content in both requirements — the apportionment/data-set rules
for `WG5-01`, and the lint/keyboard/accessible-name rules for `WG5-12` — carries forward unchanged; only
the shape wording changes. `WG5-12`'s trailing `WG5-13` retirement note (a blockquote with no `###`
heading of its own, sitting between `WG5-12`'s last scenario and the next `##` section) is preserved
verbatim inside the `ADDED` `WG5-12` block so it is not dropped when the old span is removed.

## ADDED Requirements

### Requirement: WG5-01 — Main chart renders as a filled 3-wedge pie, proportions from a client-side share-of-spending apportionment, not from `porcentajeBp` (CA-01, CA-06, ADR-024)

The dashboard's main chart MUST render as a filled pie — no inner hole — with exactly 3
wedges — Necesidades, Deseos, Ahorro — in that order. Wedge proportions MUST be derived from
`calcularDistribucionGasto`'s share-of-spending ratio: a largest-remainder apportionment computed
client-side over the raw BigInt totals of the 3 `BUCKETS_ANILLO` items. It is a sanctioned presentation
derivation under ADR-024 — it changes neither the money shown nor how a transaction is classified, only how
already-shown totals are apportioned into wedge angles.

This wedge-proportion value is DISTINCT from `porcentajeBp` — the backend's income-share 50/30/20 metric.
`porcentajeBp` MUST continue to pass through verbatim, unmodified, but ONLY where it is used today:
`BucketViewModel.porcentajeLabel`. `porcentajeBp` is NOT the source of the ring's wedge angles, of the
legend's spend-bucket percentages (`WG5-03`), or of the IDEAL 50/30/20 inset's wedge ratios — the inset
derives its own ratios client-side from `dto.targets` (the wire's hardcoded 50/30/20 reference values,
documented "Hardcoded 50/30/20 reference targets", not period data), computed as
`Math.round((valores[bucket] / total) * 100)` in `DistribucionPie.tsx`'s `slicesIdeales`. This is a third,
pre-existing client-side percentage derivation, distinct from both the ring apportionment and from
`porcentajeBp`, unchanged by this change (design D-02).

Ingresos MUST NOT appear as a ring wedge — it is excluded by construction (its item never enters the ring's
data set), not filtered out at render time. Since issue #778 tramo 5b, a `SinCategoria` entry the API may
still send in `buckets[]` (deploy-order safety) is likewise excluded by construction — `BUCKETS_ANILLO` no
longer includes it, so it never enters the ring's data set and cannot dilute the 3 spend-bucket shares (the
retired `WG5-13` described the opposite, now-obsolete behavior).
(Previously: this requirement mandated a ring (donut) shape, "replacing today's filled pie." This change
reverts the chart to a filled pie — no inner hole — while leaving the ring-share apportionment terminology,
the `BUCKETS_ANILLO` data set, and every other rule in this requirement unchanged.)

#### Scenario: The pie renders exactly 3 wedges, in the fixed bucket order (jsdom)

- GIVEN a period with data in all 3 spend buckets
- WHEN the dashboard's chart renders
- THEN the pie shows exactly 3 wedges, ordered Necesidades, Deseos, Ahorro — never a 4th wedge for
  Ingresos or Sin categoría

#### Scenario: Wedge proportions equal `calcularDistribucionGasto`'s share-of-spending ratio, not `porcentajeBp` (jsdom)

- GIVEN the raw BigInt totals for the 3 `BUCKETS_ANILLO` items
- WHEN the ring's wedge angles are computed
- THEN each wedge's arc is proportional to that item's share of the combined ring total, apportioned via
  `calcularDistribucionGasto`'s existing largest-remainder rule so the three wedges sum to exactly 100 —
  never derived from `porcentajeBp`

#### Scenario: Ingresos never appears as a ring wedge, even when it is the largest amount (jsdom)

- GIVEN a period where `totalIngreso` is larger than any spend bucket's total
- WHEN the pie renders
- THEN it still shows only the 3 wedges above — Ingresos has no ring representation at any amount

#### Scenario: A legacy SinCategoria bucket entry is ignored, never a 4th wedge (jsdom)

- GIVEN a `/api/resumen` payload that still carries a `SinCategoria` entry in `buckets[]` with a nonzero
  total (deploy-order safety shape)
- WHEN the dashboard's chart renders
- THEN the pie still shows exactly the same 3 wedges, with the same proportions as an equivalent payload
  without that entry

#### Scenario: Every wedge path starts at the chart's centre — no inner hole (jsdom)

- GIVEN a period with data in all 3 spend buckets
- WHEN each wedge's rendered SVG path is inspected
- THEN every wedge's path starts at the chart's centre point (an `M cx cy` moveto, not an annular segment
  that starts and ends on an inner radius) — the chart has no inner hole, unlike the donut shape this
  requirement previously mandated

### Requirement: WG5-12 — New/touched files pass `eslint-jsx-a11y` at `error` scope; the chart, legend, and semáforo tag are keyboard-operable and accessible (CA-06, WCAG 2.2 AA, ADR-018)

Every file this change touches (`DistribucionPie.tsx`, `LeyendaGasto.tsx`, `SemaforoBadge.tsx`,
`SemaforoTag.tsx`, `ResumenScreen.tsx`, `routes/_authenticated/semaforo*.tsx` — glob, per the design's
`D-05`/`D-08` file lists) MUST be added to `eslint.config.js`'s scoped `error`-severity
`eslint-jsx-a11y` override, per the
existing US-042/043/063 precedent (`WCFG-12`, `WCTM-*`) and this change's own file lists in design
`D-05`/`D-08`.
The chart's `<svg>` MUST expose an accessible name/description (role and aria pattern consistent with
the existing `SemaforoBadge`'s `role="img"` + `aria-label` convention — never color alone). The 3
spend-bucket rows and the Ingresos row MUST remain keyboard-operable
(Tab/Enter/Space), matching their `<button>` semantics — the Ingresos row is now a real interactive control
(`WG5-06`). The semáforo tag MUST be keyboard-operable (Tab/Enter/Space) with a visible focus ring.
(Previously: only the 3 spend-bucket rows and a Sin categoría row were keyboard-operable; the Ingresos
row was excluded from Tab order under WG5-06's not-clickable rule. US-054 adds the Ingresos page's own
files to the same scoped override — WDI-07. Issue #778 tramo 5b later retired the Sin categoría row
entirely — WG5-03.)
(Previously: this requirement's title and its accessible-name scenario referred to "the donut ring."
This change updates that wording to "the chart" only, because the chart is now a filled pie — WG5-01. The
lint scope, the accessible-name rule, and every keyboard-operability rule are otherwise unchanged.)

#### Scenario: The scoped lint gate is clean on every touched file

- GIVEN the files this change touches
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

#### Scenario: The chart exposes an accessible name, not color alone (jsdom)

- GIVEN the rendered chart
- WHEN it is inspected via the accessibility tree
- THEN it exposes a role and accessible name/description conveying its meaning — not conveyed by color
  alone

#### Scenario: A keyboard-only user can operate every clickable legend row and the semáforo tag (jsdom)

- GIVEN a keyboard-only user tabs through the chart card
- WHEN they reach a spend-bucket row, the Ingresos row, or the semáforo tag, and
  activate it with Enter or Space
- THEN each behaves identically to its mouse-click behavior, with a visible focus ring at every step — the
  Ingresos row is reached by Tab and navigates to `/ingresos` on activation (`WG5-06`)

> WG5-13 (Sin categoría diluting the ring/legend denominator) retired by issue #778 tramo 5b:
> `BUCKETS_ANILLO` no longer includes `SinCategoria` (mobile mirrors this — `mobile-resumen-screen`
> MOB-08), so the ring/legend apportion over exactly the 3 spend buckets with no dilution — see the
> rewritten `WG5-01`.

## REMOVED Requirements

### Requirement: WG5-01 — Main chart renders as a 3-wedge donut, proportions from a client-side share-of-spending apportionment, not from `porcentajeBp` (CA-01, CA-06, ADR-024)

(Reason: The chart no longer renders as a ring/donut with an inner hole; it renders as a filled 3-wedge pie. The heading itself asserted the removed donut shape, so it cannot remain a `MODIFIED` match — see `ADDED` "WG5-01 — Main chart renders as a filled 3-wedge pie ...".)
(Migration: The requirement's ID and every apportionment/data-set rule — the share-of-spending ratio, the `porcentajeBp` exclusion, the Ingresos exclusion, the legacy `SinCategoria` exclusion — carry forward unchanged into the `ADDED` replacement above; only the shape wording and one new no-hole scenario change.)

### Requirement: WG5-12 — New/touched files pass `eslint-jsx-a11y` at `error` scope; the donut, legend, and semáforo tag are keyboard-operable and accessible (CA-06, WCAG 2.2 AA, ADR-018)

(Reason: The heading and one scenario referred to "the donut ring," which no longer exists as a shape — the chart is a filled pie (`WG5-01`). The heading's shape wording is stale, so it cannot remain a `MODIFIED` match — see `ADDED` "WG5-12 — ... the chart, legend, and semáforo tag are keyboard-operable and accessible ...".)
(Migration: The lint-scope rule, the accessible-name rule, and every keyboard-operability rule carry forward unchanged into the `ADDED` replacement above, including the trailing `WG5-13` retirement note; only "donut ring" becomes "chart" in the heading and in one scenario's title/body.)
