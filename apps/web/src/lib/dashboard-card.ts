/**
 * Tecno-Analítico dashboard card wrapper (PR3 review follow-up, DRY): the
 * single source of truth for the card shell shared by `ResumenScreen`'s two
 * cards, `ResumenAnual`'s section and `BucketSemaforoCard`. Compose with
 * layout-specific classes via `cn()` at each call site (`flex flex-col
 * gap-4`, etc.) rather than baking layout into this constant — this is ONLY
 * the visual card treatment.
 *
 * Restyle (2026-09-02), per DESIGN.md's "Precisión de Terminal": the card
 * stops being a floating container and becomes a delimited region.
 * - `shadow-sm` → `shadow-none`: the north star names "sin sombras"
 *   explicitly. Depth now comes from the 1px `--border` (#1e222d) stroke
 *   against the matte ground plus the one-step surface lift of `bg-card`
 *   (#11131a on #090a0f) — a drawn edge, not a cast shadow.
 * - `p-5` → `p-4`: 20px → 16px, the "denso y estructurado" instrument
 *   density. The 24px gap BETWEEN stacked cards is a call-site concern and
 *   is deliberately not touched here.
 * - `bg-card` and `border-border` are unchanged as CLASSES: both already
 *   resolve to the dark values through the tokens in `index.css`, which is
 *   the whole point of routing them through tokens instead of literals. A
 *   hardcoded `bg-[#11131a]` here would fork the palette.
 * - `rounded-lg` stays in the markup even though `--radius: 0rem` resolves
 *   it to 0, so flipping that one token restores a soft look everywhere at
 *   once (same reasoning documented in `index.css`).
 *
 * Deliberately a plain string constant, not the shadcn `Card` primitive
 * (`components/ui/card.tsx`): that component hardcodes `rounded-xl` +
 * `py-6`/`px-6`, a different visual language that would change the
 * already-reviewed PR3 output — not a drop-in replacement (kiss.md).
 */
export const DASHBOARD_CARD_CLASS =
  'rounded-lg border border-border bg-card p-4 shadow-none';
