export interface EstiloSemaforo {
  readonly label: string;
  readonly cara: string;
  readonly className: string;
}

// Label rebrand (semáforo hero redesign, 2026-08-30): the color words
// ('Verde'/'Amarillo'/'Rojo') became health words — the verdict now says
// what it MEANS, not what color it is. One edit here renames the estado
// across every consumer (hero, badges, tags, aria-labels) — the whole point
// of this single table. Mirror table: apps/mobile/src/theme/semaforo-estilos.ts.
// Tecno-Analítico (2026-09-02): the badge surface stops being an opaque tint
// and becomes a 15% wash of its OWN neon tone plus a hairline of that same
// tone. One family, one hue per estado, three intensities — stroke, wash,
// text — instead of two unrelated tints. This reads as an instrument readout
// rather than a sticker, which is the whole point of the north star.
//
// Why /15 exactly: the wash composites against whatever sits behind it, so
// the ratios were computed on the COMPOSITE, not on the token. Neon text on
// the resulting fill, over `bg-card` #11131a / over `--background` #090a0f:
// verde 7.95:1 / 8.73:1 · amarillo 8.18:1 / 9.08:1 · rojo 5.59:1 / 6.13:1 ·
// sin datos 5.35:1 / 5.90:1. All AA. At /20 they drop to 4.92-7.99:1 — still
// AA, but with less headroom and no visual gain, so /15 stays.
//
// The /40 border is DECORATIVE and does not carry state on its own: even at
// /50 the rojo and sin-datos strokes only reach ~2.6:1 against the card, so
// they would not satisfy WCAG 1.4.11 if the badge depended on them. It
// doesn't — every consumer conveys the estado through the `cara` glyph, the
// `label` text, or an `aria-label`, never through the outline. Do NOT
// promote this stroke into the sole state carrier without re-deriving it.
const ESTILOS: Record<string, EstiloSemaforo> = {
  verde: {
    label: 'Muy Saludable',
    cara: '🙂',
    className:
      'border border-semaforo-verde-foreground/40 bg-semaforo-verde-foreground/15 text-semaforo-verde-foreground',
  },
  amarillo: {
    label: 'Saludable',
    cara: '😐',
    className:
      'border border-semaforo-amarillo-foreground/40 bg-semaforo-amarillo-foreground/15 text-semaforo-amarillo-foreground',
  },
  rojo: {
    label: 'En peligro',
    cara: '☹️',
    className:
      'border border-semaforo-rojo-foreground/40 bg-semaforo-rojo-foreground/15 text-semaforo-rojo-foreground',
  },
};

// `bg-slate-100 text-slate-500` measured ~4.35:1 — failed the AA 4.5:1 floor.
// Migrated to the EXISTING shadcn `muted`/`muted-foreground` pair instead of
// minting a new token — "sin datos" isn't a semáforo color, it's the generic
// neutral-empty state (design-token debt burn-down, 2026-08-27). It follows
// the same wash+hairline shape as the three estados above so the four badges
// read as one family; on the dark identity that lands at 5.35:1 (on card) /
// 5.90:1 (on background), down from the opaque pair's 8.38:1 but still
// comfortably AA — the cost of belonging to the family.
export const SIN_DATOS: EstiloSemaforo = {
  label: 'Sin datos',
  cara: '—',
  className:
    'border border-muted-foreground/40 bg-muted-foreground/15 text-muted-foreground',
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
