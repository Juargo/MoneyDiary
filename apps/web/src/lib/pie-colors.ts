/**
 * Pie-chart contrast colors — DELIBERATELY theme-immune literals, not
 * `--foreground`/`--card` design-system tokens.
 *
 * `COLOR_BUCKET` (`lib/bucket-colors.ts`) is a permanent literal-hex pastel
 * palette that does NOT flip with `.dark` (see that module's docstring).
 * `--foreground`/`--card` DO flip in the `.dark` block in `index.css`
 * (foreground → near-white, card → dark). If dark mode is ever wired up,
 * a token-based label/stroke would render a near-white label on the SAME
 * unchanged light pastel fill — reintroducing the exact WCAG AA contrast
 * failure these colors exist to fix (WDS-07). Keep these as literals so the
 * pie's contrast guarantee never depends on which theme is active.
 *
 * Do NOT "DRY" these back into `fill-foreground`/`stroke-card` classes.
 */

/** Dark on-surface label fill — passes 7.4-11.9:1 against every pastel slice fill (WCAG 2.2 AA). */
export const PIE_LABEL_FILL = '#1a1c1c'

/** White wedge separator stroke between adjacent pastel slices (WCAG 1.4.11). */
export const PIE_WEDGE_STROKE = '#ffffff'
