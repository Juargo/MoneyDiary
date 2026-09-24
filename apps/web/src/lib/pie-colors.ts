/**
 * Pie-chart contrast colors — token-backed classes, DELIBERATELY not
 * `fill-foreground`/`stroke-card` design-system utility classes.
 *
 * The bucket fill palette (`lib/bucket-colors.ts`) does NOT follow the app's
 * identity (see that module's docstring) — reusing `--foreground`/`--card`
 * here would move the label/stroke while those fills stayed put, silently
 * reintroducing the exact WCAG contrast failures these tokens exist to fix
 * (WDS-07). On top of that, no surface token can even DESCRIBE the stroke's
 * backdrop: `MiniDistribucionPie` renders inside a `ResumenAnual` cell that
 * is `bg-card` normally and `bg-ingreso` when its month is selected. A
 * `stroke-card` class was tried once and reverted for precisely that reason.
 *
 * Do NOT "DRY" `claseEtiquetaPie`/`CLASE_SEPARADOR_PIE` back into
 * `fill-foreground`/`stroke-card` classes.
 *
 * Both are measured against the bucket fill palette in `bucket-colors.ts`,
 * which DOES move (re-tinted for the Brote palette on 2026-09-12) — the
 * `--color-pie-etiqueta-*`/`--color-pie-separador` values in `index.css` must
 * be RE-MEASURED every time that palette changes. Rolling a palette back
 * means reverting `index.css`, `bucket-colors.ts`, and this file TOGETHER; a
 * half-revert ships a visible contrast regression that CI won't catch (the
 * specs below assert the resolved class, not a live contrast ratio).
 */

/**
 * Domain bucket name → Tailwind SVG-fill class for the on-wedge `%` label,
 * backed by the `--color-pie-etiqueta-*` tokens in `index.css` (D3,
 * `web-theme-switch`). Necesidades/Deseos/Ahorro (and any unrecognized key)
 * resolve to the dark label. Mirrors `construirOpcionesBucket` in
 * `bucket-colors.ts`: one function, one place to fix if a future palette
 * change moves which bucket needs which label.
 *
 * Issue #778 tramo5b PR1: the dedicated `SinCategoria` entry (a light label,
 * needed because its mid grey fill #686663 was too dark for the shared dark
 * label) is REMOVED along with the wedge itself — the ring no longer renders
 * a SinCategoria slice, so there is no fill left that needs the light
 * variant. See `lib/bucket-colors.ts` for the removed fill/label rationale.
 *
 * Static full literal per branch, same reason as `claseRellenoBucket` in
 * `lib/bucket-colors.ts`: Tailwind 4 only emits utilities it can find as a
 * complete string in source.
 */
const CLASE_ETIQUETA_PIE: Record<string, string> = {
  Necesidades: 'fill-pie-etiqueta-necesidades',
  Deseos: 'fill-pie-etiqueta-gustos',
  Ahorro: 'fill-pie-etiqueta-ahorro',
};

/**
 * An unrecognized bucket key gets the same dark-label family the three spend
 * buckets use (Necesidades/Deseos/Ahorro all resolve to the identical token
 * value today — see `index.css` — so any of the three is an equivalent
 * fallback; Necesidades is picked for consistency with `BUCKETS_5030`'s
 * canonical order).
 */
export function claseEtiquetaPie(bucket: string): string {
  return CLASE_ETIQUETA_PIE[bucket] ?? 'fill-pie-etiqueta-necesidades';
}

/**
 * Wedge separator stroke class between adjacent bucket slices (WCAG 1.4.11),
 * backed by the `--color-pie-separador` token in `index.css` — see the block
 * comment above for why this must NOT be a `stroke-card` design-system class.
 */
export const CLASE_SEPARADOR_PIE = 'stroke-pie-separador';
