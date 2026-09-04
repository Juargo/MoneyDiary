/**
 * Bucket pastel palette — WEB ONLY, diverges from
 * `apps/mobile/src/theme/colors.ts` by product decision (see
 * `openspec/changes/web-dashboard-redesign-mobile/design.md` §1.1 — do NOT
 * port this migration to `apps/mobile`). Hex values MUST match the Tailwind
 * `@theme` tokens in `index.css` (`--color-necesidades`/`--color-gustos`/
 * `--color-ahorro`/`--color-exceso`) — kept as literal hex here (not
 * `var(--color-...)`) because this module also feeds the pure
 * `resumen-view-model` (no DOM, no CSS cascade available).
 *
 * These four hexes were minted for the retired light "Serene Finance"
 * identity and OUTLIVED it: the Tecno-Analítico restyle (2026-09-02)
 * deliberately left them alone because they are mid-tone and still clear
 * 7.94-13.10:1 as fills on the dark ground (per-token table in `index.css`).
 * They are named for the buckets, not for an identity — do not assume a
 * future identity change has to move them, and do not assume it can't.
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
  // and ≈9.2:1 against the `PIE_WEDGE_STROKE` separator. That second number
  // was ≈2.1:1 while the separator was white; the Tecno-Analítico restyle
  // (2026-09-02) moved that literal to a dark neutral, which lifted every
  // wedge/separator pair well clear of the old ~1.5:1 pastel-yellow floor
  // this US originally shipped against.
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
 * Focus-ring contrast against these pastels — canonical source (the numbers
 * live HERE ONLY; `DistribucionPie.tsx`, `LeyendaGasto.tsx` and
 * `ResumenAnual.tsx` point back to this comment instead of repeating them).
 *
 * ⚠️ REWRITTEN 2026-09-03. Round 9 routed every focus state through `--ring`
 * and recorded that contrast "can only improve". That held while `--ring` was
 * #1A1C1C — a dark ring on light pastels. The Tecno-Analítico restyle moved
 * `--ring` to cyan #67E8F9, which INVERTED the conclusion for anything drawn
 * on a pastel. Current ratios:
 *
 * | Pastel fill                | --ring #1A1C1C (old) | --ring #67E8F9 (now) |
 * | -------------------------- | -------------------- | -------------------- |
 * | Necesidades   (#8FA7D1)    | 7.02:1               | 1.68:1               |
 * | Deseos/Gustos (#B1A7D1)    | 7.60:1               | 1.55:1               |
 * | Ahorro        (#E6D194)    | 11.34:1              | 1.04:1               |
 * | Sin categoría (#AEB4C4)    | 8.25:1               | 1.43:1               |
 *
 * On the app's own surfaces the trade runs the other way — cyan is 12.80:1 on
 * `--card`, 13.64:1 on `--background`, where #1A1C1C was ~1.1:1. Neither tone
 * serves both, and no third one does either: clearing 3:1 against #E6D194
 * caps relative luminance at 0.093 while clearing 3:1 against `--background`
 * needs ≥0.113, so the interval is EMPTY.
 *
 * What this means per consumer:
 * - `LeyendaGasto` / `ResumenAnual`: their focus rings sit on `--card`, never
 *   on a pastel (the pastel is a small dot INSIDE the row, not the row's
 *   background). Cyan at 12.80:1 — fine, nothing to do.
 * - `DistribucionPie`: its wedges ARE the pastel, and `outline` on an SVG
 *   path draws around the bounding box, which crosses them. That one needed a
 *   TWO-TONE indicator; the full derivation is at its call site.
 *
 * So "route every focus state through --ring" is still the house grammar, but
 * it is no longer sufficient on its own wherever the ring lands on a pastel.
 */
