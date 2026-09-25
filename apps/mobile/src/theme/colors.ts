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
  // AA-passing muted for small text (income card redesign 2026-08-30):
  // `muted` (#8A8F9C, ~3.4:1 on white) fails WCAG AA below large-text size.
  // Minted per the semáforo deep-tone precedent (5.85:1 on white); existing
  // `muted` call sites are pre-existing debt, migrated opportunistically.
  mutedDeep: '#5F6572',
  hairline: '#EBEBEE',
  canvas: '#F3F3F5',
} as const;

/**
 * Domain bucket name → slice/dot color. Keyed by the backend's canonical
 * bucket names ('Deseos', not the UI label 'Gustos').
 *
 * Issue #778 tramo5b PR2 (apps/mobile): the dedicated `SinCategoria` entry
 * is REMOVED, mirroring apps/web's own PR1 (`lib/bucket-colors.ts`'s
 * `CLASE_RELLENO_BUCKET`/`CLASE_FONDO_BUCKET`) — the ring/legend never
 * render a SinCategoria slice/dot anymore, so there is no fill left that
 * needs it. Any unrecognized bucket key (including a literal `'SinCategoria'`,
 * still reachable only via a direct `/bucket/SinCategoria` URL) falls back
 * to `'#CCCCCC'` at each call site.
 */
export const COLOR_BUCKET: Record<string, string> = {
  Necesidades: COLORS.necesidades,
  Deseos: COLORS.gustos,
  Ahorro: COLORS.ahorro,
};

/**
 * Domain bucket name → user-facing label. The domain models the middle bucket
 * as "Deseos"; the product/UI surface calls it "Gustos" (mockup copy).
 *
 * `SinCategoria` reads "Sin grupo ni categoría", NOT "Sin categoría", so it
 * cannot be confused with the synthetic "Sin categoría" group the API builds
 * INSIDE a bucket detail for `categoriaId IS NULL`. This one is
 * `bucketId IS NULL`: no grupo, and therefore no categoría either. The web
 * twin in `apps/web/src/lib/bucket-colors.ts` carries the same map and the
 * full rationale; the two must stay in sync.
 *
 * Issue #778 tramo5b PR2: unlike `COLOR_BUCKET`/`COLOR_GLIFO_BUCKET` below,
 * this entry STAYS — `ReclasificarMobileControl` still reads it to name the
 * source bucket when reclassifying a movement OUT of SinCategoria, and
 * `BucketDetalleScreen`'s header still reads it for the still-reachable
 * `/bucket/SinCategoria` route (direct URL, no longer linked from the
 * dashboard). Removing it would leak the raw internal key `"SinCategoria"`
 * to that copy instead of degrading gracefully.
 */
export const ETIQUETA_BUCKET: Record<string, string> = {
  Necesidades: 'Necesidades',
  Deseos: 'Gustos',
  Ahorro: 'Ahorro',
  SinCategoria: 'Sin grupo ni categoría',
};

/**
 * Domain bucket name → glyph ink color for the category icon badge
 * (categoria-iconografia, ADR-045 D-08). Web reuses its own measured
 * `--color-pie-etiqueta-*` tokens for the same purpose; mobile has no
 * equivalent CSS token family, so this mints the two literal inks the
 * design already measured against each bucket fill (design.md "Contrast"):
 * white on the two darker fills (Necesidades 8.5:1, Ahorro 3.5:1), and
 * `COLORS.heading` on the paler fill (Gustos 10.1:1). Ahorro's 3.5:1 barely
 * clears the SC 1.4.11 floor and Gustos' own fill measures only ~1.3:1
 * against a white page background, so neither badge may rely on color
 * alone — the glyph shape and the adjacent bucket name both carry the
 * information.
 *
 * Issue #778 tramo5b PR2: the dedicated `SinCategoria` entry is REMOVED,
 * mirroring apps/web's own PR1 (`lib/pie-colors.ts`'s `CLASE_ETIQUETA_PIE`)
 * — any unrecognized bucket key falls back to `COLORS.heading` at the call
 * site (`IconoCategoriaBadge.tsx`).
 */
export const COLOR_GLIFO_BUCKET: Record<string, string> = {
  Necesidades: '#FFFFFF',
  Deseos: COLORS.heading,
  Ahorro: '#FFFFFF',
};
