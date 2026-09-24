import { createElement } from 'react';
import { View } from 'react-native';
import { COLOR_BUCKET, COLOR_GLIFO_BUCKET, COLORS } from '../theme/colors';
import { iconoCategoria } from './iconos-categoria';

export interface IconoCategoriaBadgeProps {
  readonly icono: string | null | undefined;
  readonly bucket: string;
}

/**
 * IconoCategoriaBadge (categoria-iconografia, ADR-045, CATICO-06/08,
 * design.md "UI"): mobile's badge is a circle — design.md: "a `size-6`
 * square (web radius 0) or a mobile circle" — filled with the bucket color
 * (`COLOR_BUCKET`) and glyph = the measured on-fill ink for that bucket
 * (`COLOR_GLIFO_BUCKET`, D-08). Icon resolution (`icono` → lucide component,
 * `null`/unknown/retired name → the `Tag` fallback) is `iconoCategoria()`'s
 * job (`components/iconos-categoria.ts`, PR3c) — this component never
 * re-implements that lookup.
 *
 * Fallback fill/ink match this file's existing conventions:
 * `DistribucionPie.tsx`/`LeyendaGasto.tsx` already fall back an unrecognized
 * bucket to `'#CCCCCC'`; `COLORS.heading` is the dark-ink fallback already
 * used for `Deseos` in `COLOR_GLIFO_BUCKET`. Issue #778 tramo5b PR2:
 * `SinCategoria` has no dedicated entry anymore in either map — a badge for
 * the still-reachable `/bucket/SinCategoria` page (direct URL only) now
 * falls back to this SAME generic fill/ink instead of a bucket-specific one.
 *
 * `createElement`, not a JSX tag — this workspace's `eslint-config-expo`
 * ALSO enforces `react-hooks/static-components` ("components created during
 * render"), the same gate web's `IconoCategoriaBadge.tsx`/`SelectorIcono.tsx`
 * document: `iconoCategoria()`'s RESULT assigned to a local and used as a
 * literal JSX tag (`<Icono />`) trips it, even though the returned reference
 * is always one of a fixed, statically-imported set of lucide components.
 * `createElement` is an ordinary function call, not JSX syntax, so it isn't
 * checked by that rule.
 *
 * Hidden from the accessibility tree (`accessibilityElementsHidden` +
 * `importantForAccessibility="no-hide-descendants"`, `IngresoCard.tsx`
 * precedent): CATICO-08 requires an icon rendered next to the category's
 * own visible name to be decorative, never double-announced — every caller
 * of this badge (`CategoriaFila`) already renders it beside a text label,
 * so the accessible name comes from that text, never from this glyph.
 */
export function IconoCategoriaBadge({
  icono,
  bucket,
}: IconoCategoriaBadgeProps) {
  const fondo = COLOR_BUCKET[bucket] ?? '#CCCCCC';
  const glifo = COLOR_GLIFO_BUCKET[bucket] ?? COLORS.heading;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="size-6 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: fondo }}
    >
      {createElement(iconoCategoria(icono), { size: 14, color: glifo })}
    </View>
  );
}
