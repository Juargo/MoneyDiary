# Proposal: Dashboard Color Refinements (web)

## Intent

Two color gaps on the authenticated web dashboard (`apps/web`):

1. **`IngresoCard` bypasses the Serene Finance token system** — it hardcodes raw Tailwind `slate-*` utilities (`border-l-slate-800`, `text-slate-500`, `text-slate-900`) instead of design tokens, and its income identity is weak (a generic dark slate left-bar with no semantic meaning). DRY/consistency debt.
2. **No cohesive pastel-blue identity + `#2260b2` was misapplied.** The page background is a flat off-white (`#f9f9f9`); the user wants a soft pale-blue identity. The user's favored blue `#2260b2` is a saturated royal blue (HSL 214°, 68%, 42%), NOT a pastel — correct on emphasis controls, wrong as a page surface.

Goal: give income a clear, on-brand identity via a proper semantic token, warm the app shell to a pale pastel blue, and promote `#2260b2` to the app's emphasis color — all within WCAG 2.2 AA (ADR-018) and the documented two-tier color rule.

## Scope

### In Scope (`apps/web` only — single PR)
- Add semantic tokens to `apps/web/src/index.css` `@theme`: `--color-ingreso` (pastel mint FILL) + `--color-ingreso-foreground` (deep green TEXT).
- Rewrite `apps/web/src/components/IngresoCard.tsx`: consume the new tokens (`bg-ingreso` / `text-ingreso-foreground`), add a `TrendingUp` lucide icon (direct import), remove `border-l-4 border-l-slate-800`, drop all `slate-*` utilities.
- Swap light-mode `--background` `#f9f9f9 → #e8f0fa` (pale pastel blue, app-shell-wide via `AppShell.tsx` `bg-background`).
- Promote `#2260b2` into light-mode `--primary` (replaces `#475f85`).
- Update `IngresoCard.test.tsx` (icon presence, no border-left, token classes) — TDD, tests first.

### Out of Scope (non-goals)
- `SemaforoBadge` and all other components (rejected Option C — YAGNI).
- `apps/mobile`, `apps/api`, `apps/landing` (untouched).
- Dark mode redesign — `.dark` block stays as-is (only light `:root` changes); verify no regression.
- New dependencies (`lucide-react@^0.469.0` already present, ADR-027).
- `bucket-colors.ts` — income card is display-only, does NOT feed `resumen-view-model`; no hex mirror needed.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None (presentation-only restyle; no spec-level behavior/requirement change — money formatting, semáforo state, and view-model logic are all untouched).

## Approach

Semantic-token approach (exploration Option B). Extend the SAME pattern Sprint 9 established for bucket tokens rather than ad-hoc utility classes. Every color flows through `index.css` tokens (DRY) — no hardcoded hex in components. Respect the two-tier rule: pastel = FILL only, strong tone = text.

**Exact values + WCAG contrast (computed, sRGB):**

| Token / pairing | Value | Contrast | Verdict |
|---|---|---|---|
| `--color-ingreso` (card FILL) | `#d1fae5` (light mint; = SemaforoBadge "verde" fill, reuses app's one green) | — (fill) | — |
| `--color-ingreso-foreground` (amount + label TEXT) on fill | `#065f46` (deep emerald) | **6.78:1** | AA pass |
| `--background` (app shell) | `#e8f0fa` (pale pastel blue, ~HSL 214°) | vs white card boundary carried by `--border` #c4c6cf | ok |
| `--foreground` #1a1c1c on new bg | — | 14.9:1 | AA pass |
| `--primary` → `#2260b2` on white | button bg / heading text | **6.21:1** | AA pass |
| white on `#2260b2` (button label) | — | 6.21:1 | AA pass |
| `#2260b2` on new pale-blue bg | heading text worst case | 5.40:1 | AA pass |

**Why `--primary` (not a new `--accent`):** shadcn's `--accent` (`#eeeeee`) is a NEUTRAL SURFACE (hover backgrounds with dark `accent-foreground`) — dumping a dark blue there would break every `bg-accent` (dark surface + dark text). `--primary` is already the app's single "emphasis blue" token used exactly where `#2260b2` belongs (button fill + heading text), both still ≥4.5:1. Replacing it is DRY, respects the two-tier rule (a strong tone stays a strong/text tone), and needs no new token. Only touch light `:root --primary`; leave `.dark --primary` (a light oklch) untouched.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/index.css` | Modified | +2 `@theme` income tokens; `--background` and `--primary` (light `:root` only) |
| `apps/web/src/components/IngresoCard.tsx` | Modified | Token classes, `TrendingUp` icon, remove border-left, drop `slate-*` |
| `apps/web/src/components/IngresoCard.test.tsx` | Modified | Assert icon, token classes, no border-left (TDD first) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `--primary` change ripples to ALL buttons + headings across `apps/web` | High (by design) | Both uses verified ≥6.2:1 AA on white and 5.4:1 on new bg; visual regression is intentional (punchier blue), review whole-app in one PR |
| Dark mode regression | Low | Only light `:root` edited; `.dark` untouched; income tokens are self-contained card chip (light mint + dark green) that reads on any page bg |
| Pale-blue bg vs white cards too low separation | Low | Card boundary carried by existing `--border` #c4c6cf, not luminance; no text sits directly on `--background` (exploration-confirmed) |
| Contrast drift if a maintainer edits a hex | Low | All pairings documented with numbers here + in `index.css` comments |

## Rollback Plan

Single-PR revert. All changes are 3 files (`index.css`, `IngresoCard.tsx`, `IngresoCard.test.tsx`); `git revert` the merge commit restores `#f9f9f9`/`#475f85`/slate styling with zero data or schema impact (presentation-only).

## Dependencies

- None new. `lucide-react@^0.469.0` (ADR-027) already a direct dep.

## Success Criteria

- [ ] `IngresoCard` renders pastel-mint fill + deep-green amount + `TrendingUp` icon, no `slate-*` utilities, no left border.
- [ ] `--background` is `#e8f0fa`; `--primary` is `#2260b2` (light mode); `.dark` unchanged.
- [ ] Every new pairing ≥ WCAG AA 4.5:1 (numbers above).
- [ ] `pnpm web test` green (updated `IngresoCard.test.tsx`); no hardcoded hex in components.
- [ ] `apps/mobile`, `apps/api`, `apps/landing`, `bucket-colors.ts` untouched.
