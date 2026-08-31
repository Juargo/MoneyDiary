import { ChevronRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';
import { cn } from '@/lib/utils';

/**
 * SemaforoHeroCard — the FIRST card on the dashboard (`ResumenScreen`).
 * Redesigned 2026-08-30 (minimalist-ui pass): single-line status row; the
 * verdict copy moved off the dashboard onto `/semaforo`, which this row
 * links to. Behavior/a11y unchanged.
 *
 * - One row, nothing wraps: status dot → "Semáforo · {mes}" → estado pill →
 *   trailing `ChevronRight`. Hierarchy comes from ONE weight step
 *   (`font-semibold` label vs `text-muted-foreground` period) and ONE color
 *   step (the pill), not from size or boxes.
 * - Color is scarce: the small pastel-pill (`estilo.className`, the
 *   existing AA chip pair from `resolverEstiloSemaforo`) is the ONLY
 *   colored surface. The status dot uses a plain deep `-foreground` fill
 *   (no halo/ring), and the card itself stays a flat `bg-card` with a 1px
 *   border — no shadow.
 * - The verdict paragraph (lead + why) that used to live here is GONE — it
 *   now lives on `/semaforo`, reached via this row's own link. Callers no
 *   longer pass a `veredicto` prop.
 *
 * Behavior is unchanged from the previous design: a known estado renders
 * the WHOLE row as a `<Link>` to `/semaforo?periodo=…` with ONE accessible
 * name ("Semáforo: En peligro — julio 2026") and the WG5-12 Space-key
 * handler; `estadoGlobal: null` renders the calm "Sin datos" row with the
 * `/subir` CTA. The `data-testid="semaforo-global"` smoke anchor stays on
 * the row root.
 */
export function SemaforoHeroCard({
  estadoGlobal,
  periodo,
}: {
  readonly estadoGlobal: string | null;
  readonly periodo: string;
}) {
  const estilo = resolverEstiloSemaforo(estadoGlobal);

  if (!estadoGlobal) {
    return (
      <div
        data-testid="semaforo-global"
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-none bg-muted-foreground"
        />
        <span className="min-w-0 truncate">
          <span className="font-semibold text-foreground">Sin datos</span>
          <span className="text-muted-foreground">
            {' '}
            · Carga una cartola para conocer tu mes
          </span>
        </span>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="ml-auto shrink-0"
        >
          <Link to="/subir">Subir cartola</Link>
        </Button>
      </div>
    );
  }

  return (
    <Link
      to="/semaforo"
      search={{ periodo }}
      data-testid="semaforo-global"
      aria-label={`Semáforo: ${estilo.label} — ${mesCompletoLabel(periodo)}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      onKeyDown={(event) => {
        // WG5-12 precedent (SemaforoTag): Space doesn't natively activate an
        // <a href> — prevent its default (page scroll) and trigger the same
        // navigation a click would.
        if (event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-none',
          PUNTO_POR_ESTADO[estadoGlobal] ?? 'bg-muted-foreground',
        )}
      />

      <span className="min-w-0 truncate">
        <span className="font-semibold text-foreground">Semáforo</span>
        <span className="text-muted-foreground">
          {' '}
          · {mesCompletoLabel(periodo)}
        </span>
      </span>

      <span
        className={cn(
          'shrink-0 rounded-none px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
          estilo.className,
        )}
      >
        {estilo.label}
      </span>

      <ChevronRight
        aria-hidden="true"
        className="ml-auto size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

/**
 * Estado → status-dot fill, deep `-foreground` tones (AA on white/card) —
 * the SAME deep tones the pill's text already uses, so the dot and the pill
 * read as one color family per estado. Deliberately separate from
 * `resolverEstiloSemaforo`'s chip pair — that table pairs fill+text for the
 * pill; this one is a single decorative fill for the dot.
 */
const PUNTO_POR_ESTADO: Record<string, string> = {
  verde: 'bg-semaforo-verde-foreground',
  amarillo: 'bg-semaforo-amarillo-foreground',
  rojo: 'bg-semaforo-rojo-foreground',
};
