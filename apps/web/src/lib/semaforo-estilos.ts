export interface EstiloSemaforo {
  readonly label: string;
  readonly cara: string;
  readonly className: string;
}

const ESTILOS: Record<string, EstiloSemaforo> = {
  verde: {
    label: 'Verde',
    cara: '🙂',
    className: 'bg-emerald-100 text-emerald-700',
  },
  amarillo: {
    label: 'Amarillo',
    cara: '😐',
    className: 'bg-amber-100 text-amber-700',
  },
  rojo: { label: 'Rojo', cara: '☹️', className: 'bg-rose-100 text-rose-700' },
};

export const SIN_DATOS: EstiloSemaforo = {
  label: 'Sin datos',
  cara: '—',
  className: 'bg-slate-100 text-slate-500',
};

/**
 * estado → (label, cara, className) resolver — US-047 (design D-06):
 * extracted from `SemaforoBadge.tsx` so `SemaforoTag.tsx` can reuse the
 * SAME table instead of a second, driftable copy of the same wire-enum
 * mapping (two copies drifting would show two different Spanish words for
 * the same state on the same screen). An unknown or `null` `estado` NEVER
 * coerces into a known color — falls back to `SIN_DATOS` (spec W2-02).
 */
export function resolverEstiloSemaforo(estado: string | null): EstiloSemaforo {
  return estado ? (ESTILOS[estado] ?? SIN_DATOS) : SIN_DATOS;
}
