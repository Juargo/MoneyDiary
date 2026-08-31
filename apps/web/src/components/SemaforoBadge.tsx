import { cn } from '@/lib/utils';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';

/**
 * Traffic-light indicator for a single `estadoSemaforo` wire value
 * ('verde'|'amarillo'|'rojo'|null). DOM port of
 * `apps/mobile/src/components/SemaforoBadge.tsx` (spec W2-01/W2-02): renders
 * the backend-computed state VERBATIM — no client-side threshold math. The
 * Spanish state word is exposed via `role="img"` + `aria-label` (never color
 * alone), and an unknown/`null` value maps to a DISTINCT "Sin datos" badge,
 * never coerced into one of the three known colors.
 *
 * US-047 (design D-06): the estado→(label, cara, className) table moved to
 * `lib/semaforo-estilos.ts`, shared with `SemaforoTag`. This component's own
 * rendering logic and public behavior are otherwise byte-for-byte unchanged
 * — `ResumenAnual`'s 12 instances (`size={20}`) must not be collaterally
 * converted into links.
 */
export function SemaforoBadge({
  estadoSemaforo,
  size = 40,
}: {
  readonly estadoSemaforo: string | null;
  readonly size?: number;
}) {
  const estilo = resolverEstiloSemaforo(estadoSemaforo);

  return (
    <span
      role="img"
      aria-label={estilo.label}
      className={cn(
        'inline-flex items-center justify-center rounded-none',
        estilo.className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {estilo.cara}
    </span>
  );
}
