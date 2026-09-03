/**
 * Pie-chart contrast colors — DELIBERATELY theme-immune literals, not
 * `--foreground`/`--card` design-system tokens.
 *
 * `COLOR_BUCKET` (`lib/bucket-colors.ts`) is a permanent literal-hex pastel
 * palette that does NOT follow the app's identity (see that module's
 * docstring). A token-based label or stroke would move while those fills
 * stayed put, silently reintroducing the exact WCAG contrast failures these
 * two constants exist to fix (WDS-07). On top of that, no surface token can
 * even DESCRIBE the stroke's backdrop: `MiniDistribucionPie` renders inside a
 * `ResumenAnual` cell that is `bg-card` normally and `bg-ingreso` when its
 * month is selected. A `stroke-card` class was tried once and reverted for
 * precisely that reason.
 *
 * Do NOT "DRY" these back into `fill-foreground`/`stroke-card` classes.
 *
 * "Theme-immune" means UNBOUND FROM THE TOKENS, not "never needs to change" —
 * and the two constants differ on that second point, which matters when
 * reverting:
 * - `PIE_LABEL_FILL` is measured against the PASTELS, which never move, so it
 *   genuinely survives any identity change untouched.
 * - `PIE_WEDGE_STROKE` is measured against the pastels AND against the app
 *   surfaces it must disappear into, so an identity change DOES require
 *   re-deriving it by hand. Rolling the light identity back means reverting
 *   `index.css` and this constant TOGETHER (that file's `:root` note carries
 *   the same warning); reverting only one ships a visible halo, and the specs
 *   below assert the literal rather than its contrast, so CI stays green.
 */

/**
 * Dark on-surface label fill — 7.02-11.34:1 against every pastel slice fill
 * (WCAG 2.2 AA). UNCHANGED by the Tecno-Analítico restyle (2026-09-02): the
 * pastels it is measured against did not move, so neither did the answer.
 */
export const PIE_LABEL_FILL = '#1a1c1c';

/**
 * Wedge separator stroke between adjacent pastel slices (WCAG 1.4.11).
 *
 * Was `#ffffff` under the light "Serene Finance" identity. Two problems, one
 * of which predates the restyle:
 *
 * 1. White was always the WEAKER separator. Against the pastel fills it
 *    measured 1.51:1 (Ahorro), 2.07:1 (Sin categoría), 2.25:1 (Deseos),
 *    2.44:1 (Necesidades) — `lib/bucket-colors.ts` documents that ~1.5:1
 *    floor as knowingly shipped. This dark neutral separates at 7.86:1 /
 *    9.24:1 / 8.50:1 / 12.69:1 against the same four fills.
 * 2. On the matte-dark ground the stroke also runs along the donut's OUTER
 *    perimeter, where it had nothing to separate and simply drew a bright
 *    ring around the whole chart (18.55:1 against `bg-card`).
 *
 * #0d0f15 sits between `--background` (#090a0f) and `--card` (#11131a), so it
 * vanishes into every surface a pie can currently sit on — 1.03:1 on card,
 * 1.03:1 on background, 1.24:1 on the selected-month `ingreso` tint — while
 * cutting clean gaps between the wedges. It is a literal, not `var(--card)`,
 * for the reasons in the module docstring above: it must NOT follow a surface
 * it cannot predict.
 */
export const PIE_WEDGE_STROKE = '#0d0f15';
