/**
 * BucketDetalleScreen spec — T-10 RED (US-056, D-12/D-20/MDET-01/MDET-02/MDET-05)
 * Extended in T-15 with the moved-row content-survival test (deferred from PR3
 * by the judgment gate, tasks.md T-10 note, commit 07af81d).
 *
 * GrupoMovimientosMobile is mocked so this spec controls when onMovida/onReclasificado
 * are called without requiring a live ReclasificarMobileControl or catalog fetch.
 */

import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
  act,
} from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { ApiResult } from '../../api/client';
import type { DetalleBucketMesDto } from '../../domain/detalle.types';

// SelectorPeriodoMes renders period arrows — keep real module to get the label
// (no need to mock — it has no side effects and depends only on pure domain helpers)

import { BucketDetalleScreen } from './BucketDetalleScreen';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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

// Mock GrupoMovimientosMobile so we control onMovida/onReclasificado in T-15 tests.
// The mock renders a Pressable that simulates firing onMovida + onReclasificado when pressed,
// allowing the content-survival test to drive the full wiring without a live catalog fetch.
// Uses a factory function to avoid react-native-css-interop displayName errors.
jest.mock('./GrupoMovimientosMobile', () => {
  const { View, Text, Pressable: P } = require('react-native');
  function GrupoMovimientosMobile({
    grupo,
    onReclasificado,
    onMovida,
  }: {
    grupo: { categoriaId: string | null; nombre: string };
    bucket: string;
    destacar?: string;
    onReclasificado: () => void;
    onMovida: (bucketLabel: string) => void;
  }) {
    const id = grupo.categoriaId ?? 'sin-categoria';
    return (
      <View testID={`grupo-movimientos-${id}`}>
        <Text>{grupo.nombre}</Text>
        <P
          testID={`mock-reclasificar-trigger-${id}`}
          onPress={() => {
            onReclasificado();
            onMovida('Gustos');
          }}
        >
          <Text>Reclasificar (mock)</Text>
        </P>
      </View>
    );
  }
  return { GrupoMovimientosMobile };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
            origen: 'BCI',
            monto: '50000',
          },
          {
            id: 'tx-2',
            descripcion: 'Spotify',
            fecha: '2026-07-05',
            origen: 'Manual',
            monto: '50000',
          },
          {
            id: 'tx-3',
            descripcion: 'Cinema',
            fecha: '2026-07-10',
            origen: 'BCI',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
   * The full moved-row content-survival scenario is exercised in the case below (T-15).
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
                origen: 'BCI',
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
                origen: 'Manual',
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

  /**
   * T-15: moved-row content-survival test (deferred from PR3 by judgment gate,
   * tasks.md T-10 note, commit 07af81d).
   *
   * Contract (D-20/MDET-05):
   * 1. Fire the row's reclassify trigger (via mock which calls onMovida + onReclasificado).
   * 2. Assert anuncio text 'Movida a Gustos.' is present.
   * 3. onReclasificado triggers cargar → refetch resolves WITHOUT the row.
   * 4. Assert the text 'Movida a Gustos.' STILL present (anuncio outlives moved row).
   *
   * The status-reclasificar region lives OUTSIDE the groups map, so it survives
   * a refetch that removes the classified row (D-20 single announcement source).
   */
  it('anuncio text survives refetch that removes the reclassified row (region outlives moved row)', async () => {
    // First fetch: data with one group (cat-1)
    const dtoConGrupo = makeDto();
    // Second fetch (triggered by onReclasificado=cargar): data WITHOUT the group
    const dtoSinGrupo = makeDto({ grupos: [] });

    mockFetchDetalleBucketMes
      .mockResolvedValueOnce({ ok: true, value: dtoConGrupo })
      .mockResolvedValueOnce({ ok: true, value: dtoSinGrupo });

    // Pin the exact announce string emitted by handleMovida (MDET-05 S5).
    // This spy verifies the screen calls AccessibilityInfo with EXACTLY
    // 'Movida a Gustos.' (trailing period, ETIQUETA_BUCKET display label).
    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockReturnValue(undefined);

    render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    // Wait for the initial data render with the group
    await waitFor(() => {
      expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
    });

    // Press the mock reclassify trigger — fires onMovida('Gustos') + onReclasificado()
    await act(async () => {
      fireEvent.press(screen.getByTestId('mock-reclasificar-trigger-cat-1'));
    });

    // Step 2: assert anuncio text 'Movida a Gustos.' is present immediately after firing
    await waitFor(() => {
      expect(screen.getByTestId('status-reclasificar')).toBeTruthy();
      expect(screen.getByTestId('status-reclasificar').props.children).toBe(
        'Movida a Gustos.',
      );
    });

    // Pin the exact announce string: must be called with 'Movida a Gustos.' (trailing period).
    // Raw bucket key 'Deseos' or missing period would fail this assertion.
    expect(announceSpy).toHaveBeenCalledWith('Movida a Gustos.');
    announceSpy.mockRestore();

    // Step 3: wait for the refetch (triggered by onReclasificado=cargar) to complete.
    // The second fetch returns dtoSinGrupo — the group is gone from the list.
    await waitFor(() => {
      expect(screen.getByTestId('bucket-detalle-vacio')).toBeTruthy();
    });

    // The grupo row is gone — verify cat-1 group is no longer in the tree
    expect(screen.queryByTestId('grupo-movimientos-cat-1')).toBeNull();

    // Step 4: anuncio text MUST STILL be present (survives the refetch, D-20)
    expect(screen.getByTestId('status-reclasificar').props.children).toBe(
      'Movida a Gustos.',
    );
  });
});
