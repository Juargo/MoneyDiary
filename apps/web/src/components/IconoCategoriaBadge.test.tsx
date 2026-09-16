import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { IconoCategoriaBadge } from './IconoCategoriaBadge';

/**
 * IconoCategoriaBadge.test.tsx (categoria-iconografia, CATICO-06/08,
 * design.md "UI"). The badge itself is a leaf presentational unit —
 * `iconoCategoria()`'s own resolution (valid/null/unknown/retired name →
 * component) is already fully covered by `lib/iconos-categoria.test.ts`
 * (PR3b), so this suite does NOT re-verify which lucide icon renders for
 * which `icono` value; it verifies the badge's OWN two contracts: the icon
 * is exposed as decorative (`aria-hidden`, CATICO-08 "an icon rendered
 * alongside the category's own visible name ... MUST be exposed as
 * decorative") and the glyph/fill classes are the bucket-derived ones from
 * `lib/bucket-colors.ts` (D-08), never a hardcoded color.
 */
describe('IconoCategoriaBadge', () => {
  it('renders a decorative (aria-hidden) icon using the Necesidades bucket fill/glyph classes', () => {
    const { container } = render(
      <IconoCategoriaBadge icono="house" bucket="Necesidades" />,
    );

    const icono = container.querySelector('svg[aria-hidden="true"]');
    expect(icono).not.toBeNull();
    expect(icono).toHaveClass('text-pie-etiqueta-necesidades');
    const badge = container.firstElementChild;
    expect(badge).toHaveClass('bg-necesidades');
  });

  it('a null icono (Sin categoría fallback) still renders a decorative icon, using the Ahorro bucket fill/glyph classes', () => {
    const { container } = render(
      <IconoCategoriaBadge icono={null} bucket="Ahorro" />,
    );

    const icono = container.querySelector('svg[aria-hidden="true"]');
    expect(icono).not.toBeNull();
    expect(icono).toHaveClass('text-pie-etiqueta-ahorro');
    const badge = container.firstElementChild;
    expect(badge).toHaveClass('bg-ahorro');
  });
});
