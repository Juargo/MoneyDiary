# Design: Dashboard Color Refinements (web)

> Scope: `apps/web` ONLY, single PR, presentation-only. The palette is LOCKED
> (proposal `sdd/dashboard-color-refinements/proposal`, obs #334) — this doc is
> the technical HOW, not a re-decision of hex values. No new deps, no
> abstraction layer (DRY/KISS/YAGNI): 2 tokens + 1 component rewrite + 2
> `:root` edits + test update.

Architecture: extend Sprint 9's Serene Finance token pipeline in
`apps/web/src/index.css`. No new pattern is introduced; every color already
flows through `index.css` tokens and this change adds two more tokens plus two
value swaps to existing tokens. Nothing structural changes.

---

## 1. Token wiring in Tailwind 4 (`apps/web/src/index.css`)

### The two existing pipelines (precedent to follow)

The file runs **two distinct `@theme` mechanisms** — pick the right one:

- **`@theme { … }`** (lines 5–26): direct `--color-*` **constants** (the bucket
  fills `--color-necesidades`/`--color-gustos`/`--color-ahorro`/`--color-exceso`,
  lines 22–25). Tailwind 4 emits `bg-necesidades`, `text-*`, `border-*`,
  `fill-*` utilities for each, AND exposes `var(--color-necesidades)` for SVG
  `fill` (comment lines 12–21). These are **static** — one value, shared by
  light and dark, no `:root` indirection.
- **`@theme inline { … }`** (lines 89–112): maps semantic names to runtime vars,
  e.g. `--color-primary: var(--primary)` (line 96). The `inline` keyword makes
  Tailwind emit `var(--primary)` into the utility instead of the resolved color,
  so the `:root` (lines 46–66) / `.dark` (lines 68–87) swap works at runtime.

### Decision: income tokens go in the FIRST `@theme` block (lines 22–25 neighborhood)

`--color-ingreso` and `--color-ingreso-foreground` are **theme-level constants** (they do
NOT vary light/dark — see §4), so they belong beside the bucket fills in the
plain `@theme` block, NOT in `@theme inline` and NOT in `:root`/`.dark`. This is
the exact precedent `--color-necesidades` sets.

Add after line 25 (`--color-exceso`):

```css
  /*
   * Income identity chip (IngresoCard). DIVERGES from the bucket tokens
   * above: those are FILL-only, but income is a two-tier PAIR —
   *   --color-ingreso    = pastel mint FILL  (card background)
   *   --color-ingreso-foreground = deep emerald TEXT (label + amount, ~6.78:1 on fill)
   * The `-fg` suffix mirrors shadcn's `-foreground` convention so a maintainer
   * never mistakes the text tone for a fill. Self-contained (mint + green),
   * so it reads on any page background — no light/dark variant needed.
   */
  --color-ingreso: #d1fae5;    /* light mint — card FILL (= SemaforoBadge "verde") */
  --color-ingreso-foreground: #065f46; /* deep emerald — label + amount TEXT (6.78:1 AA) */
```

### Naming: no collision, fits the bucket namespace

`--color-ingreso` / `--color-ingreso-foreground` do not exist anywhere in the file (grep
confirmed). They join the same `--color-*` namespace as the bucket fills.
Utilities Tailwind 4 generates: `bg-ingreso`, `text-ingreso` (from
`--color-ingreso`) and `bg-ingreso-foreground`, `text-ingreso-foreground` (from
`--color-ingreso-foreground`). The component consumes `bg-ingreso` + `text-ingreso-foreground`.

**One subtlety to flag, not fix:** the block-level comment on lines 19–20 says
"THESE ARE FILLS ONLY, never text." `--color-ingreso-foreground` is a TEXT token living
in that block. The added comment above resolves the ambiguity locally; do not
weaken the global rule (the bucket fills stay fills-only). This is the only
wiring nuance in the change.

### Note vs. mobile (`apps/mobile`): intentional divergence

Mobile's `ingreso` token is `#3B4266` (dark slate-navy — `tailwind.config.js:12`,
`src/theme/colors.ts:27`), used as both bar-fill and text. Web deliberately
diverges to a mint-fill + green-text pair, exactly as the web bucket palette
already diverges from mobile "by product decision" (index.css comment lines
14–15). The web `IngresoCard` remains a **structural** DOM port of mobile's
(label over big amount), but its color identity is web-only. See §2.

---

## 2. `IngresoCard` rewrite (`apps/web/src/components/IngresoCard.tsx`)

### Before (current, lines 11–16)

```tsx
<Card className="border-l-4 border-l-slate-800">
  <CardContent className="flex flex-col items-center gap-1 text-center">
    <span className="text-xs font-semibold tracking-widest text-slate-500">INGRESOS</span>
    <span className="text-4xl font-extrabold text-slate-900">{totalIngreso}</span>
  </CardContent>
</Card>
```

### After

