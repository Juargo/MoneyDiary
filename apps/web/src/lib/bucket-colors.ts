/**
 * DOM port of `apps/mobile/src/theme/colors.ts` (`COLOR_BUCKET`/
 * `ETIQUETA_BUCKET` only — the semáforo/chrome tokens aren't needed on web
 * yet, YAGNI). Hex values MUST match the Tailwind `@theme` tokens in
 * `index.css` (`--color-necesidades`/`--color-gustos`/`--color-ahorro`) —
 * kept as literal hex here (not `var(--color-...)`) because this module also
 * feeds the pure `resumen-view-model` (no DOM, no CSS cascade available).
 */

/**
 * Domain bucket name → slice/dot color. Keyed by the backend's canonical
 * bucket names ('Deseos', not the UI label 'Gustos').
 */
export const COLOR_BUCKET: Record<string, string> = {
  Necesidades: '#464B69',
  Deseos: '#E7E1BF',
  Ahorro: '#3E9B52',
}

/**
 * Domain bucket name → user-facing label. The domain models the middle bucket
 * as "Deseos"; the product/UI surface calls it "Gustos" (mockup copy).
 */
export const ETIQUETA_BUCKET: Record<string, string> = {
  Necesidades: 'Necesidades',
  Deseos: 'Gustos',
  Ahorro: 'Ahorro',
  SinCategoria: 'Sin categoría',
}
