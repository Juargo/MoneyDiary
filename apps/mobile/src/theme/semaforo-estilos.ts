import { COLORS } from './colors';

export interface EstiloSemaforo {
  readonly label: string;
  readonly cara: string;
  readonly icon: string;
  readonly bg: string;
}

const ESTILOS: Record<string, EstiloSemaforo> = {
  verde: {
    label: 'Verde',
    cara: '🙂',
    icon: COLORS.semaforoVerdeIcon,
    bg: COLORS.semaforoVerdeBg,
  },
  amarillo: {
    label: 'Amarillo',
    cara: '😐',
    icon: COLORS.semaforoAmarilloIcon,
    bg: COLORS.semaforoAmarilloBg,
  },
  rojo: {
    label: 'Rojo',
    cara: '☹️',
    icon: COLORS.semaforoRojoIcon,
    bg: COLORS.semaforoRojoBg,
  },
};

export const SIN_DATOS: EstiloSemaforo = {
  label: 'Sin datos',
  cara: '—',
  icon: COLORS.semaforoSinDatosIcon,
  bg: COLORS.semaforoSinDatosBg,
};

/**
 * estado → {label, cara, icon, bg} resolver — US-050 (design §1.7/D-12):
 * extracted out of the former `SemaforoBadge.tsx` so `SemaforoTag` (and any
 * future indicator) reads ONE table instead of a second, driftable copy —
 * mirrors web's own US-047 D-06 extraction (`lib/semaforo-estilos.ts`). An
 * unknown or `null` estado NEVER coerces into a known colour — falls back
 * to `SIN_DATOS` (MOB-03/MOB-06 distinct-state discipline).
 */
export function resolverEstiloSemaforo(estado: string | null): EstiloSemaforo {
  return estado ? (ESTILOS[estado] ?? SIN_DATOS) : SIN_DATOS;
}