```tsx
import { TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function IngresoCard({ totalIngreso }: { readonly totalIngreso: string }) {
  return (
    <Card className="bg-ingreso">
      <CardContent className="flex flex-col items-center gap-1 text-center">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-ingreso-foreground">
          <TrendingUp aria-hidden className="size-4" data-testid="ingreso-trend-icon" />
          INGRESOS
        </span>
        <span className="text-4xl font-extrabold text-ingreso-foreground">{totalIngreso}</span>
      </CardContent>
    </Card>
  )
}
```

### Decisions

- **Fill:** `Card` default class is `… border bg-card …` (`ui/card.tsx:10`).
  Appending `bg-ingreso` overrides `bg-card` because `cn` = `twMerge(clsx(...))`
  (`lib/utils.ts:5`) — tailwind-merge dedupes conflicting `bg-*` color utilities,
  last wins. Same mechanism the bucket classes already rely on. No inline style,
  no arbitrary value.
- **Border:** drop `border-l-4 border-l-slate-800` entirely. Keep the Card's
  default all-around neutral `border` (`--border` #c4c6cf via the base layer,
  index.css lines 128–132) — it carries card separation on the pale-blue shell
  and is consistent with the other dashboard cards. Only the semantic left-bar
  goes. No `border-transparent` needed.
- **Icon placement:** `TrendingUp` sits **inline before the "INGRESOS" label**,
  in the same centered row (`flex items-center gap-1.5`). Rationale: the label
  is the semantic anchor, the icon reinforces the "income up" identity beside
  it, and the amount stays the single large focal element (mobile parity: label
  over amount). Size `size-4` (16px), tinted `text-ingreso-foreground` via inheritance
  (lucide `stroke="currentColor"`), so it needs no color class of its own.
- **Label color:** becomes `text-ingreso-foreground` (deep emerald, 6.78:1 on mint, AA)
  — reuse the amount's token, do NOT keep `slate-500` and do NOT add a third
  neutral token (KISS/YAGNI; the proposal WCAG table already assigns
  `--color-ingreso-foreground` to "amount + label TEXT").
- **Amount color:** `text-ingreso-foreground` (was `text-slate-900`).
- **Unchanged:** props signature, JSDoc intent (update the "left accent bar"
  wording), `totalIngreso` rendered verbatim (view-model already formats it).

---

## 3. `--primary` = `#2260b2` ripple (`apps/web/src/index.css:54`)

### The change is one line

```css
/* line 54, light :root */
--primary: #2260b2; /* strong blue — buttons/heading TEXT (6.21:1 on white) */
```

Consumed exclusively through `@theme inline` `--color-primary: var(--primary)`
(line 96), so every `bg-primary` / `text-primary` / `border-primary` utility
picks up the new value at runtime with no further edits. `.dark --primary`
(line 75, a light oklch) is untouched.

### Enumerated ripple (every `--primary` consumer in `apps/web/src`)

| File:line | Usage | Surface | Contrast after swap | AA |
|---|---|---|---|---|
| `ui/button.tsx:12` | `bg-primary text-primary-foreground` | white text on #2260b2 | 6.21:1 | ✅ |
| `ui/button.tsx:21` | `text-primary` (link variant) | #2260b2 on white/card | 6.21:1 | ✅ |
| `ui/badge.tsx:12` | `bg-primary text-primary-foreground` | white on #2260b2 | 6.21:1 | ✅ |
| `ui/badge.tsx:20` | `text-primary` (link variant) | #2260b2 on white | 6.21:1 | ✅ |
| `app-shell/Sidebar.tsx:18` | `text-primary` (brand wordmark) | #2260b2 on `--background` #e8f0fa | 5.40:1 | ✅ |
| `app-shell/NavItem.tsx:13` | `border-primary bg-accent text-primary` (active desktop) | #2260b2 text on `--accent` #eeeeee | ≈5.8:1 | ✅ |
| `app-shell/NavItem.tsx:18` | `text-primary` (active mobile tab) | #2260b2 on card/bg | ≥5.40:1 | ✅ |
| `ResumenAnual.tsx:146` | `hover:border-primary` | border only (non-text) | n/a | — |
| `ResumenAnual.tsx:147` | `border-2 border-primary bg-muted` (current-month cell) | border only | n/a | — |

Worst-case text pairing is the Sidebar wordmark / active nav on the new pale-blue
shell at **5.40:1** — still ≥ AA 4.5:1. No consumer drops below AA. Border-only
uses (`ResumenAnual`) carry no text-contrast requirement.

**`--primary-foreground` stays `#ffffff`** (line 55): white on #2260b2 = 6.21:1
(AA) — correct, no change.

This ripple is intentional (a punchier emphasis blue). Review the whole app
visually in the single PR; there is nothing to gate beyond the numbers above.

### `--background` swap (same block, line 48)

```css
--background: #e8f0fa; /* surface — pale pastel blue */
```

Consumed via `@theme inline` `--color-background: var(--background)` (line 90);
`AppShell` uses `bg-background`. No text sits directly on `--background` (cards
carry their own white `bg-card`); `--foreground` #1a1c1c on #e8f0fa = 14.9:1
anyway. Card-vs-shell separation is carried by `--border` #c4c6cf, not luminance.

