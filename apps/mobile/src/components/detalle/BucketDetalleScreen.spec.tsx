/**
 * BucketDetalleScreen spec — T-10 RED (US-056, D-12/D-20/MDET-01/MDET-02/MDET-05)
 * Extended in T-15 with the moved-row content-survival test (deferred from PR3
 * by the judgment gate, tasks.md T-10 note, commit 07af81d).
 *
 * GrupoMovimientosMobile is mocked so this spec controls when onMovida/onReclasificado
 * are called without requiring a live ReclasificarMobileControl or catalog fetch.
 *
 * **`await render(...)` es OBLIGATORIO en cada test de este archivo. No lo
 * quites** (#724).
 *
 * `render` de RNTL no devuelve una promesa, así que el `await` parece
 * decorativo y se lo quita "limpiando". No lo es: cede un tick del event
 * loop, y sin él el `screen` global todavía no tiene el árbol montado cuando
 * la siguiente línea lo consulta. El síntoma es
 * `` `render` function has not been called ``, que suena a que nadie
 * renderizó y en realidad significa "todavía no".
 *
 * Medido, no supuesto: quitando el `await` de UN solo render, el test de
 * loading falla 3 de 3 corridas AISLADAS. Con `await`, 10 de 10 tests pasan.
 *
 * Los tests que siguen el render con `await waitFor(...)` sobrevivían sin el
 * `await` porque `waitFor` les regalaba ese tick — hasta que la carga de los
 * workers en paralelo los adelantaba. De ahí el flake intermitente de #724
 * (`shows empty-state message`, 1 fallo en 9 corridas de la suite completa).
 *
 * Efecto medible del arreglo: los `console.error` de React
 * `The current testing environment is not configured to support act(...)`
 * atribuibles a `BucketDetalleScreen.tsx` bajaron de 43 a 8 en una corrida
 * de la suite.
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
import * as categoriasApi from '../../api/categorias';
import type { ApiResult } from '../../api/client';
import type { DetalleBucketMesDto } from '../../domain/detalle.types';

// SelectorPeriodoMes renders period arrows — keep real module to get the label
// (no need to mock — it has no side effects and depends only on pure domain helpers)

import { BucketDetalleScreen } from './BucketDetalleScreen';

// agregar-categoria-desde-bucket (issue #743): `AgregarCategoriaControl`
// mounts the REAL `NuevaCategoriaForm`, which calls `crearCategoria` — mock
// it at the module boundary (`NuevaCategoriaForm.spec.tsx` precedent) so
// these screen-level tests control the outcome without a live request.
// patrón-desde-movimiento (issue #745): `OfrecerPatronMobileControl` (real,
// mounted by the screen itself — never mocked) calls `crearPatron` — mock
// it at the SAME module boundary as `crearCategoria` above.
jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearCategoria: jest.fn(),
  crearPatron: jest.fn(),
}));

const mockCrearCategoria = categoriasApi.crearCategoria as jest.MockedFunction<
  typeof categoriasApi.crearCategoria
>;
const mockCrearPatron = categoriasApi.crearPatron as jest.MockedFunction<
  typeof categoriasApi.crearPatron
>;

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
//
// `contadorMontajes`/`instanciaId` (agregar-categoria-desde-bucket, issue
// #743): a `useRef` seeded once per MOUNT (never per re-render) — this is
// how the "AgregarCategoriaControl integration" describe block below proves
// `BucketDetalleScreen` does NOT remount this subtree after a categoría is
// created (a `key`-based remount was tried first and reverted: it also
// reset `GrupoMovimientosMobile`'s own `expandido` accordion state, which
// is why the "expanded group" describe block further below exists — catalog
// freshness now comes from a `categoriaVersion` PROP threaded down to
// `ReclasificarMobileControl`, proven separately in that component's own
// spec file, not from remounting anything here).
jest.mock('./GrupoMovimientosMobile', () => {
  const { useRef } = require('react');
  const { View, Text, Pressable: P } = require('react-native');
  let contadorMontajes = 0;
  function GrupoMovimientosMobile({
    grupo,
    onReclasificado,
    onMovida,
    onOfrecerPatron,
  }: {
    grupo: { categoriaId: string | null; nombre: string };
    bucket: string;
    destacar?: string;
    onReclasificado: () => void;
    onMovida: (bucketLabel: string) => void;
    onOfrecerPatron: (info: {
      descripcion: string;
      categoriaId: string;
    }) => void;
  }) {
    const id = grupo.categoriaId ?? 'sin-categoria';
    const instanciaId = useRef(++contadorMontajes).current;
    return (
      <View testID={`grupo-movimientos-${id}`}>
        <Text>{grupo.nombre}</Text>
        <Text testID={`grupo-instancia-${id}`}>{instanciaId}</Text>
        <P
          testID={`mock-reclasificar-trigger-${id}`}
          onPress={() => {
            onReclasificado();
            onMovida('Gustos');
          }}
        >
          <Text>Reclasificar (mock)</Text>
        </P>
        {/* confirmacion-reclasificar (issue #749): simulates the SAME-bucket
            path, where ReclasificarMobileControl now calls onMovida with the
            destination CATEGORÍA name instead of a bucket label. */}
        <P
          testID={`mock-reclasificar-trigger-samebucket-${id}`}
          onPress={() => {
            onReclasificado();
            onMovida('Supermercado');
          }}
        >
          <Text>Reclasificar mismo bucket (mock)</Text>
        </P>
        {/* patrón-desde-movimiento (issue #745): simulates
            ReclasificarMobileControl's real `commit()` — onReclasificado
            (reload) and onOfrecerPatron fire in the SAME synchronous tick,
            exactly like the real control does. */}
        <P
          testID={`mock-ofrecer-patron-trigger-${id}`}
          onPress={() => {
            onReclasificado();
            onOfrecerPatron({ descripcion: 'Netflix', categoriaId: id });
          }}
        >
          <Text>Reclasificar y ofrecer patrón (mock)</Text>
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
    mockFetchDetalleBucketMes.mockReturnValueOnce(new Promise(() => {}));

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

    await render(
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

    await render(
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

    await render(
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

    await render(
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

    await render(
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

    await render(
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

    await render(
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

    await render(
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

    await render(
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

  /**
   * confirmacion-reclasificar (issue #749): a same-bucket reclassify reuses
   * the EXACT SAME `status-reclasificar` region and
   * `AccessibilityInfo.announceForAccessibility` mechanism as the
   * cross-bucket case — `handleMovida` is generic over whatever label it
   * receives, so a categoría name renders/announces identically to a bucket
   * label.
   */
  it('reuses the same status-reclasificar region and announcement mechanism for a same-bucket reclassify, rendering the categoría name', async () => {
    const dtoConGrupo = makeDto();
    // Two resolves queued: the initial mount fetch, plus the refetch fired
    // by onReclasificado when the mock trigger is pressed below (T-15
    // precedent above — the press fires onReclasificado + onMovida).
    mockFetchDetalleBucketMes
      .mockResolvedValueOnce({ ok: true, value: dtoConGrupo })
      .mockResolvedValueOnce({ ok: true, value: dtoConGrupo });

    const announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockReturnValue(undefined);

    await render(
      <BucketDetalleScreen
        bucket="Deseos"
        destacar={undefined}
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('mock-reclasificar-trigger-samebucket-cat-1'),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('status-reclasificar').props.children).toBe(
        'Movida a Supermercado.',
      );
    });
    expect(announceSpy).toHaveBeenCalledWith('Movida a Supermercado.');
    announceSpy.mockRestore();
  });

  // ── AgregarCategoriaControl integration (agregar-categoria-desde-bucket, issue #743) ──
  describe('AgregarCategoriaControl integration (issue #743)', () => {
    it('renders the "Agregar categoría" trigger for an assignable bucket (Deseos)', async () => {
      mockFetchDetalleBucketMes.mockResolvedValueOnce({
        ok: true,
        value: makeDto(),
      });

      await render(
        <BucketDetalleScreen
          bucket="Deseos"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Agregar categoría' }),
        ).toBeOnTheScreen();
      });
    });

    it('does NOT render the trigger on the SinCategoria bucket detail screen (not assignable)', async () => {
      mockFetchDetalleBucketMes.mockResolvedValueOnce({
        ok: true,
        value: makeDto({ bucket: 'SinCategoria' }),
      });

      await render(
        <BucketDetalleScreen
          bucket="SinCategoria"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('bucket-detalle-header')).toBeTruthy();
      });
      expect(
        screen.queryByRole('button', { name: 'Agregar categoría' }),
      ).toBeNull();
    });

    it('creating a category closes the form, announces success via the shared status region, and does NOT remount the groups subtree (reverted key-remount regression)', async () => {
      mockFetchDetalleBucketMes.mockResolvedValueOnce({
        ok: true,
        value: makeDto(),
      });
      mockCrearCategoria.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'cat-fake',
          nombre: 'Fake',
          bucket: 'Necesidades',
          transaccionesCount: 0,
          patrones: [],
        },
      });
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockReturnValue(undefined);

      await render(
        <BucketDetalleScreen
          bucket="Deseos"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
      });
      const instanciaAntes = screen.getByTestId('grupo-instancia-cat-1').props
        .children;

      await act(async () => {
        fireEvent.press(
          screen.getByRole('button', { name: 'Agregar categoría' }),
        );
      });
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Nombre'), 'Streaming');
      });
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(mockCrearCategoria).toHaveBeenCalledWith({
          nombre: 'Streaming',
          bucket: 'Deseos',
        });
      });

      // The form closed on success.
      await waitFor(() => {
        expect(screen.queryByLabelText('Nombre')).toBeNull();
      });
      expect(screen.getByTestId('status-reclasificar').props.children).toBe(
        'Categoría creada.',
      );
      expect(announceSpy).toHaveBeenCalledWith('Categoría creada.');
      announceSpy.mockRestore();

      // The groups subtree must NOT have remounted (issue #743 rework): a
      // `key`-based remount was tried first and reverted because it also
      // reset `GrupoMovimientosMobile`'s own `expandido` accordion state,
      // collapsing every expanded group on every categoría creation. The
      // SAME mount instance id proves this subtree stayed mounted; catalog
      // freshness is now proven separately in `ReclasificarMobileControl.
      // spec.tsx` (a `categoriaVersion` prop change) and expanded-state
      // survival in this file's own "expanded group" describe block below.
      const instanciaDespues = screen.getByTestId('grupo-instancia-cat-1').props
        .children;
      expect(instanciaDespues).toBe(instanciaAntes);
    });
  });

  /**
   * patrón-desde-movimiento (issue #745). `OfrecerPatronMobileControl` is
   * the REAL component here (never mocked) — only `GrupoMovimientosMobile`
   * is mocked (module-level, see above), so these tests exercise the
   * screen's OWN state (`ofrecerPatron`) and the real offer/picker/mutation
   * chain underneath it.
   *
   * The critical case is "survives the reload" (issue #762 interaction):
   * `ReclasificarMobileControl.commit()` fires `onReclasificado` (→
   * `cargar()` → `fase: 'loading'`, which unmounts the ENTIRE groups
   * subtree) and `onOfrecerPatron` in the SAME synchronous tick. If the
   * offer's own state lived inside the (about-to-unmount) reclassify
   * control or the groups subtree, it would never be visible — this is
   * exactly the failure mode issue #762 already causes for `expandido`.
   * `BucketDetalleScreen` avoids it by keeping `ofrecerPatron` as its OWN
   * state and rendering the offer OUTSIDE the fase-conditional groups tree
   * (same discipline as `anuncio`/`statusRegion`), so it is part of the
   * SAME render that flips to `fase: 'loading'` instead of depending on
   * that subtree surviving.
   */
  describe('OfrecerPatronMobileControl integration (issue #745)', () => {
    it('a successful reclassify offers to create a pattern for the destination categoría', async () => {
      mockFetchDetalleBucketMes.mockResolvedValue({
        ok: true,
        value: makeDto(),
      });

      await render(
        <BucketDetalleScreen
          bucket="Deseos"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(
          screen.getByTestId('mock-ofrecer-patron-trigger-cat-1'),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('ofrecer-patron')).toBeTruthy();
      });
      expect(
        screen.getByText(
          '¿Reconocer automáticamente este movimiento en tus próximas cartolas?',
        ),
      ).toBeTruthy();
    });

    it('MUTATION-PROVEN: the offer survives the fase transition to "loading" that onReclasificado triggers (issue #762 interaction), and is still there once data reloads', async () => {
      let resolverSegundaCarga: (
        value: ApiResult<DetalleBucketMesDto>,
      ) => void = () => {};
      const segundaCarga = new Promise<ApiResult<DetalleBucketMesDto>>(
        (resolve) => {
          resolverSegundaCarga = resolve;
        },
      );
      mockFetchDetalleBucketMes
        .mockResolvedValueOnce({ ok: true, value: makeDto() })
        .mockReturnValueOnce(segundaCarga);

      await render(
        <BucketDetalleScreen
          bucket="Deseos"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(
          screen.getByTestId('mock-ofrecer-patron-trigger-cat-1'),
        );
      });

      // The reload IS in flight: the loading branch replaced the groups
      // tree (bucket-detalle-grupos is gone) — this is issue #762 firing.
      await waitFor(() => {
        expect(screen.getByTestId('bucket-detalle-loading')).toBeTruthy();
      });
      expect(screen.queryByTestId('bucket-detalle-grupos')).toBeNull();
      // The offer must be visible ANYWAY — it does not live in that subtree.
      expect(screen.getByTestId('ofrecer-patron')).toBeTruthy();

      // Let the refetch resolve.
      await act(async () => {
        resolverSegundaCarga({ ok: true, value: makeDto() });
      });

      await waitFor(() => {
        expect(screen.getByTestId('bucket-detalle-grupos')).toBeTruthy();
      });
      // Still there after the reload settles — same offer, not recreated
      // from scratch by a remount that happened to line up.
      expect(screen.getByTestId('ofrecer-patron')).toBeTruthy();
    });

    it('"Ahora no" dismisses the offer without creating a pattern', async () => {
      mockFetchDetalleBucketMes.mockResolvedValue({
        ok: true,
        value: makeDto(),
      });

      await render(
        <BucketDetalleScreen
          bucket="Deseos"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(
          screen.getByTestId('mock-ofrecer-patron-trigger-cat-1'),
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId('ofrecer-patron')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
      });

      expect(screen.queryByTestId('ofrecer-patron')).toBeNull();
      expect(mockCrearPatron).not.toHaveBeenCalled();
    });

    it('confirming a pattern posts crearPatron, dismisses the offer, and announces success through the shared status region', async () => {
      mockFetchDetalleBucketMes.mockResolvedValue({
        ok: true,
        value: makeDto(),
      });
      mockCrearPatron.mockResolvedValue({ ok: true, value: undefined });
      const announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockReturnValue(undefined);

      await render(
        <BucketDetalleScreen
          bucket="Deseos"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(
          screen.getByTestId('mock-ofrecer-patron-trigger-cat-1'),
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId('ofrecer-patron')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Crear patrón' }));
      });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Netflix' }));
      });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
      });

      await waitFor(() => {
        expect(mockCrearPatron).toHaveBeenCalledWith({
          categoriaId: 'cat-1',
          patron: 'Netflix',
          matchType: 'CONTAINS',
        });
      });
      await waitFor(() => {
        expect(screen.getByTestId('status-reclasificar').props.children).toBe(
          'Patrón «Netflix» creado. Se usará en tus próximas importaciones.',
        );
      });
      expect(announceSpy).toHaveBeenCalledWith(
        'Patrón «Netflix» creado. Se usará en tus próximas importaciones.',
      );
      expect(screen.queryByTestId('ofrecer-patron')).toBeNull();
      announceSpy.mockRestore();
    });

    it('a failed pattern creation shows the inline error, keeps the offer mounted, and never undoes the reclassify announcement', async () => {
      mockFetchDetalleBucketMes.mockResolvedValue({
        ok: true,
        value: makeDto(),
      });
      mockCrearPatron.mockResolvedValue({
        ok: false,
        error: { tag: 'http', status: 409, code: 'PATRON_DUPLICADO' },
      });

      await render(
        <BucketDetalleScreen
          bucket="Deseos"
          onChangePeriodo={jest.fn()}
          onBack={jest.fn()}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('grupo-movimientos-cat-1')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('mock-reclasificar-trigger-cat-1'));
      });
      await waitFor(() => {
        expect(screen.getByTestId('status-reclasificar').props.children).toBe(
          'Movida a Gustos.',
        );
      });

      await act(async () => {
        fireEvent.press(
          screen.getByTestId('mock-ofrecer-patron-trigger-cat-1'),
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId('ofrecer-patron')).toBeTruthy();
      });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Crear patrón' }));
      });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Netflix' }));
      });
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
      });

      await waitFor(() => {
        expect(
          screen.getByText('Ya tienes un patrón con ese texto.'),
        ).toBeTruthy();
      });
      // The offer stays mounted (retry-able) and the reclassify's own
      // announcement is untouched — a failed pattern never rewrites it.
      expect(screen.getByTestId('ofrecer-patron')).toBeTruthy();
      expect(screen.getByTestId('status-reclasificar').props.children).toBe(
        'Movida a Gustos.',
      );
    });
  });
});
