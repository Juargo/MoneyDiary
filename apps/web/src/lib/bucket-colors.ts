/**
 * Bucket fill palette — WEB ONLY, diverges from
 * `apps/mobile/src/theme/colors.ts` by product decision (see
 * `openspec/changes/web-dashboard-redesign-mobile/design.md` §1.1 — do NOT
 * port this migration to `apps/mobile`). The `--color-*` values live in the
 * Tailwind `@theme` tokens in `index.css` (`--color-necesidades`/
 * `--color-gustos`/`--color-ahorro`/`--color-exceso`/`--color-sin-categoria`)
 * — `claseRellenoBucket`/`claseFondoBucket` below resolve to Tailwind
 * utility classes generated from those SAME tokens, never a hardcoded hex.
 *
 * `resumen-view-model` does NOT import this module (WT-09) — the domain
 * layer never imports `lib/`, see that module's own docstring.
 *
 * `web-theme-switch` PR4 (2026-09-12) retired the literal-hex `COLOR_BUCKET`/
 * `COLOR_EXCESO` exports this file used to carry: the five presentation
 * consumers (`DistribucionPie`, `MiniDistribucionPie`, `LeyendaGasto`,
 * `CategoriasPanel`, `ResumenAnual`) now resolve fills exclusively through
 * `claseRellenoBucket`/`claseFondoBucket` (D3) — same values, one fewer place
 * to keep in sync, and the fill flips with the theme once `.dark`/`:root`
 * diverge (S3/S4).
 *
 * "Brote" palette (2026-09-12): re-tinted by product-owner choice for
 * psychological meaning, not just contrast — see the per-token rationale and
 * measurements in `index.css`. Named for the buckets, not for an identity.
 */

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
 * option (e.g. `FilaRevision`'s leading `BUCKET_SENTINEL_OPTION`) — this
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
 * Focus-ring contrast against these bucket fills — canonical source (the
 * numbers live HERE ONLY; `DistribucionPie.tsx`, `LeyendaGasto.tsx` and
 * `ResumenAnual.tsx` point back to this comment instead of repeating them).
 *
 * ⚠️ REWRITTEN 2026-09-12 for the Brote re-tint (previously rewritten
 * 2026-09-03, when the Tecno-Analítico restyle moved `--ring` from dark
 * #1A1C1C to cyan #67E8F9 and inverted Round 9's "contrast can only improve"
 * conclusion for a dark ring on light fills — see git history for those
 * retired per-pastel numbers, superseded now that the fills themselves
 * changed). Current ratios, cyan `--ring` against each bucket fill (the
 * `--color-*` tokens in `index.css`, formerly the literal-hex `COLOR_BUCKET`
 * map this file retired in PR4):
 *
 * | Bucket fill                 | --ring #67E8F9 (cyan) |
 * | ---------------------------- | ---------------------- |
 * | Necesidades   (#77A7E5)      | 1.72:1                  |
 * | Deseos/Gustos (#BB6C90)      | 2.56:1                  |
 * | Ahorro        (#47DAB4)      | 1.21:1                  |
 * | Sin categoría (#686663)      | 3.95:1                  |
 *
 * On the app's own surfaces cyan stays strong regardless — 12.80:1 on
 * `--card`, 13.64:1 on `--background`. Relative luminance of each fill:
 * Necesidades 0.372, Deseos 0.233, Ahorro 0.548, Sin categoría 0.133;
 * `--background` 0.0031. Re-derived interval for a single opaque tone:
 * clearing 3:1 against Ahorro (lightest fill) caps that tone's luminance at
 * ≤0.149; clearing 3:1 against Sin categoría (darkest fill) requires ≤0.011
 * or ≥0.500; clearing 3:1 against `--background` requires ≥0.109. No value
 * satisfies all three at once → the interval is still EMPTY (same conclusion
 * as before the re-tint, now driven by Sin categoría's own fill closing the
 * gap rather than Ahorro alone).
 *
 * What this means per consumer:
 * - `LeyendaGasto` / `ResumenAnual`: their focus rings sit on `--card`, never
 *   on a fill (the fill is a small dot INSIDE the row, not the row's
 *   background). Cyan at 12.80:1 — fine, nothing to do.
 * - `DistribucionPie`: its wedges ARE the fill, and `outline` on an SVG
 *   path draws around the bounding box, which crosses them. That one needed a
 *   TWO-TONE indicator; the full derivation is at its call site.
 *
 * So "route every focus state through --ring" is still the house grammar, but
 * it is no longer sufficient on its own wherever the ring lands on a fill.
 */

/**
 * Domain bucket name → Tailwind SVG-fill class, backed by the `--color-*`
 * tokens above (D3, `web-theme-switch`). Static full literal per branch —
 * Tailwind 4 detects utilities by scanning source for complete class
 * strings, so this MUST NOT be built from a template literal or
 * concatenation (`fill-${slug}` would compile to nothing).
 */
const CLASE_RELLENO_BUCKET: Record<string, string> = {
  Necesidades: 'fill-necesidades',
  Deseos: 'fill-gustos',
  Ahorro: 'fill-ahorro',
  SinCategoria: 'fill-sin-categoria',
};

export function claseRellenoBucket(bucket: string): string {
  return CLASE_RELLENO_BUCKET[bucket] ?? 'fill-muted-foreground';
}

/**
 * Domain bucket name → Tailwind `text-color` class for the icon badge glyph
 * (categoria-iconografia D-08): reuses the SAME `--color-pie-etiqueta-*`
 * tokens as `claseEtiquetaPie` (`lib/pie-colors.ts`) — those are already the
 * measured on-fill ink per bucket in both ADR-043 themes (WCAG 1.4.11 ≥3:1
 * against `claseRellenoBucket`'s fill, see design.md "Contrast"). Minting a
 * separate glyph-ink token family was rejected (D-08) precisely to avoid
 * this exact duplication — one set of measured values, two Tailwind
 * property axes (`fill-`/`text-`) pointed at it. `SinCategoria` is the
 * fallback for both the synthetic "Sin categoría" group AND any unrecognized
 * bucket key, same rationale as `claseEtiquetaPie`'s own fallback comment
 * (the three spend buckets share the same fallback family).
 */
const CLASE_GLIFO_BUCKET: Record<string, string> = {
  Necesidades: 'text-pie-etiqueta-necesidades',
  Deseos: 'text-pie-etiqueta-gustos',
  Ahorro: 'text-pie-etiqueta-ahorro',
  SinCategoria: 'text-pie-etiqueta-sin-categoria',
};

export function claseGlifoBucket(bucket: string): string {
  return CLASE_GLIFO_BUCKET[bucket] ?? 'text-pie-etiqueta-necesidades';
}

/** Same mapping as `claseRellenoBucket`, for `background-color` instead of SVG `fill`. */
const CLASE_FONDO_BUCKET: Record<string, string> = {
  Necesidades: 'bg-necesidades',
  Deseos: 'bg-gustos',
  Ahorro: 'bg-ahorro',
  SinCategoria: 'bg-sin-categoria',
};

export function claseFondoBucket(bucket: string): string {
  return CLASE_FONDO_BUCKET[bucket] ?? 'bg-muted-foreground';
}
