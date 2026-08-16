/**
 * Serene Finance palette — WEB ONLY, diverges from
 * `apps/mobile/src/theme/colors.ts` by product decision (see
 * `openspec/changes/web-dashboard-redesign-mobile/design.md` §1.1 — do NOT
 * port this migration to `apps/mobile`). Hex values MUST match the Tailwind
 * `@theme` tokens in `index.css` (`--color-necesidades`/`--color-gustos`/
 * `--color-ahorro`/`--color-exceso`) — kept as literal hex here (not
 * `var(--color-...)`) because this module also feeds the pure
 * `resumen-view-model` (no DOM, no CSS cascade available).
 */

/**
 * Domain bucket name → slice/dot color. Keyed by the backend's canonical
 * bucket names ('Deseos', not the UI label 'Gustos').
 */
export const COLOR_BUCKET: Record<string, string> = {
  Necesidades: '#8FA7D1', // soft blue
  Deseos: '#B1A7D1', // lavanda
  Ahorro: '#E6D194', // pastel yellow
  // US-047 (design D-08): a deliberate neutral grey for the donut ring's 4th
  // wedge — NOT `COLOR_EXCESO` (over-budget and uncategorized are different
  // meanings; sharing the accent would teach the user the wrong thing) and
  // NOT the `#CCCCCC` unstyled fallback. Contrast verified (WCAG AA):
  // ≈8.3:1 against `PIE_LABEL_FILL` (#1a1c1c) on-wedge label text — well
  // above the 3:1 large-text floor the other 3 pastels already clear — and
  // ≈2.1:1 against the white `PIE_WEDGE_STROKE` separator, exceeding the
  // existing pastel-yellow slice's own ~1.5:1 (the unamended floor this
  // change ships against, unchanged by this US).
  SinCategoria: '#AEB4C4', // neutral grey
};

/**
 * Over-budget accent (fills/dots ONLY, never text — see design.md §1). May
 * ship unconsumed: the dashboard has no over-budget progress-bar affordance
 * today (YAGNI — not inventing one in a restyle).
 */
export const COLOR_EXCESO = '#E88A8A';

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
