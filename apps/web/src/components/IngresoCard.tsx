import { TrendingUp } from 'lucide-react';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { cn } from '@/lib/utils';

/**
 * "INGRESOS" supporting stat. Design critique P1 fix: NEUTRALIZED, not
 * recolored — bucket colors (`--color-necesidades`/`-gustos`/`-ahorro`)
 * carry bucket semantics, so income (not a bucket) must not borrow a color
 * identity from the generic "green = money in" fintech convention, which
 * also had no home in `DESIGN.md`'s palette. That pass left the card on the
 * neutral `bg-card` white surface — a state the semantic-wash paragraph
 * below supersedes; what survives of it is the composition
 * (`DASHBOARD_CARD_CLASS` on a plain `<div>`, same composition
 * `ResumenScreen`/`SemaforoHeroCard` already use — not the shadcn `Card`
 * primitive, whose own `rounded-xl`/`py-6`/`gap-6` defaults are a different
 * visual language `dashboard-card.ts`'s docblock explicitly warns against
 * pairing it with). `data-slot="card"` is set explicitly to keep the
 * existing test anchor (`IngresoCard.test.tsx`) resolving unchanged.
 *
 * Scale: `text-4xl font-extrabold` is now EXCLUSIVE to `SemaforoHeroCard` —
 * two competing headlines diluted the "one verdict" hierarchy (PRODUCT.md
 * principle 1, "the monthly verdict comes first"). This card drops to
 * `text-2xl font-semibold`, a calm supporting stat that doesn't compete with
 * the hero card directly above it on `ResumenScreen`.
 *
 * Semantic wash (DESIGN.md "Status Families" update, 2026-08-29) supersedes
 * the "follow-up debt" note this docblock used to carry: `--color-ingreso`/
 * `--color-ingreso-foreground` are no longer merely a `ResumenAnual.tsx`
 * marker's leftover tokens — this card now washes its own surface with
 * `bg-ingreso`, the SAME reasoning that washed `SemaforoHeroCard` and
 * `BucketSemaforoCard` in their own estado tokens (opaque fill, no new
 * literal, `DASHBOARD_CARD_CLASS` itself untouched). The "INGRESOS" label
 * and its icon — the card's own accent text — pair with `ingreso-foreground`
 * (6.78:1 on the mint fill, DESIGN.md) instead of the generic `secondary`
 * lavanda, so the accent visually belongs to the same family as the wash.
 * The amount stays on `text-foreground` (≈15:1 on the mint fill) — no need
 * to switch a passing AA color just because the surface changed.
 *
 * `totalIngreso` arrives already formatted as CLP from the view-model
 * (BigInt-string-safe, spec W1-01) — never reformatted here. DOM port of
 * `apps/mobile/src/components/IngresoCard.tsx`; color/scale identity
 * diverges by product decision (spec DCR-01/02/03, amended by design
 * critique P1 and this wash extension — see `IngresoCard.test.tsx`).
 */
export function IngresoCard({
  totalIngreso,
}: {
  readonly totalIngreso: string;
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        DASHBOARD_CARD_CLASS,
        'bg-ingreso flex flex-col items-center gap-1 text-center',
      )}
    >
      <span className="flex items-center gap-1.5">
        <TrendingUp
          aria-hidden
          className="size-4 text-ingreso-foreground"
          data-testid="ingreso-trend-icon"
        />
        <span className="text-xs font-semibold tracking-widest text-ingreso-foreground uppercase">
          INGRESOS
        </span>
      </span>
      <span className="text-2xl font-semibold text-foreground">
        {totalIngreso}
      </span>
    </div>
  );
}
