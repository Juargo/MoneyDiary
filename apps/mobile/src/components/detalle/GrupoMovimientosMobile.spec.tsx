/**
 * GrupoMovimientosMobile spec — T-10 RED (US-056, D-04/D-19/MDET-03)
 * Updated in T-15 to pass the required onReclasificado/onMovida props
 * (added as REQUIRED props per us-044 PR7 banned-pattern contract).
 * Updated in T-15 bugfix to pass the required `bucket` prop (raw wire key
 * from BucketDetalleScreen — GrupoDetalleBucketMesDto does not carry it).
 *
 * ReclasificarMobileControl is mocked at the module boundary so these
 * tests stay focused on accordion/destacado mechanics without triggering
 * catalog fetches.
 */

import { act, render, screen, fireEvent } from '@testing-library/react-native';
import type { GrupoDetalleBucketMesDto } from '../../domain/detalle.types';
import { GrupoMovimientosMobile } from './GrupoMovimientosMobile';
import { IconoCategoriaBadge } from '../IconoCategoriaBadge';

// Mock ReclasificarMobileControl — this spec tests accordion/destacado, not reclassify.
// The real control is tested in ReclasificarMobileControl.spec.tsx.
jest.mock('./ReclasificarMobileControl', () => ({
  ReclasificarMobileControl: () => null,
}));

// categoria-iconografia (PR7, task 7.1, MDET-03): mock the badge itself —
// its own rendering (fill/ink/fallback/hidden-from-a11y) is fully covered by
// `IconoCategoriaBadge.spec.tsx`; this suite only proves the group header
// wires `icono`/`bucket` INTO it.
jest.mock('../IconoCategoriaBadge', () => ({
  IconoCategoriaBadge: jest.fn(() => null),
}));

const mockIconoCategoriaBadge = IconoCategoriaBadge as jest.MockedFunction<
  typeof IconoCategoriaBadge
>;

function makeTx(id: string) {
  return {
    id,
    descripcion: `Tx ${id}`,
    fecha: '2026-07-01',
    origen: 'BCI',
    monto: '10000',
  };
}

function makeGrupo(
  categoriaId: string | null,
  nombre: string,
  txCount: number,
  icono: string | null = null,
): GrupoDetalleBucketMesDto {
  return {
    categoriaId,
    nombre,
    conteo: txCount,
    subtotal: String(txCount * 10000),
    icono,
    transacciones: Array.from({ length: txCount }, (_, i) =>
      makeTx(`${categoriaId ?? 'sin'}-tx-${i + 1}`),
    ),
  };
}

describe('GrupoMovimientosMobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('group with 12 rows shows exactly 10 rows and "Ver 2 más" collapsed (accessibilityState.expanded false)', async () => {
    const grupo = makeGrupo('cat-1', 'Entretenimiento', 12);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // Exactly 10 rows visible (the first 10)
    for (let i = 1; i <= 10; i++) {
      expect(screen.getByTestId(`movimiento-cat-1-tx-${i}`)).toBeTruthy();
    }
    // 11th and 12th not visible
    expect(screen.queryByTestId('movimiento-cat-1-tx-11')).toBeNull();
    expect(screen.queryByTestId('movimiento-cat-1-tx-12')).toBeNull();

    // Toggle shows 'Ver 2 más'
    const toggle = screen.getByTestId('grupo-toggle-cat-1');
    expect(toggle).toBeTruthy();
    expect(screen.getByText('Ver 2 más')).toBeTruthy();
    // accessibilityState.expanded must be false when collapsed
    expect(toggle.props.accessibilityState?.expanded).toBe(false);
  });

  it('pressing "Ver N más" reveals all 12 rows and changes text to "Ver menos" (accessibilityState.expanded true)', async () => {
    const grupo = makeGrupo('cat-1', 'Entretenimiento', 12);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // Press the toggle — wrap in act to flush state updates
    await act(async () => {
      fireEvent.press(screen.getByTestId('grupo-toggle-cat-1'));
    });

    // All 12 rows now visible
    for (let i = 1; i <= 12; i++) {
      expect(screen.getByTestId(`movimiento-cat-1-tx-${i}`)).toBeTruthy();
    }

    // Text changes to 'Ver menos' and accessibilityState.expanded becomes true
    expect(screen.getByText('Ver menos')).toBeTruthy();
    const toggle = screen.getByTestId('grupo-toggle-cat-1');
    expect(toggle.props.accessibilityState?.expanded).toBe(true);
  });

  it('group with ≤10 rows shows no "Ver N más" toggle', async () => {
    // Exactly at the threshold: the boundary case that pins `>` and not `>=`.
    const grupo = makeGrupo('cat-2', 'Comida', 10);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // All 10 rows visible
    for (let i = 1; i <= 10; i++) {
      expect(screen.getByTestId(`movimiento-cat-2-tx-${i}`)).toBeTruthy();
    }

    // No toggle at all
    expect(screen.queryByTestId('grupo-toggle-cat-2')).toBeNull();
    expect(screen.queryByText(/Ver \d+ más/)).toBeNull();
  });

  it('SinCategoria group root always carries testID="grupo-movimientos-sin-categoria"', async () => {
    const grupo = makeGrupo(null, 'Sin categoría', 1);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // Root always has the stable testID regardless of destacar
    expect(screen.getByTestId('grupo-movimientos-sin-categoria')).toBeTruthy();
  });

  it('inner testID="grupo-sin-categoria-destacado" is present inside SinCategoria root ONLY when destacar="sin-categoria"', async () => {
    const grupo = makeGrupo(null, 'Sin categoría', 1);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar="sin-categoria"
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // Root stable testID always present
    expect(screen.getByTestId('grupo-movimientos-sin-categoria')).toBeTruthy();
    // Inner destacado wrapper present when destacar is active
    expect(screen.getByTestId('grupo-sin-categoria-destacado')).toBeTruthy();
  });

  it('no element with testID="grupo-sin-categoria-destacado" when destacar is absent', async () => {
    const grupo = makeGrupo(null, 'Sin categoría', 1);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // Root stable testID still present
    expect(screen.getByTestId('grupo-movimientos-sin-categoria')).toBeTruthy();
    // Inner destacado wrapper MUST NOT exist when destacar is not active
    expect(screen.queryByTestId('grupo-sin-categoria-destacado')).toBeNull();
  });

  it("renders the header icon badge with the group's icono and bucket (categoria-iconografia, MDET-03)", async () => {
    const grupo = makeGrupo('cat-1', 'Supermercado', 1, 'shopping-cart');

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Necesidades"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    expect(mockIconoCategoriaBadge).toHaveBeenCalledTimes(1);
    expect(mockIconoCategoriaBadge.mock.calls[0][0]).toMatchObject({
      icono: 'shopping-cart',
      bucket: 'Necesidades',
    });
  });

  it("the SinCategoria group header always passes a null icono to the badge — the fallback is the badge's own job (CATICO-06, MBD-02)", async () => {
    const grupo = makeGrupo(null, 'Sin categoría', 1);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    expect(mockIconoCategoriaBadge).toHaveBeenCalledTimes(1);
    expect(mockIconoCategoriaBadge.mock.calls[0][0]).toMatchObject({
      icono: null,
      bucket: 'Deseos',
    });
  });
});
