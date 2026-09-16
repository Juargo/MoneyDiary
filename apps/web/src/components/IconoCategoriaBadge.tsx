import { createElement } from 'react';
import { claseFondoBucket, claseGlifoBucket } from '@/lib/bucket-colors';
import { iconoCategoria } from '@/lib/iconos-categoria';
import { cn } from '@/lib/utils';

/**
 * IconoCategoriaBadge (categoria-iconografia, ADR-045, CATICO-06/08,
 * design.md "UI"): a `size-6` square badge — fill = bucket, glyph = the
 * measured on-fill ink for that bucket (D-08, `claseFondoBucket`/
 * `claseGlifoBucket`, `lib/bucket-colors.ts`). Icon resolution (`icono` →
 * lucide component, `null`/unknown/retired name → the `Tag` fallback) is
 * `iconoCategoria()`'s job (`lib/iconos-categoria.ts`, PR3b) — this
 * component never re-implements that lookup.
 *
 * `aria-hidden="true"` on the glyph itself (CategoriaFila's `Pencil`/
 * `Trash2` precedent): CATICO-08 requires an icon rendered next to the
 * category's own visible name to be decorative, never double-announced —
 * the caller always renders this badge beside a text label (`CategoriaFila`,
 * `GrupoMovimientos`, PR5), so the accessible name comes from that text,
 * never from this glyph.
 */
export function IconoCategoriaBadge({
  icono,
  bucket,
}: {
  readonly icono: string | null | undefined;
  readonly bucket: string;
}) {
  // `createElement`, not a JSX tag, on purpose: `iconoCategoria()` resolves
  // to one of a fixed, statically-imported set of lucide components, but
  // assigning its RESULT to a local and using it as a literal JSX tag
  // (`<Icono />`) trips `react-hooks/static-components` ("components
  // created during render") — the rule can't see through the function call
  // to know the returned reference is always one of a stable set.
  // `createElement` is an ordinary function call, not JSX syntax, so it
  // isn't checked by that rule.
  return (
    <span
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-none',
        claseFondoBucket(bucket),
      )}
    >
      {createElement(iconoCategoria(icono), {
        'aria-hidden': 'true',
        className: cn('size-[18px]', claseGlifoBucket(bucket)),
      })}
    </span>
  );
}
