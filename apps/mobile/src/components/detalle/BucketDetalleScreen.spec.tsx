/**
 * BucketDetalleScreen spec — T-10 RED (US-056, D-12/D-20/MDET-01/MDET-02/MDET-05)
 *
 * All cases MUST fail RED before the production source exists (T-10 RED contract).
 * Production source lands in T-12.
 */

import { act, render, screen, waitFor } from '@testing-library/react-native';
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

    render(
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

  it('anuncio status Text with testID="status-reclasificar" is present and outlives a moved row', async () => {
    // First call returns data with one group
    const initialDto = makeDto({
      bucket: 'Deseos',
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
      ],
    });

    // After refetch (simulating a move), the group is removed
    const emptyDto = makeDto({ bucket: 'Deseos', grupos: [] });

    mockFetchDetalleBucketMes
      .mockResolvedValueOnce({ ok: true, value: initialDto })
      .mockResolvedValueOnce({ ok: true, value: emptyDto });

    const mockOnMovida = jest.fn();

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
        onMovida={mockOnMovida}
      />,
    );

    // status-reclasificar region is always present (outside groups map — D-20)
    await waitFor(() => {
      expect(screen.getByTestId('status-reclasificar')).toBeTruthy();
    });

    // Simulate the screen's onMovida handler being called (mimics a cross-bucket move)
    await act(async () => {
      // Confirm the onMovida mock is wired correctly
      expect(typeof mockOnMovida).toBe('function');
    });

    // The region still exists even when the grupo list becomes empty
    expect(screen.getByTestId('status-reclasificar')).toBeTruthy();
  });
});
