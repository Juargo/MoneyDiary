# Delta for web-app

## ADDED Requirements

### Requirement: DCR-01 — Income card has a semantic income identity

`IngresoCard` MUST render with the pastel-green fill token `--color-ingreso`
(`#d1fae5`) as its background, a `TrendingUp` lucide icon, and the income
amount/label text styled with the `--color-ingreso-foreground` token (`#065f46`).

#### Scenario: Income card shows mint fill, green amount, and trend icon

- GIVEN the dashboard renders `IngresoCard` for a period with income
- WHEN the card mounts
- THEN it has the `bg-ingreso` fill class, a `TrendingUp` icon is present,
  and the amount/label use the `text-ingreso-foreground` class

### Requirement: DCR-02 — Income card has no decorative left border

`IngresoCard` MUST NOT render `border-l-4 border-l-slate-800` or any other
decorative left-border utility.

#### Scenario: No left-border classes on the income card

- GIVEN `IngresoCard`'s rendered markup
- WHEN its class names are inspected
- THEN neither `border-l-4` nor `border-l-slate-800` (nor any `border-l-*`)
  is present

### Requirement: DCR-03 — Income card uses design tokens only, no raw palette utilities

`IngresoCard` MUST consume Serene Finance design tokens for all color styling
and MUST NOT use raw Tailwind palette utilities (e.g. `slate-*`).

#### Scenario: No raw slate utilities remain on the income card

- GIVEN `IngresoCard`'s rendered markup
- WHEN its class names are inspected
- THEN no `slate-*` utility classes are present — only token-based classes

### Requirement: DCR-04 — Authenticated app shell uses the pale-blue background token

The `--background` token MUST be `#e8f0fa` in light mode, applied app-shell-wide
via the existing `bg-background` usage.

#### Scenario: App shell background is pale pastel blue

- GIVEN the authenticated web app renders in light mode
- WHEN the app shell's computed background is inspected
- THEN it resolves to `#e8f0fa`

### Requirement: DCR-05 — Primary token is `#2260b2` in light mode

The `--primary` token MUST be `#2260b2` in light mode. Components that
reference `--primary` (buttons, headings) MUST reflect this value without
component-level changes.

#### Scenario: Primary-styled elements pick up the new blue

- GIVEN a button or heading styled with the `primary` token in light mode
- WHEN its computed color/background is inspected
- THEN it resolves to `#2260b2`

### Requirement: DCR-06 — New color pairings meet WCAG 2.2 AA (ADR-018)

Every pairing introduced or changed by this spec MUST meet WCAG 2.2 AA
(≥4.5:1 for text): income text on income fill, primary on white, and primary
on the new background.

#### Scenario: Documented pairings meet AA contrast

- GIVEN the pairings `--color-ingreso-foreground` on `--color-ingreso`, `--primary`
  on white, and `--primary` on `--background`
- WHEN their contrast ratios are computed
- THEN they are 6.78:1, 6.21:1, and 5.40:1 respectively — all ≥4.5:1 AA

### Requirement: DCR-07 — Dark mode is unaffected

Only light-mode `:root` tokens change. The `.dark` theme MUST continue to
render without regression (no removed rules, no broken component).

#### Scenario: Dark mode renders unchanged

- GIVEN the app is switched to dark mode
- WHEN the dashboard renders
- THEN `.dark` token values are unchanged from before this change and the
  layout renders without errors

## Non-Requirements (out of scope)

- `SemaforoBadge` styling and `bucket-colors.ts` are unaffected by this
  change; no requirement here governs their behavior.
- `apps/mobile`, `apps/landing`, and backend (`apps/api`) are unaffected;
  no requirement here governs their behavior.
