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
 *
 * Cross-workspace copy pin (US-049): `apps/api/src/domain/value-objects/
 * semaforo-detalle.ts`'s `ETIQUETA_BUCKET_COPY` duplicates this same
 * Deseos → 'Gustos' mapping for backend-generated diagnosis/advice copy — no
 * automated gate catches drift between the two maps (documented residual
 * risk, design §6). If you change this label, change that one too.
 */
export const ETIQUETA_BUCKET: Record<string, string> = {
  Necesidades: 'Necesidades',
  Deseos: 'Gustos',
  Ahorro: 'Ahorro',
  SinCategoria: 'Sin categoría',
};

/**
 * construirOpcionesBucket — builds `{ value, label }[]` bucket option lists
 * for a `<select>`, applying `ETIQUETA_BUCKET` uniformly: `value` stays the
 * domain key (e.g. `'Deseos'`), `label` is the resolved UI text (e.g.
 * `'Gustos'`).
 *
 * Round-9 critique fixes found this exact mapping duplicated ad hoc at FIVE
 * call sites — `FilaRevision`, `PreviewMuestra` (per-row + toolbar),
 * `RegistrarMovimientoForm`, and `NuevaCategoriaForm`/`EditarCategoria`'s
 * shared `OPCIONES_BUCKET` — the same class of drift risk this file's own
 * `ETIQUETA_BUCKET` doc comment already flags for the sibling
 * `ETIQUETA_BUCKET_COPY` map in the backend. One function, one place to fix
 * if the label rule ever changes. Callers still prepend their own sentinel
 * option (e.g. `SelectorBucket`'s leading "Sin categoría" radio) — this
 * helper only builds the "real" bucket entries.
 */
export function construirOpcionesBucket(
  buckets: readonly string[],
): { value: string; label: string }[] {
  return buckets.map((bucket) => ({
    value: bucket,
    label: ETIQUETA_BUCKET[bucket] ?? bucket,
  }));
}

/**
 * Focus-ring contrast — round-9 critique P3 (canonical source: the numbers
 * below live HERE ONLY; `DistribucionPie.tsx`, `LeyendaGasto.tsx`, and
 * `ResumenAnual.tsx` point back to this comment instead of repeating the
 * table). Their focus-visible outline converged from a literal
 * `outline-slate-800` (#1E293B) to the shared `--ring` token, `outline-ring`
 * (#1A1C1C) — the same focus grammar every other interactive element in the
 * app already uses (DESIGN.md's "Do route every focus state through
 * --ring"). The old literal carried a "do NOT re-tint" comment from an
 * earlier review whose concern was contrast against these pastel fills;
 * #1A1C1C is DARKER than #1E293B (relative luminance 0.01134 vs 0.02178 per
 * the WCAG contrast formula), so contrast against every bucket pastel — and
 * white — can only improve. Ratios (WCAG relative-luminance contrast, old
 * outline-slate-800 → new outline-ring):
 *
 * | Surface                      | outline-slate-800 | outline-ring |
 * | ----------------------------- | ------------------ | ------------ |
 * | Necesidades   (#8FA7D1)       | 6.00:1              | 7.02:1       |
 * | Deseos/Gustos (#B1A7D1)       | 6.49:1              | 7.60:1       |
 * | Ahorro        (#E6D194)       | 9.69:1              | 11.34:1      |
 * | Sin categoría (#AEB4C4)       | 7.05:1              | 8.25:1       |
 * | White         (#FFFFFF)       | 14.63:1             | 17.12:1      |
 *
 * All values clear the WCAG 2.2 AA 3:1 large-text/non-text floor by a wide
 * margin both before and after the convergence.
 */
