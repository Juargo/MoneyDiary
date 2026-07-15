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

  // Semáforo — icon color + its tinted circle background.
  semaforoVerdeIcon: '#3E9B52',
  semaforoVerdeBg: '#DDF0E1',
  semaforoAmarilloIcon: '#C99A2E',
  semaforoAmarilloBg: '#F5E9C8',
  semaforoRojoIcon: '#D1495B',
  semaforoRojoBg: '#F7DEE1',
  semaforoSinDatosIcon: '#8A8F9C',
  semaforoSinDatosBg: '#ECECEF',

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
