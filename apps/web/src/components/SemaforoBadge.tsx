import { cn } from '@/lib/utils'

interface EstiloSemaforo {
  readonly label: string
  readonly cara: string
  readonly className: string
}

const ESTILOS: Record<string, EstiloSemaforo> = {
  verde: { label: 'Verde', cara: '🙂', className: 'bg-emerald-100 text-emerald-700' },
  amarillo: { label: 'Amarillo', cara: '😐', className: 'bg-amber-100 text-amber-700' },
  rojo: { label: 'Rojo', cara: '☹️', className: 'bg-rose-100 text-rose-700' },
}

const SIN_DATOS: EstiloSemaforo = {
  label: 'Sin datos',
  cara: '—',
  className: 'bg-slate-100 text-slate-500',
}

/**
 * Traffic-light indicator for a single `estadoSemaforo` wire value
 * ('verde'|'amarillo'|'rojo'|null). DOM port of
 * `apps/mobile/src/components/SemaforoBadge.tsx` (spec W2-01/W2-02): renders
 * the backend-computed state VERBATIM — no client-side threshold math. The
 * Spanish state word is exposed via `role="img"` + `aria-label` (never color
 * alone), and an unknown/`null` value maps to a DISTINCT "Sin datos" badge,
 * never coerced into one of the three known colors.
 */
export function SemaforoBadge({
  estadoSemaforo,
  size = 40,
}: {
  readonly estadoSemaforo: string | null
  readonly size?: number
}) {
  const estilo = estadoSemaforo ? (ESTILOS[estadoSemaforo] ?? SIN_DATOS) : SIN_DATOS

  return (
    <span
      role="img"
      aria-label={estilo.label}
      className={cn('inline-flex items-center justify-center rounded-full', estilo.className)}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {estilo.cara}
    </span>
  )
}