---

## 4. Dark mode

- **Only the light `:root` is touched** (lines 48, 54). The `.dark` block (lines
  68–87) is not edited — `.dark --primary`, `.dark --background` keep their
  oklch values. The proposal's "no regression" guarantee holds by construction.
- **`--color-ingreso*` are theme-level constants**, declared once in the plain
  `@theme` block (§1), NOT split into `:root`/`.dark`. Justification: the income
  chip is a **self-contained pair** (mint fill + emerald text) whose contrast is
  internal to the card, independent of the page background. It does not need a
  dark variant, and giving it one would be YAGNI (`.dark` is inert — no theme
  toggle exists, index.css comment lines 43–44).
- **Dark smoke-check (reasoning only, dark isn't the MVP focus):** if the card
  ever renders under `.dark`, it still paints `#d1fae5` fill + `#065f46` text
  (the tokens are shared), so the chip keeps its 6.78:1 internal contrast and
  stays legible. It would look like a light chip on a dark page — visually
  loud but readable, never a contrast failure. Acceptable; revisit only if/when
  a dark theme ships.

---

## 5. Test strategy (strict TDD — tests first)

File: `apps/web/src/components/IngresoCard.test.tsx` (currently 2 tests: exact
amount render + "INGRESOS" label — both KEPT, still valid). Add/adjust
RED-first, then implement §2 to green.

### New assertions

1. **Icon rendered — stable query.** lucide renders an `<svg>`. Do NOT query by
   the internal `lucide-trending-up` class (brittle, couples to lucide
   internals) and do NOT use `getByRole('img')` (the icon is `aria-hidden`, so
   it has no role). Query the explicit hook instead:
   ```tsx
   render(<IngresoCard totalIngreso="$1.000.000" />)
   expect(screen.getByTestId('ingreso-trend-icon')).toBeInTheDocument()
   ```
   (`data-testid` is forwarded by lucide-react onto the `<svg>`.)
2. **No left border / no slate.** Assert the semantic left-bar is gone. Query
   the card root by its stable slot and assert the removed class is absent:
   ```tsx
   const card = container.querySelector('[data-slot="card"]')!
   expect(card).not.toHaveClass('border-l-4')
   ```
   (`data-slot="card"` is set by `ui/card.tsx:8`.)
3. **Token classes present.** Assert the fill and text tokens are wired:
   ```tsx
   expect(container.querySelector('[data-slot="card"]')).toHaveClass('bg-ingreso')
   expect(screen.getByText('$1.000.000')).toHaveClass('text-ingreso-foreground')
   ```
   (Class-name assertions, not computed color — jsdom does not resolve Tailwind;
   this verifies the component emits the right tokens, which is the unit's job.)

### a11y

- `TrendingUp` is **decorative**: the visible "INGRESOS" text + amount carry all
  meaning. Mark it `aria-hidden` (already in §2 markup) so screen readers do not
  announce a redundant/confusing "trending up" graphic. No accessible name is
  added to the icon. This matches ADR-018 (WCAG 2.2 AA) — decorative imagery is
  hidden from the a11y tree; text carries semantics.
- No change to the accessible name of the card content; the amount and label
  remain plain text nodes.

---

## Design decisions (ADR-style)

- **DD-1: Income is a two-token FILL+TEXT pair, in the constant `@theme` block.**
  Rationale: honors the two-tier rule and the shadcn `-foreground` naming, keeps
  colors out of components (DRY). Rejected: a single `--color-ingreso` used for
  both fill and text (violates two-tier, low contrast); a `:root`/`.dark` split
  (YAGNI — chip is self-contained).
- **DD-2: Reuse `--primary` for `#2260b2`, do not add `--accent`.** Rationale
  (from proposal): `--accent` #eeeeee is a neutral hover SURFACE with dark
  `accent-foreground`; a dark blue there breaks every `bg-accent`. `--primary`
  is already the single emphasis-blue token. One-line swap, DRY.
- **DD-3: Keep the neutral all-around card border, drop only the slate left-bar.**
  Rationale: separation on the pale-blue shell + consistency with sibling cards;
  minimal diff.
- **DD-4: Label reuses `--color-ingreso-foreground`, no third neutral token.** KISS/YAGNI.
- **DD-5: Test the icon via `data-testid`, not lucide class or role.** Rationale:
  decouples the test from lucide internals and respects the `aria-hidden`
  (no role) decision.

## Risks / assumptions carried to tasks

- `--primary` ripple is app-wide **by design** (High likelihood, contained: all
  text pairings ≥5.40:1 AA per §3). Whole-app visual review in the single PR.
- Assumption: no other component hardcodes `#475f85`/`#f9f9f9` outside the token
  (grep found none; `--primary` consumers enumerated in §3).
- tailwind-merge classifies `bg-ingreso` as a bg-color utility so it overrides
  `bg-card` — verified by the existing bucket-class precedent; if a future
  tailwind-merge config change breaks custom-color grouping, the fill would need
  an explicit override. Low risk, no action now.
