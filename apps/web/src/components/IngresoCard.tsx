import { TrendingUp } from 'lucide-react';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { cn } from '@/lib/utils';

/**
 * "INGRESOS" supporting stat. Design critique P1 fix: NEUTRALIZED, not
 * recolored — bucket colors (`--color-necesidades`/`-gustos`/`-ahorro`)
 * carry bucket semantics, so income (not a bucket) must not borrow a color
 * identity from the generic "green = money in" fintech convention, which
 * also had no home in `DESIGN.md`'s palette. This card now sits on the same
 * neutral `bg-card` white surface every other dashboard card uses
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
 * Follow-up debt (deliberately NOT fixed here): `--color-ingreso`/
 * `--color-ingreso-foreground` stay in `index.css` even though this card no
 * longer consumes them, because `ResumenAnual.tsx`'s selected-month marker
 * (`bg-ingreso`/`border-ingreso-foreground`) independently reads the same
 * tokens. Removing them would break that marker; the marker itself is
 * outside this batch's scope.
 *
 * `totalIngreso` arrives already formatted as CLP from the view-model
 * (BigInt-string-safe, spec W1-01) — never reformatted here. DOM port of
 * `apps/mobile/src/components/IngresoCard.tsx`; color/scale identity
 * diverges by product decision (spec DCR-01/02/03, amended by this
 * critique — see `IngresoCard.test.tsx`).
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
        'flex flex-col items-center gap-1 text-center',
      )}
    >
      <span className="flex items-center gap-1.5">
        <TrendingUp
          aria-hidden
          className="size-4 text-secondary"
          data-testid="ingreso-trend-icon"
        />
        <span className="text-xs font-semibold tracking-widest text-secondary uppercase">
          INGRESOS
        </span>
      </span>
      <span className="text-2xl font-semibold text-foreground">
        {totalIngreso}
      </span>
    </div>
  );
}
