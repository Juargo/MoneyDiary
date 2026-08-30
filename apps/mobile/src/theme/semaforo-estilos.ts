import { COLORS } from './colors';

export interface EstiloSemaforo {
  readonly label: string;
  readonly cara: string;
  readonly icon: string;
  readonly bg: string;
  /** Darker sibling of `icon`, AA-safe as small text on white AND on `bg`. */
  readonly deep: string;
}

// Label rebrand (semáforo hero redesign, 2026-08-30): the color words
// ('Verde'/'Amarillo'/'Rojo') became health words — same one-table rename
// as web's `apps/web/src/lib/semaforo-estilos.ts` (mirror by hand, no
// shared package, ADR-008).
const ESTILOS: Record<string, EstiloSemaforo> = {
  verde: {
    label: 'Muy Saludable',
    cara: '🙂',
    icon: COLORS.semaforoVerdeIcon,
    bg: COLORS.semaforoVerdeBg,
    deep: COLORS.semaforoVerdeDeep,
  },
  amarillo: {
    label: 'Saludable',
    cara: '😐',
    icon: COLORS.semaforoAmarilloIcon,
    bg: COLORS.semaforoAmarilloBg,
    deep: COLORS.semaforoAmarilloDeep,
  },
  rojo: {
    label: 'En peligro',
    cara: '☹️',
    icon: COLORS.semaforoRojoIcon,
    bg: COLORS.semaforoRojoBg,
    deep: COLORS.semaforoRojoDeep,
  },
};

export const SIN_DATOS: EstiloSemaforo = {
  label: 'Sin datos',
  cara: '—',
  icon: COLORS.semaforoSinDatosIcon,
  bg: COLORS.semaforoSinDatosBg,
  deep: COLORS.semaforoSinDatosIcon,
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
