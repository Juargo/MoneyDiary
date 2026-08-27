export interface EstiloSemaforo {
  readonly label: string;
  readonly cara: string;
  readonly className: string;
}

const ESTILOS: Record<string, EstiloSemaforo> = {
  verde: {
    label: 'Verde',
    cara: '🙂',
    className: 'bg-semaforo-verde text-semaforo-verde-foreground',
  },
  amarillo: {
    label: 'Amarillo',
    cara: '😐',
    className: 'bg-semaforo-amarillo text-semaforo-amarillo-foreground',
  },
  rojo: {
    label: 'Rojo',
    cara: '☹️',
    className: 'bg-semaforo-rojo text-semaforo-rojo-foreground',
  },
};

// `bg-slate-100 text-slate-500` measured ~4.35:1 — fails the AA 4.5:1 floor.
// Migrated to the EXISTING shadcn `muted`/`muted-foreground` pair (8.38:1)
// instead of minting a new token — "sin datos" isn't a semáforo color, it's
// the generic neutral-empty state (design-token debt burn-down, 2026-08-27).
export const SIN_DATOS: EstiloSemaforo = {
  label: 'Sin datos',
  cara: '—',
  className: 'bg-muted text-muted-foreground',
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
