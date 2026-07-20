/**
 * Serene Finance dashboard card wrapper (PR3 review follow-up, DRY): the
 * single source of truth for the `rounded-lg border border-border bg-card
 * p-5 shadow-sm` string shared by `ResumenScreen`'s two cards and
 * `ResumenAnual`'s section. Compose with layout-specific classes via `cn()`
 * at each call site (`flex flex-col gap-4`, etc.) rather than baking layout
 * into this constant — this is ONLY the visual card treatment.
 *
 * Deliberately a plain string constant, not the shadcn `Card` primitive
 * (`components/ui/card.tsx`): that component hardcodes `rounded-xl` +
 * `py-6`/`px-6`, a different visual language that would change the
 * already-reviewed PR3 output — not a drop-in replacement (kiss.md).
 */
export const DASHBOARD_CARD_CLASS = 'rounded-lg border border-border bg-card p-5 shadow-sm'
