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

// Mock ReclasificarMobileControl — this spec tests accordion/destacado, not reclassify.
// The real control is tested in ReclasificarMobileControl.spec.tsx.
jest.mock('./ReclasificarMobileControl', () => ({
  ReclasificarMobileControl: () => null,
}));

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
): GrupoDetalleBucketMesDto {
  return {
    categoriaId,
    nombre,
    conteo: txCount,
    subtotal: String(txCount * 10000),
    transacciones: Array.from({ length: txCount }, (_, i) =>
      makeTx(`${categoriaId ?? 'sin'}-tx-${i + 1}`),
    ),
  };
}

describe('GrupoMovimientosMobile', () => {
  it('group with 5 rows shows exactly 3 rows and "Ver 2 más" collapsed (accessibilityState.expanded false)', async () => {
    const grupo = makeGrupo('cat-1', 'Entretenimiento', 5);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // Exactly 3 rows visible (first 3)
    expect(screen.getByTestId('movimiento-cat-1-tx-1')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-1-tx-2')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-1-tx-3')).toBeTruthy();
    // 4th and 5th not visible
    expect(screen.queryByTestId('movimiento-cat-1-tx-4')).toBeNull();
    expect(screen.queryByTestId('movimiento-cat-1-tx-5')).toBeNull();

    // Toggle shows 'Ver 2 más'
    const toggle = screen.getByTestId('grupo-toggle-cat-1');
    expect(toggle).toBeTruthy();
    expect(screen.getByText('Ver 2 más')).toBeTruthy();
    // accessibilityState.expanded must be false when collapsed
    expect(toggle.props.accessibilityState?.expanded).toBe(false);
  });

  it('pressing "Ver N más" reveals all 5 rows and changes text to "Ver menos" (accessibilityState.expanded true)', async () => {
    const grupo = makeGrupo('cat-1', 'Entretenimiento', 5);

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

    // All 5 rows now visible
    expect(screen.getByTestId('movimiento-cat-1-tx-1')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-1-tx-2')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-1-tx-3')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-1-tx-4')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-1-tx-5')).toBeTruthy();

    // Text changes to 'Ver menos' and accessibilityState.expanded becomes true
    expect(screen.getByText('Ver menos')).toBeTruthy();
    const toggle = screen.getByTestId('grupo-toggle-cat-1');
    expect(toggle.props.accessibilityState?.expanded).toBe(true);
  });

  it('group with ≤3 rows shows no "Ver N más" toggle', async () => {
    const grupo = makeGrupo('cat-2', 'Comida', 3);

    await render(
      <GrupoMovimientosMobile
        grupo={grupo}
        bucket="Deseos"
        destacar={undefined}
        onReclasificado={jest.fn()}
        onMovida={jest.fn()}
      />,
    );

    // All 3 rows visible
    expect(screen.getByTestId('movimiento-cat-2-tx-1')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-2-tx-2')).toBeTruthy();
    expect(screen.getByTestId('movimiento-cat-2-tx-3')).toBeTruthy();

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
});
