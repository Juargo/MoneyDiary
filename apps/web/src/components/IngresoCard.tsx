import { TrendingDown, TrendingUp } from 'lucide-react';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import type { VariacionIngreso } from '@/domain/variacion-ingreso';
import type { BarraIngreso } from '@/domain/sparkline-ingreso';
import { cn } from '@/lib/utils';

/**
 * "INGRESOS TOTALES" card, redesigned 2026-08-30 to the income-card mock:
 * eyebrow + trend pill on the first row, the amount at display scale, the
 * period as subtext, and a right-side bar sparkline of the last months.
 *
 * Two prior decisions are consciously superseded by the mock:
 * - The `bg-ingreso` SURFACE wash (2026-08-29 semantic-wash extension) is
 *   retired here — the card goes back to the neutral `DASHBOARD_CARD_CLASS`
 *   shell and the ingreso pair (`bg-ingreso`/`text-ingreso-foreground`,
 *   6.78:1 AA per DESIGN.md) moves INTO the trend pill and the highlighted
 *   sparkline bar, so the income identity survives as an accent, mirroring
 *   the hero's own wash retirement (estado tint lives in its verdict box).
 * - The P1 "display scale is exclusive to `SemaforoHeroCard`" rule: the
 *   mock's anatomy runs on the big number (`text-4xl font-extrabold`), and
 *   the hero keeps hierarchy by leading the page and owning color, not by
 *   being the only large text.
 *
 * The mock's "Actualizado hace unos instantes" line is replaced by the
 * period label (`mesCompletoLabel`) — cartola data has no live freshness to
 * claim, and the copy self-audit rule bans pretending it does.
 *
 * `totalIngreso` arrives already formatted as CLP from the view-model
 * (BigInt-string-safe, spec W1-01) — never reformatted here. `variacion`
 * and `barras` arrive PRE-computed from the pure domain helpers
 * (`calcularVariacionIngreso`/`calcularBarrasIngreso`, fed by the annual
 * query in `ResumenScreen`): null/empty degrades to the base card (amount +
 * eyebrow + period) with no pill, no sparkline, no spinner — the annual
 * fetch's loading/error states never gate this card's render.
 *
 * A11y: the pill is plain text (announced as-is); the sparkline is
 * `aria-hidden` decoration (the pill already carries the trend in words,
 * ADR-018: color/shape never the only carrier). Mobile collapse: the
 * sparkline is `hidden sm:flex` — below `sm` the card is the text column
 * alone, so nothing wraps or shrinks into an unreadable chart.
 */
export function IngresoCard({
  totalIngreso,
  periodo,
  variacion,
  barras,
}: {
  readonly totalIngreso: string;
  readonly periodo: string;
  readonly variacion: VariacionIngreso | null;
  readonly barras: ReadonlyArray<BarraIngreso>;
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        DASHBOARD_CARD_CLASS,
        'flex items-center justify-between gap-6',
      )}
    >
      <div className="flex flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-widest text-ingreso-foreground uppercase">
            INGRESOS TOTALES
          </span>
          {variacion && (
            <span className="flex items-center gap-1 rounded-full bg-ingreso px-2.5 py-0.5 text-xs font-semibold text-ingreso-foreground">
              {variacion.direccion === 'sube' && (
                <TrendingUp
                  aria-hidden
                  className="size-3.5"
                  data-testid="ingreso-trend-icon"
                />
              )}
              {variacion.direccion === 'baja' && (
                <TrendingDown
                  aria-hidden
                  className="size-3.5"
                  data-testid="ingreso-trend-icon"
                />
              )}
              {variacion.etiqueta}
            </span>
          )}
        </span>
        <span className="text-4xl font-extrabold text-foreground">
          {totalIngreso}
        </span>
        <p className="text-sm text-muted-foreground">
          {mesCompletoLabel(periodo)}
        </p>
      </div>

      {barras.length > 0 && (
        <div
          aria-hidden="true"
          data-testid="ingreso-sparkline"
          className="hidden h-20 items-end gap-1.5 self-end sm:flex"
        >
          {barras.map((barra) => (
            <span
              key={barra.periodo}
              data-barra={barra.periodo}
              className={cn(
                'w-5 rounded-sm',
                barra.esActual ? 'bg-ingreso-foreground' : 'bg-muted',
              )}
              style={{ height: `${barra.fraccion * 100}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
