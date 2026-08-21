/**
 * BucketDetalleScreen spec — T-10 RED (US-056, D-12/D-20/MDET-01/MDET-02/MDET-05)
 *
 * All cases MUST fail RED before the production source exists (T-10 RED contract).
 * Production source lands in T-12.
 */

import { render, screen, waitFor, within } from '@testing-library/react-native';
import type { ApiResult } from '../../api/client';
import type { DetalleBucketMesDto } from '../../domain/detalle.types';

// SelectorPeriodoMes renders period arrows — keep real module to get the label
// (no need to mock — it has no side effects and depends only on pure domain helpers)

import { BucketDetalleScreen } from './BucketDetalleScreen';

// Mock the fetcher at the module boundary
const mockFetchDetalleBucketMes = jest.fn<
  Promise<ApiResult<DetalleBucketMesDto>>,
  [string, string?]
>();

jest.mock('../../api/client', () => ({
  ...jest.requireActual('../../api/client'),
  fetchDetalleBucketMes: (bucket: string, periodo?: string) =>
    mockFetchDetalleBucketMes(bucket, periodo),
}));

// Minimal valid DetalleBucketMesDto that satisfies the real esDetalleBucketMesDto guard
function makeDto(
  overrides: Partial<DetalleBucketMesDto> = {},
): DetalleBucketMesDto {
  return {
    bucket: 'Deseos',
    periodo: '2026-07',
    total: '150000',
    totalTransacciones: 3,
    totalCategorias: 1,
    porcentajeBp: 2500,
    metaBp: 3000,
    grupos: [
      {
        categoriaId: 'cat-1',
        nombre: 'Entretenimiento',
        conteo: 3,
        subtotal: '150000',
        transacciones: [
          {
            id: 'tx-1',
            descripcion: 'Netflix',
            fecha: '2026-07-01',
            monto: '50000',
          },
          {
            id: 'tx-2',
            descripcion: 'Spotify',
            fecha: '2026-07-05',
            monto: '50000',
          },
          {
            id: 'tx-3',
            descripcion: 'Cinema',
            fecha: '2026-07-10',
            monto: '50000',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeDtoSinMeta(): DetalleBucketMesDto {
  return makeDto({ metaBp: null });
}

function makeDtoSinPorcentaje(): DetalleBucketMesDto {
  return makeDto({ porcentajeBp: null });
}

describe('BucketDetalleScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading indicator and no content while fetchDetalleBucketMes is in flight', async () => {
    // Never resolves — keeps loading state
    mockFetchDetalleBucketMes.mockReturnValue(new Promise(() => {}));

    await render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    // Loading indicator must be visible
    expect(screen.getByTestId('bucket-detalle-loading')).toBeTruthy();
    // No group content or error copy while loading
    expect(screen.queryByTestId('bucket-detalle-grupos')).toBeNull();
    expect(screen.queryByTestId('bucket-detalle-error')).toBeNull();
  });

  it('shows error copy and no stale data on failure', async () => {
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'network' },
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bucket-detalle-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('bucket-detalle-grupos')).toBeNull();
    expect(screen.queryByTestId('bucket-detalle-loading')).toBeNull();
  });

  it('shows empty-state message when grupos.length === 0 (derived from data tag, NOT a fourth state tag)', async () => {
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: true,
      value: makeDto({ grupos: [] }),
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bucket-detalle-vacio')).toBeTruthy();
    });
    expect(screen.queryByTestId('bucket-detalle-error')).toBeNull();
  });

  it('renders M1 header and group list when data has groups', async () => {
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: true,
      value: makeDto(),
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bucket-detalle-grupos')).toBeTruthy();
    });
    // Header present
    expect(screen.getByTestId('bucket-detalle-header')).toBeTruthy();
  });

  it('header shows ETIQUETA_BUCKET display label, not raw key (Deseos → "Gustos")', async () => {
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: true,
      value: makeDto({ bucket: 'Deseos' }),
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      // Display label is 'Gustos', not raw wire key 'Deseos'
      expect(screen.getByText('Gustos')).toBeTruthy();
    });
    // Raw key must NOT appear as a heading
    expect(screen.queryByText('Deseos')).toBeNull();
  });

  it('sinMeta bucket shows "Sin meta" text not "null" or "%"', async () => {
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: true,
      value: makeDtoSinMeta(),
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Sin meta')).toBeTruthy();
    });
    expect(screen.queryByText('null')).toBeNull();
    // '%' could appear in other labels; assert specifically no 'null' text
  });

  it('sinPorcentaje bucket shows "—" not "0%"', async () => {
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: true,
      value: makeDtoSinPorcentaje(),
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      // '—' is the SIN_PORCENTAJE_LABEL sentinel
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
    // Must NOT render '0%' for the porcentaje field
    expect(screen.queryByText('0%')).toBeNull();
  });

  /**
   * Case A: status-reclasificar region is a stable sibling OUTSIDE every group element (ancestry assertion).
   *
   * The full moved-row content-survival scenario (announce + refetch removes row + text persists)
   * is exercised in PR4 (T-13/T-15) when the real reclassify trigger exists.
   */
  it('status-reclasificar region is a stable sibling OUTSIDE every group element (ancestry assertion)', async () => {
    // Render data state with 2 groups including a SinCategoria group so both
    // grupo-movimientos-cat-1 and grupo-movimientos-sin-categoria testIDs are present.
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: true,
      value: makeDto({
        grupos: [
          {
            categoriaId: 'cat-1',
            nombre: 'Entretenimiento',
            conteo: 1,
            subtotal: '50000',
            transacciones: [
              {
                id: 'tx-1',
                descripcion: 'Netflix',
                fecha: '2026-07-01',
                monto: '50000',
              },
            ],
          },
          {
            categoriaId: null,
            nombre: 'Sin categoría',
            conteo: 1,
            subtotal: '20000',
            transacciones: [
              {
                id: 'tx-2',
                descripcion: 'Desconocido',
                fecha: '2026-07-02',
                monto: '20000',
              },
            ],
          },
        ],
      }),
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bucket-detalle-grupos')).toBeTruthy();
    });

    const statusRegion = screen.getByTestId('status-reclasificar');
    expect(statusRegion).toBeTruthy();

    // The region must NOT be a descendant of any group element.
    // `within(group).queryByTestId('status-reclasificar')` returns null iff the
    // region is outside the group's subtree (idiomatic RNTL ancestry check).
    const group1 = screen.getByTestId('grupo-movimientos-cat-1');
    const groupSin = screen.getByTestId('grupo-movimientos-sin-categoria');

    expect(within(group1).queryByTestId('status-reclasificar')).toBeNull();
    expect(within(groupSin).queryByTestId('status-reclasificar')).toBeNull();
  });

  /**
   * Case B: status-reclasificar region exists even when grupos is empty.
   * Proves the region is independent of the groups list — rendered outside/above it.
   */
  it('status-reclasificar region is present when grupos is empty (independent of group list)', async () => {
    mockFetchDetalleBucketMes.mockResolvedValueOnce({
      ok: true,
      value: makeDto({ grupos: [] }),
    });

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bucket-detalle-vacio')).toBeTruthy();
    });

    // Region must survive even with zero groups
    expect(screen.getByTestId('status-reclasificar')).toBeTruthy();
  });
});
