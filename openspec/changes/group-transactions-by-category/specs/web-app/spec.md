# Web App UI Specification — Delta (apps/web)

## Purpose

Adds category-grouped transaction display to the dashboard's right-hand panel
in `ResumenScreen`, replacing the single-bucket-at-a-time `BucketDetailList`
behavior, and turns the pie/legend into scroll+highlight navigation over the
grouped list. `/buckets/:bucket` stays a separate, unmodified route.

## ADDED Requirements

### Requirement: WG-01 — Right panel shows all non-empty category groups at once

The dashboard's right transactions panel MUST render every category
(`Bucket`) that has at least one transaction in the selected period, grouped
together, instead of one bucket selected at a time. Categories with zero
transactions that period MUST NOT render a group.

#### Scenario: A month with transactions in 3 of 5 buckets renders 3 groups

- GIVEN the selected period has transactions only in `Necesidades`, `Deseos`,
  and `SinCategoria`
- WHEN the dashboard renders
- THEN exactly those 3 groups are shown and `Ahorro`/`Ingreso` do not appear

#### Scenario: Empty month shows the existing empty state, not a broken list

- GIVEN the selected period has zero transactions
- WHEN the dashboard renders
- THEN the panel shows the existing "no data" empty state, not an empty or
  malformed grouped list

### Requirement: WG-02 — Groups render in fixed domain order

Groups MUST render in the fixed order `Ingreso → Necesidades → Deseos →
Ahorro → SinCategoria`, regardless of subtotal size or transaction count.

#### Scenario: Groups ignore subtotal size when ordering

- GIVEN `SinCategoria` has a larger subtotal than `Necesidades` in the period
- WHEN the panel renders
- THEN `Necesidades` still appears before `SinCategoria`

### Requirement: WG-03 — Rows within a group are sorted date descending

Within each group, transaction rows MUST be sorted by date descending (most
recent first).

#### Scenario: Newest transaction in a group appears first

- GIVEN a `Necesidades` group with transactions dated 2026-07-02 and 2026-07-15
- WHEN the group renders
- THEN the 2026-07-15 row appears above the 2026-07-02 row

### Requirement: WG-04 — Group header shows name, exact subtotal, and count

Each group header MUST show the category name, its transaction count, and its
subtotal computed client-side from the exact string/BigInt amounts in the
response — never from a `Number()`/`parseFloat()` conversion of `cargo`/
`abono`.

#### Scenario: Header reflects the group's own transactions only

- GIVEN a `Necesidades` group with 12 transactions summing to a known exact
  total
- WHEN the header renders
- THEN it shows `Necesidades`, that exact total, and `12`

#### Scenario: Subtotal precision survives amounts beyond safe-integer range

- GIVEN a group contains a transaction with `abono` beyond
  `Number.MAX_SAFE_INTEGER`
- WHEN the group's subtotal is computed
- THEN every digit of the aggregate is preserved (BigInt/integer-minor-units
  arithmetic, not `float`)

### Requirement: WG-05 — Pie/legend click scrolls to and highlights the matching group

Clicking a pie slice or legend entry MUST NOT swap the panel to a single
bucket. It MUST scroll the always-visible grouped list to that category's
group and visually highlight it.

#### Scenario: Clicking a legend entry scrolls to its group

- GIVEN the grouped list is showing `Necesidades`, `Deseos`, and `SinCategoria`
- WHEN the user clicks the `Deseos` legend entry
- THEN the panel scrolls so the `Deseos` group is in view and visibly
  highlighted

#### Scenario: Clicking a pie slice for a category with no transactions this period is a no-op target

- GIVEN `Ahorro` has zero transactions this period (no rendered group)
- WHEN the user clicks the `Ahorro` pie slice or legend entry
- THEN no scroll/highlight target error occurs — the interaction degrades
  gracefully (no group to jump to)

### Requirement: WG-06 — Group navigation is accessible (ADR-018, WCAG 2.2 AA)

The pie/legend-to-group navigation MUST be operable by keyboard alone, MUST
signal the highlighted group through a non-color cue in addition to color, and
MUST respect `prefers-reduced-motion` (no forced smooth-scroll animation when
the user has requested reduced motion).

#### Scenario: Keyboard-only activation reaches the same group

- GIVEN the user tabs to the `Necesidades` legend entry and presses Enter/Space
- WHEN the interaction fires
- THEN the same scroll-and-highlight behavior as a mouse click occurs

#### Scenario: Reduced-motion preference disables animated scrolling

- GIVEN the user's OS/browser has `prefers-reduced-motion: reduce` set
- WHEN a group is targeted for navigation
- THEN the view jumps to the group without an animated scroll transition

## MODIFIED Requirements

### Requirement: W3-01 — Bucket detail endpoint returns a flat, BigInt-safe, isolated list

`GET /api/buckets/:bucket?periodo=YYYY-MM` MUST return a flat per-transaction
list (money as strings) restricted to the authenticated `userId`'s accounts.
This endpoint, its route, its controller, and its DTO are UNCHANGED by this
delta — they exist solely to preserve `/buckets/:bucket` deep links, which no
longer back the dashboard's default transactions panel (that panel now uses
`GET /api/movimientos`, see `movimientos-api` spec).
(Previously: this endpoint backed the dashboard's single-bucket-at-a-time
right panel via `useDetalleBucket`; the dashboard panel now instead renders
the grouped-by-category list from `GET /api/movimientos`.)

#### Scenario: Valid bucket returns the flat list

- GIVEN transactions exist for `bucket=necesidades`, `periodo=2026-07`
- WHEN called with a valid key
- THEN the response is 200 with each amount as a decimal string

#### Scenario: User A cannot read User B's bucket detail

- GIVEN transactions exist for user B in `necesidades`
- WHEN user A's session requests that bucket/period
- THEN no user-B transaction appears in the response

#### Scenario: Deep link to `/buckets/:bucket` still renders independently of the dashboard panel

- GIVEN a user navigates directly to `/buckets/necesidades?periodo=2026-07`
- WHEN the route renders
- THEN it shows that single bucket's flat list exactly as before this change,
  unaffected by the dashboard's new grouped-list behavior

## Non-Goals

- No new `/api/movimientos`-adjacent endpoint or pagination.
- No inline transaction category editing (US-013, deferred).
- No cross-month/multi-period grouping — single selected period only.
- Mobile (`apps/mobile`) is untouched by this delta.
