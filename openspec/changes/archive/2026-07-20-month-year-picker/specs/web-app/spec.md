# Delta for web-app

## MODIFIED Requirements

### Requirement: WPER-01 — Viewed period is visible at the top of the dashboard, as an interactive trigger

The dashboard MUST display the currently viewed MES/AÑO prominently at the
top of the page, formatted in Spanish (e.g. "julio 2026"), using the existing
`mesCompletoLabel` helper. This MUST render identically for demo and
authenticated flows (shared route/component). The label MUST be rendered as
a real `<button>` (the popover trigger, WMYP-01), not static text.
(Previously: label was static text, no popover trigger.)

#### Scenario: Authenticated user sees the current period label at the top

- GIVEN an authenticated user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown prominently at the top of the dashboard, as a
  clickable button

#### Scenario: Demo user sees the same label in the same position

- GIVEN a demo user views the dashboard for period `2026-07`
- WHEN the page renders
- THEN "julio 2026" is shown at the top, identical in position, format, and
  interactivity to the authenticated flow

## ADDED Requirements

### Requirement: WMYP-01 — Period label opens/closes an accessible popover

Clicking the period label trigger MUST open a popover containing the month
grid and year navigation. Pressing Escape, clicking outside the popover, or
clicking the trigger again MUST close it. On close, focus MUST return to the
trigger.

#### Scenario: Clicking the label opens the popover

- GIVEN the popover is closed
- WHEN the user clicks the period label
- THEN the popover opens showing the month grid and year navigation

#### Scenario: Escape closes the popover and returns focus

- GIVEN the popover is open
- WHEN the user presses Escape
- THEN the popover closes and focus returns to the period label trigger

#### Scenario: Outside click closes the popover

- GIVEN the popover is open
- WHEN the user clicks outside the popover
- THEN the popover closes

### Requirement: WMYP-02 — Month grid shows 12 Spanish-abbreviated months with the active one marked

The popover MUST render a 12-cell grid using `mesAbreviado` (Ene..Dic) for
the year currently displayed in the popover. The cell matching the
dashboard's currently-viewed (year, month) MUST be visually marked as
active/selected.

#### Scenario: Current period is marked active in the grid

- GIVEN the dashboard is viewing `2026-07` and the popover shows year 2026
- WHEN the popover opens
- THEN the "Jul" cell is visually marked as active and no other cell is

### Requirement: WMYP-03 — Selecting a month jumps the period and closes the popover

Selecting an enabled month cell MUST set the viewed period to that
`(year, month)` through the existing `onChange` contract (URL search param
update + refetch), and MUST close the popover.

#### Scenario: Selecting a past month in the same year jumps directly

- GIVEN the dashboard is viewing `2026-07` and the popover is open on year
  2026
- WHEN the user selects "Mar"
- THEN the URL period param becomes `2026-03`, the dashboard refetches and
  displays "marzo 2026", and the popover closes

#### Scenario: Selecting a month after navigating to a past year jumps across years

- GIVEN the popover is open and the user navigated to year 2024
- WHEN the user selects "Nov"
- THEN the URL period param becomes `2024-11` and the popover closes

### Requirement: WMYP-04 — Year navigation inside the popover is clamped at the current year

The popover MUST offer prev-year and next-year controls that change only the
grid's displayed year (not the dashboard's viewed period) until a month is
selected. The next-year control MUST be disabled when the displayed year
equals the current calendar year, and MUST NOT navigate beyond it.

#### Scenario: Prev-year moves the grid back one year

- GIVEN the popover is open showing year 2026
- WHEN the user activates prev-year
- THEN the grid shows year 2025 with `mesAbreviado` cells for 2025

#### Scenario: Next-year is disabled at the current year

- GIVEN the popover is open showing the current calendar year (2026)
- WHEN the popover renders
- THEN the next-year control is disabled, and activating it produces no
  change

### Requirement: WMYP-05 — Future months are disabled in the current year

When the grid displays the current calendar year, months after the current
month MUST be rendered disabled (not selectable, `disabled` semantics for
assistive tech). Grids for past years have no disabled months. This mirrors
the existing next-arrow clamp (WPER-03).

#### Scenario: Months after the current month are disabled

- GIVEN the current month is `2026-07` and the grid displays year 2026
- WHEN the grid renders
- THEN "Ago" through "Dic" are disabled and "Ene" through "Jul" are enabled

#### Scenario: Clicking a disabled future month does nothing

- GIVEN the grid displays year 2026 with "Ago" disabled
- WHEN the user clicks or activates "Ago" via keyboard
- THEN no period change occurs, no refetch happens, and the popover stays
  open

### Requirement: WMYP-06 — Existing arrow/"Hoy" navigation is unaffected

Adding the popover picker MUST NOT change the behavior, presence, or clamp
logic of the prev/next arrows or the "Hoy" control (WPER-02, WPER-03,
WPER-04). Both navigation modes MUST coexist and update the same URL period
state.

#### Scenario: Prev/next arrows and "Hoy" still work after the popover ships

- GIVEN the dashboard has the popover trigger available
- WHEN the user uses the prev arrow, the next arrow, or "Hoy" instead of the
  popover
- THEN the period changes exactly as specified in WPER-02/03/04, unaffected
  by the popover's existence

### Requirement: WMYP-07 — Popover and grid are keyboard-operable and accessible (WCAG 2.2 AA)

The trigger MUST expose a Spanish `aria-label`/accessible name. The popover
MUST use appropriate ARIA roles for a grid of selectable options, each month
cell MUST be reachable and operable via keyboard (Tab/Arrow keys, Enter/
Space), and disabled cells MUST expose native disabled semantics. Year
navigation controls MUST have distinct Spanish `aria-label`s (e.g. "Año
anterior", "Año siguiente").

#### Scenario: Keyboard-only user can open, navigate, and select

- GIVEN a keyboard-only user tabs to the period label trigger
- WHEN they activate it, navigate the grid via keyboard, and press Enter on
  an enabled month
- THEN the popover opens, the grid is keyboard-navigable, and selection
  behaves identically to a mouse click

### Requirement: WMYP-08 — Popover styling uses Serene Finance tokens only

The popover, month grid, and year navigation MUST use only Serene Finance
design tokens for colors, borders, and focus states. Raw Tailwind palette
classes (e.g. `slate-*`, `gray-*`) MUST NOT appear anywhere in this markup.

#### Scenario: No raw Tailwind palette classes on the popover

- GIVEN the popover's rendered markup
- WHEN its class names are inspected
- THEN no raw Tailwind color-palette utility classes are present — only
  Serene Finance token-based classes/variables
