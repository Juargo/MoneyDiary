import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';
import type { VeredictoSemaforo } from '@/domain/veredicto-semaforo';
import { cn } from '@/lib/utils';

/**
 * SemaforoHeroCard — the FIRST card on the dashboard (`ResumenScreen`): the
 * monthly verdict leads (PRODUCT.md principle 1). Redesigned 2026-08-30 to
 * the mock's anatomy, replacing the emoji-face + estado-washed-card look:
 *
 * - Ring indicator (aria-hidden): halo in the estado chip token, thick ring
 *   in the estado's deep `-foreground` tone, filled core in the `-band`
 *   tone — all three are EXISTING `index.css` estado tokens, no new hex.
 * - Title `Semáforo: {label}` at display scale (squint-test winner), using
 *   the rebranded labels from `resolverEstiloSemaforo` (Muy Saludable /
 *   Saludable / En peligro — single label table, never forked here).
 * - Tinted verdict box: the estado chip pair (`estilo.className`, AA
 *   verified in index.css) carrying `construirVeredictoSemaforo`'s copy —
 *   bold lead + the why. The card surface itself went back to neutral
 *   `bg-card`; the estado tint lives in this box now (the 2026-08-29
 *   full-card wash is retired by this redesign).
 * - Three-segment scale (worst → best), decorative and `aria-hidden`
 *   (redundant with the title, which is the single accessible carrier):
 *   labels in the deep estado tones (AA on white), only the active
 *   segment's track fills with its estado color.
 *
 * Behavior is unchanged from the previous design: a known estado renders
 * the WHOLE card as a `<Link>` to `/semaforo?periodo=…` with ONE accessible
 * name ("Semáforo: En peligro — julio 2026") and the WG5-12 Space-key
 * handler; `estadoGlobal: null` renders the calm "Sin datos" state with the
 * `/subir` CTA (no verdict box, no scale, neutral ring). The
 * `data-testid="semaforo-global"` smoke anchor stays on the card root.
 */
export function SemaforoHeroCard({
  estadoGlobal,
  periodo,
  veredicto,
}: {
  readonly estadoGlobal: string | null;
  readonly periodo: string;
  /** Precomputed by the caller (`construirVeredictoSemaforo`) — this card only renders. */
  readonly veredicto: VeredictoSemaforo | null;
}) {
  const estilo = resolverEstiloSemaforo(estadoGlobal);

  if (!estadoGlobal) {
    return (
      <div
        data-testid="semaforo-global"
        className={cn(
          DASHBOARD_CARD_CLASS,
          'flex flex-col items-center gap-2 text-center',
        )}
      >
        <AnilloEstado tono={TONOS_SIN_DATOS} />
        <span className="text-4xl font-extrabold text-foreground">
          Sin datos
        </span>
        <p className="text-sm text-muted-foreground">
          Carga una cartola para conocer tu mes
        </p>
        <Button asChild className="mt-2">
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
      className={cn(
        DASHBOARD_CARD_CLASS,
        'flex flex-col items-center gap-4 text-center transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
      )}
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
      <AnilloEstado tono={TONOS_POR_ESTADO[estadoGlobal] ?? TONOS_SIN_DATOS} />

      <span className="text-4xl font-extrabold text-foreground">
        Semáforo: {estilo.label}
      </span>

      {veredicto && (
        <p
          className={cn(
            'max-w-prose rounded-lg px-5 py-4 text-sm leading-relaxed',
            estilo.className,
          )}
        >
          <strong className="font-bold">{veredicto.lead}</strong>{' '}
          {veredicto.detalle}
        </p>
      )}

      <div
        aria-hidden="true"
        className="grid w-full max-w-md grid-cols-3 gap-3 pt-1"
      >
        {ESCALA.map(({ estado, textoClase, barraClase }) => (
          <div key={estado} className="flex flex-col gap-1.5 text-left">
            <span className={cn('text-xs font-bold', textoClase)}>
              {resolverEstiloSemaforo(estado).label}
            </span>
            <span
              className={cn(
                'h-2 rounded-full',
                estado === estadoGlobal ? barraClase : 'bg-border',
              )}
            />
          </div>
        ))}
      </div>
    </Link>
  );
}

/**
 * Ring indicator (mock anatomy): soft halo → thick deep ring on a white gap
 * → filled mid-tone core. Purely decorative — the title text is the only
 * accessible carrier of the estado (ADR-018: never color alone).
 */
function AnilloEstado({ tono }: { readonly tono: TonosAnillo }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-16 items-center justify-center rounded-full',
        tono.halo,
      )}
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full border-4 bg-card',
          tono.aro,
        )}
      >
        <span className={cn('size-6 rounded-full', tono.nucleo)} />
      </span>
    </span>
  );
}

interface TonosAnillo {
  readonly halo: string;
  readonly aro: string;
  readonly nucleo: string;
}

/**
 * Estado → ring tones, all from the EXISTING index.css estado token
 * families: chip fill (halo), `-foreground` deep tone (ring), `-band` mid
 * tone (core). Deliberately separate from `resolverEstiloSemaforo`'s chip
 * pair — that table pairs fill+text for chips; this one composes three
 * fills for a decoration (two-tier color rule: none of these carry text).
 */
const TONOS_POR_ESTADO: Record<string, TonosAnillo> = {
  verde: {
    halo: 'bg-semaforo-verde',
    aro: 'border-semaforo-verde-foreground',
    nucleo: 'bg-semaforo-verde-band',
  },
  amarillo: {
    halo: 'bg-semaforo-amarillo',
    aro: 'border-semaforo-amarillo-foreground',
    nucleo: 'bg-semaforo-amarillo-band',
  },
  rojo: {
    halo: 'bg-semaforo-rojo',
    aro: 'border-semaforo-rojo-foreground',
    nucleo: 'bg-semaforo-rojo-band',
  },
};

const TONOS_SIN_DATOS: TonosAnillo = {
  halo: 'bg-muted',
  aro: 'border-muted-foreground',
  nucleo: 'bg-muted-foreground',
};

/**
 * Decorative worst→best scale under the verdict (mock bottom row). Labels
 * resolve through `resolverEstiloSemaforo` at render time — zero forked
 * label strings. Deep `-foreground` tones for the label text keep AA on the
 * white card (they already clear it on their own tinted chips).
 */
const ESCALA = [
  {
    estado: 'rojo',
    textoClase: 'text-semaforo-rojo-foreground',
    barraClase: 'bg-semaforo-rojo-foreground',
  },
  {
    estado: 'amarillo',
    textoClase: 'text-semaforo-amarillo-foreground',
    barraClase: 'bg-semaforo-amarillo-foreground',
  },
  {
    estado: 'verde',
    textoClase: 'text-semaforo-verde-foreground',
    barraClase: 'bg-semaforo-verde-foreground',
  },
] as const;
