/**
 * Design tokens for the resumen screen (Stitch mockup, Sprint 3 mobile).
 *
 * SVG fills (`react-native-svg` <Path fill=...>) need literal hex strings, so
 * the palette lives here as the single source of truth for chart colors. The
 * SAME hex values are mirrored in `tailwind.config.js` for NativeWind
 * className usage — keep both in sync (there is no build-time bridge between a
 * `.ts` module and the Tailwind JS config).
 */
export const COLORS = {
  // Bucket slice colors (pie + legend dots).
  necesidades: '#464B69',
  gustos: '#E7E1BF',
  ahorro: '#3E9B52',
  // US-050 (design §2 D-10): the 4th ring wedge (SinCategoria) — a neutral
  // grey, same SEMANTICS as web's own SinCategoria color (uncategorized is
  // not over-budget, so it must not borrow an accent), but a DIFFERENT hex:
  // web's lib/bucket-colors.ts explicitly says not to port its migration to
  // apps/mobile. Reuses the neutral this palette already has for "sin
  // datos" (see `semaforoSinDatosIcon` below) instead of inventing a second
  // near-identical grey.
  sinCategoria: '#8A8F9C',

  // Semáforo — icon color + its tinted circle background.
  semaforoVerdeIcon: '#3E9B52',
  semaforoVerdeBg: '#DDF0E1',
  semaforoAmarilloIcon: '#C99A2E',
  semaforoAmarilloBg: '#F5E9C8',
  semaforoRojoIcon: '#D1495B',
  semaforoRojoBg: '#F7DEE1',
  semaforoSinDatosIcon: '#8A8F9C',
  semaforoSinDatosBg: '#ECECEF',
  // Semáforo deep text tones (hero redesign 2026-08-30): darker siblings of
  // the icon hues, minted because the icon colors fail AA as small TEXT on
  // white (#C99A2E ≈ 2.6:1). WCAG-verified: verde 6.20:1, amarillo 6.07:1,
  // rojo 7.33:1 on white; 5.20 / 5.02 / 5.75 on their own tinted chip
  // backgrounds (verdict box). Same divergence-from-web license as the rest
  // of this palette (do not copy web's rose/amber/emerald hexes here).
  semaforoVerdeDeep: '#2A6E39',
  semaforoAmarilloDeep: '#7E5D0F',
  semaforoRojoDeep: '#A32438',

  // Chrome.
  ingreso: '#3B4266',
  heading: '#2D2F3A',
  muted: '#8A8F9C',
  hairline: '#EBEBEE',
  canvas: '#F3F3F5',
} as const;

/**
 * Domain bucket name → slice/dot color. Keyed by the backend's canonical
 * bucket names ('Deseos', not the UI label 'Gustos').
 */
export const COLOR_BUCKET: Record<string, string> = {
  Necesidades: COLORS.necesidades,
  Deseos: COLORS.gustos,
  Ahorro: COLORS.ahorro,
  SinCategoria: COLORS.sinCategoria,
};

/**
 * Domain bucket name → user-facing label. The domain models the middle bucket
 * as "Deseos"; the product/UI surface calls it "Gustos" (mockup copy).
 */
export const ETIQUETA_BUCKET: Record<string, string> = {
  Necesidades: 'Necesidades',
  Deseos: 'Gustos',
  Ahorro: 'Ahorro',
  SinCategoria: 'Sin categoría',
};
