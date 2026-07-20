# Delta for web-app

## ADDED Requirements

### Requirement: WPER-01 — Viewed period is visible at the top of the dashboard

The dashboard MUST display the currently viewed MES/AÑO prominently at the
top of the page, formatted in Spanish (e.g. "julio 2026"), using the existing
`mesCompletoLabel` helper. This MUST render identically for demo and
authenticated flows (shared route/component).

#### Scenario: Authenticated user sees the current period label at the top

- GIVEN an authenticated user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown prominently at the top of the dashboard

#### Scenario: Demo user sees the same label in the same position

- GIVEN a demo user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown at the top, identical in position and format to
  the authenticated flow

### Requirement: WPER-02 — Prev navigation moves one month back

The prev control MUST move the viewed period back exactly one calendar
month, update the URL search param, and trigger a data refetch for the new
period. Prev MUST remain enabled for any past month (unbounded).

#### Scenario: Clicking prev from July 2026 goes to June 2026

- GIVEN the dashboard is viewing period `2026-07`
- WHEN the user activates the prev control
- THEN the URL period param becomes `2026-06`
- AND the dashboard refetches and displays "junio 2026"

### Requirement: WPER-03 — Next navigation is clamped at the current month

The next control MUST move the viewed period forward exactly one calendar
month, update the URL search param, and trigger a refetch, UNLESS the viewed
period is already the current month, in which case the next control MUST be
disabled and MUST NOT navigate to a future period.

#### Scenario: Next is enabled and works when viewing a past month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-06`
- WHEN the user activates the next control
- THEN the URL period param becomes `2026-07`
- AND the dashboard refetches and displays "julio 2026"

#### Scenario: Next is disabled when viewing the current month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-07`
- WHEN the dashboard renders
- THEN the next control is disabled
- AND activating it (click or keyboard) produces no navigation and no
  refetch

### Requirement: WPER-04 — "Hoy" jumps to the current month

The "Hoy" control MUST set the viewed period to the current calendar month
(via the existing `periodoActualUTC` helper), updating the URL search param
and triggering a refetch. When the viewed period is already the current
month, "Hoy" MUST be disabled (no-op).

#### Scenario: "Hoy" from a past month returns to the current month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-03`
- WHEN the user activates "Hoy"
- THEN the URL period param becomes `2026-07`
- AND the dashboard refetches and displays "julio 2026"

#### Scenario: "Hoy" is disabled when already viewing the current month

- GIVEN the current month is `2026-07` and the dashboard is viewing `2026-07`
- WHEN the dashboard renders
- THEN the "Hoy" control is disabled

### Requirement: WPER-05 — Changing the period preserves the bucket-selection-reset behavior

Any period change performed through prev, next, or "Hoy" MUST route through
the existing `onPeriodoChange` callback path (URL param), so the
pre-existing bucket-selection-reset effect in `ResumenScreen` continues to
fire unchanged. No parallel state source may be introduced for period.

#### Scenario: Selecting a bucket then changing period clears the selection

- GIVEN a bucket (e.g. Deseos) is selected in the dashboard panel
- WHEN the user navigates to a different period via prev, next, or "Hoy"
- THEN the bucket selection is cleared, matching pre-existing behavior for
  period changes

### Requirement: WPER-06 — Period controls are accessible (WCAG 2.2 AA)

Prev, next, and "Hoy" MUST be real `<button>` elements, each with a distinct
Spanish `aria-label` (e.g. "Mes anterior", "Mes siguiente", "Ir al mes
actual"), operable via keyboard (Tab/Enter/Space), and MUST show a visible
focus ring. Disabled controls MUST expose their disabled state to assistive
technology (native `disabled` attribute).

#### Scenario: Keyboard-only user can navigate periods

- GIVEN a keyboard-only user tabs to the prev control
- WHEN they activate it with Enter or Space
- THEN the period changes exactly as a mouse click would, and focus remains
  visible on the control

#### Scenario: Disabled next control is announced as disabled

- GIVEN the dashboard is viewing the current month
- WHEN a screen reader reaches the next control
- THEN it is announced as disabled, not merely visually dimmed

### Requirement: WPER-07 — Period control styling uses Serene Finance tokens only

The period selector control MUST use only Serene Finance design tokens
(e.g. `--color-primary`, `--color-muted`, `--color-border`) for its colors,
borders, and focus states. It MUST NOT use raw Tailwind palette classes
(e.g. `slate-*`, `gray-*`) anywhere in its markup.

#### Scenario: No raw Tailwind palette classes remain on the control

- GIVEN the period selector component's rendered markup
- WHEN its class names are inspected
- THEN no raw Tailwind color-palette utility classes (e.g. `slate-*`) are
  present — only Serene Finance token-based classes/variables
