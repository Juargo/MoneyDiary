# Proposal: month-year-picker

## Intent

Stepping one month at a time via the header arrows is painful for jumping across
YEARS ("no tener que presionar mil veces para cambiar de año"). Users need to
jump directly to any month of any year in one interaction, while keeping the
familiar prev/next month arrows + "Hoy" for fine steps.

## Scope

### In Scope
- Make the period label ("julio 2026") a **trigger** that opens a **popover**.
- Popover holds a month grid (Ene..Dic, reusing `mesAbreviado`) + in-popover year
  navigation (‹ 2026 ›) → picks any `(year, month)` in one interaction.
- Keep prev/next arrows + "Hoy" unchanged; state stays in the URL search param via
  the existing `{ periodo, onChange }` contract (shared by demo + auth).
- Add a shadcn-pattern `components/ui/popover.tsx` (Serene Finance tokens, WCAG 2.2
  AA: focus mgmt, keyboard nav, escape-to-close, aria).
- New pure helper in `periodo-anual.ts` to build a `YYYY-MM` from `(anio, mesIndex)`.

### Out of Scope
- Replacing the arrows or "Hoy"; date-range selection; day-level granularity.
- Backend, DemoBanner, mobile.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `web-app`: the dashboard period control gains a direct month/year jump via a
  popover picker (extends period-selector-header requirements).

## Approach

**Popover primitive decision — reuse `radix-ui`, no new dependency.** The web app
already depends on `radix-ui` ^1.6.2 (the unified umbrella package); `button.tsx`
imports `Slot` from it. A shadcn `popover.tsx` wrapping `radix-ui`'s Popover gives
correct focus trap, escape-to-close, and aria out of the box, styled with Serene
tokens — consistent with existing primitives and materially lower supply-chain
risk than adding `@radix-ui/react-popover` or hand-rolling a11y. **Recommend the
umbrella `radix-ui` Popover.** `PeriodoSelector` stays presentational; the grid
reports the chosen `YYYY-MM` through the same `onChange`.

**Open question for spec:** should future months/years be disabled in the grid
(lean: yes, mirroring the existing next-arrow clamp) or selectable? Spec to confirm.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/components/PeriodoSelector.tsx` | Modified | Label becomes popover trigger |
| `apps/web/src/components/ui/popover.tsx` | New | shadcn Popover over `radix-ui` |
| `apps/web/src/components/` (picker subcomponent) | New (likely) | Month grid + year nav |
| `apps/web/src/domain/periodo-anual.ts` | Modified | `(anio, mesIndex)` → `YYYY-MM` helper |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Popover a11y (focus trap, kbd, escape) | Med | Use Radix primitive; a11y tests |
| Breaking arrows/"Hoy"/clamp | Low | Presentational contract unchanged; reuse helpers |
| PR size > 400 lines | Med | Larger than prior change; first slice = popover + grid + helper (tests). Split year-nav/clamp if over budget |

## Rollback Plan

Revert `PeriodoSelector.tsx` to the arrows-only header and delete `popover.tsx`
+ picker subcomponent + the new helper. No data/backend/migration involved.

## Dependencies

- None new — `radix-ui` already installed.

## Success Criteria

- [ ] Clicking the label opens an accessible popover; picking a month/year updates
      the period in the URL in one interaction.
- [ ] Prev/next arrows, "Hoy", and the current-month clamp still work.
- [ ] Serene Finance tokens; keyboard + escape + focus management pass a11y checks.
