/**
 * IconoCategoriaBadge.spec.tsx (categoria-iconografia, ADR-045, PR6, task 6.1)
 *
 * Mirrors `apps/web/src/components/IconoCategoriaBadge.test.tsx`'s two-case
 * shape (different bucket AND different icono state per case). Web queries
 * the resolved lucide glyph via its DOM class (`svg.lucide-shopping-cart`);
 * this repo's mobile test renderer (`test-renderer`, `TestInstance.type` is
 * a host-element STRING) exposes no equivalent "query by component
 * reference" — confirmed via its `dist/index.d.ts` (only `queryAll` over
 * host elements). `iconoCategoria()` itself is already fully covered by
 * `iconos-categoria.spec.ts` (PR3c: totality, null/undefined, retired
 * names), so this suite mocks that ONE collaborator and asserts the
 * badge's own job — forwarding the resolved icon component with the
 * correct `size`/`color`, wiring the bucket fill, and hiding the glyph from
 * the accessibility tree (CATICO-06/08) — without re-testing icon
 * resolution.
 */
import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { COLOR_BUCKET, COLOR_GLIFO_BUCKET } from '../theme/colors';
import { IconoCategoriaBadge } from './IconoCategoriaBadge';
import { iconoCategoria } from './iconos-categoria';

jest.mock('./iconos-categoria', () => ({
  iconoCategoria: jest.fn(),
}));

const mockIconoCategoria = iconoCategoria as jest.MockedFunction<
  typeof iconoCategoria
>;

function FakeIcon({
  size,
  color,
}: {
  readonly size?: number;
  readonly color?: string;
}) {
  return (
    <View
      testID="fake-icon"
      style={{ width: size }}
      accessibilityLabel={color}
    />
  );
}

describe('IconoCategoriaBadge (categoria-iconografia, PR6, CATICO-06/08)', () => {
  beforeEach(() => {
    // `FakeIcon` is a plain function component, not a real `LucideIcon`
    // (`ForwardRefExoticComponent`) — the cast is safe here because this
    // mock is only ever consumed via `createElement`, which does not care
    // about the exact component shape.
    mockIconoCategoria.mockReturnValue(FakeIcon as unknown as LucideIcon);
  });

  it('resolves the icono via iconoCategoria() and renders it on the bucket fill with the measured glyph ink (Necesidades)', async () => {
    await render(<IconoCategoriaBadge icono="bike" bucket="Necesidades" />);

    expect(mockIconoCategoria).toHaveBeenCalledWith('bike');

    // `includeHiddenElements`: the badge deliberately hides its glyph from
    // the accessibility tree (CATICO-08, asserted separately below) — RNTL
    // excludes hidden elements from queries by default.
    const icono = screen.getByTestId('fake-icon', {
      includeHiddenElements: true,
    });
    expect(icono.props.style).toMatchObject({ width: 14 });
    expect(icono.props.accessibilityLabel).toBe(COLOR_GLIFO_BUCKET.Necesidades);
  });

  it('passes null through to iconoCategoria() and uses the Deseos fill/ink (CATICO-06)', async () => {
    await render(<IconoCategoriaBadge icono={null} bucket="Deseos" />);

    expect(mockIconoCategoria).toHaveBeenCalledWith(null);

    const icono = screen.getByTestId('fake-icon', {
      includeHiddenElements: true,
    });
    expect(icono.props.accessibilityLabel).toBe(COLOR_GLIFO_BUCKET.Deseos);
  });

  it('hides the glyph from the accessibility tree — decorative next to visible text (CATICO-08)', async () => {
    await render(<IconoCategoriaBadge icono="house" bucket="Ahorro" />);

    const badge = screen.root;
    expect(badge?.props.accessibilityElementsHidden).toBe(true);
    expect(badge?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(badge?.props.style).toMatchObject({
      backgroundColor: COLOR_BUCKET.Ahorro,
    });
  });
});
