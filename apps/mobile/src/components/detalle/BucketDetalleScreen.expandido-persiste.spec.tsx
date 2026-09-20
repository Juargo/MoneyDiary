/**
 * BucketDetalleScreen — expanded-group persistence across categoría
 * creation (agregar-categoria-desde-bucket, issue #743, review rework) AND
 * across a reclassify (reclasificar-sin-colapsar-grupos, issue #762).
 *
 * Deliberately does NOT mock `./GrupoMovimientosMobile` (unlike
 * `BucketDetalleScreen.spec.tsx`) — this file needs the REAL component
 * mounted so its own `expandido` `useState` (GrupoMovimientosMobile.tsx)
 * is the thing under test. A `key`-based remount of the groups container
 * was tried first and reverted: it also reset this exact state, collapsing
 * every already-expanded group the instant a categoría was created — the
 * realistic flow this issue exists to smooth is "expand a group to
 * reclassify a movement, discover the categoría doesn't exist, create it
 * from this screen, keep your place". This file proves that flow.
 *
 * The issue #762 describe block below extends the same technique to a REAL
 * `ReclasificarMobileControl` (also never mocked): a mock of that control
 * cannot see the bug at all, because the bug is specifically that
 * `BucketDetalleScreen.cargar()` (the pre-fix `onReclasificado`) sets
 * `fase: 'loading'`, which unmounts the ENTIRE groups subtree — a mocked
 * control that merely calls `onReclasificado()` as a prop never exercises
 * that unmount/remount cycle realistically enough to catch a stale `key`
 * or an accidental full remount hiding behind it.
 */
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  within,
} from '@testing-library/react-native';
import * as categoriasApi from '../../api/categorias';
import type { ApiResult } from '../../api/client';
import type { CatalogoDto } from '../../domain/catalogo.types';
import type {
  DetalleBucketMesDto,
  ReclasificarCategoriaDto,
} from '../../domain/detalle.types';
import { BucketDetalleScreen } from './BucketDetalleScreen';

const mockFetchDetalleBucketMes = jest.fn<
  Promise<ApiResult<DetalleBucketMesDto>>,
  [string, string?]
>();

jest.mock('../../api/client', () => ({
  ...jest.requireActual('../../api/client'),
  fetchDetalleBucketMes: (bucket: string, periodo?: string) =>
    mockFetchDetalleBucketMes(bucket, periodo),
}));

// AgregarCategoriaControl mounts the REAL NuevaCategoriaForm, which calls
// crearCategoria — mock only that mutation (NuevaCategoriaForm.spec.tsx
// precedent). The issue #762 describe block below ALSO opens a real
// ReclasificarMobileControl, so reclasificarCategoria/fetchCatalogo need
// mocking too (ReclasificarMobileControl.spec.tsx precedent) — the issue
// #743 describe block above never opens that modal, so those two mocks are
// simply unexercised there.
const mockReclasificarCategoria = jest.fn<
  Promise<ApiResult<ReclasificarCategoriaDto>>,
  [string, string]
>();
const mockFetchCatalogo = jest.fn<Promise<ApiResult<CatalogoDto>>, []>();

jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearCategoria: jest.fn(),
  reclasificarCategoria: (txId: string, categoriaId: string) =>
    mockReclasificarCategoria(txId, categoriaId),
  fetchCatalogo: () => mockFetchCatalogo(),
}));

jest.mock('../../api/resumen-refresh', () => ({
  ...jest.requireActual('../../api/resumen-refresh'),
  solicitarRecargaResumen: jest.fn(),
}));

const mockCrearCategoria = categoriasApi.crearCategoria as jest.MockedFunction<
  typeof categoriasApi.crearCategoria
>;

// 12 rows in one group — FILAS_VISIBLES is 10 (GrupoMovimientosMobile.tsx),
// so this group renders a "Ver 2 más" toggle whose expanded/collapsed state
// is exactly what must survive a categoría creation.
function makeDtoConGrupoLargo(): DetalleBucketMesDto {
  return {
    bucket: 'Deseos',
    periodo: '2026-07',
    total: '360000',
    totalTransacciones: 12,
    totalCategorias: 1,
    porcentajeBp: 5000,
    metaBp: 5000,
    grupos: [
      {
        categoriaId: 'cat-1',
        nombre: 'Entretenimiento',
        conteo: 12,
        subtotal: '360000',
        transacciones: Array.from({ length: 12 }, (_, i) => ({
          id: `tx-${i + 1}`,
          descripcion: `Item ${i + 1}`,
          fecha: `2026-07-${String(i + 1).padStart(2, '0')}`,
          origen: 'BCI',
          monto: '30000',
        })),
      },
    ],
  };
}

// Same 12-row group as above, but AFTER tx-1 has been reclassified into a
// second Deseos categoría ('Streaming', cat-2): cat-1 keeps tx-2..tx-12 (11
// rows — still over FILAS_VISIBLES=10, so its toggle survives), cat-2 is a
// brand-new group holding only tx-1.
function makeDtoTrasReclasificar(): DetalleBucketMesDto {
  const original = makeDtoConGrupoLargo();
  const [grupoOriginal] = original.grupos;
  return {
    ...original,
    grupos: [
      {
        ...grupoOriginal!,
        conteo: 11,
        transacciones: grupoOriginal!.transacciones.slice(1),
      },
      {
        categoriaId: 'cat-2',
        nombre: 'Streaming',
        conteo: 1,
        subtotal: '30000',
        transacciones: [grupoOriginal!.transacciones[0]!],
      },
    ],
  };
}

// Catalog with TWO Deseos categorías so tapping the second one from the
// reclassify picker is a same-bucket move (no Alert.alert confirmation to
// drive through).
function makeCatalogoDosEnDeseos(): CatalogoDto {
  return {
    categorias: [
      {
        id: 'cat-1',
        nombre: 'Entretenimiento',
        bucket: 'Deseos',
        transaccionesCount: 12,
        patrones: [],
      },
      {
        id: 'cat-2',
        nombre: 'Streaming',
        bucket: 'Deseos',
        transaccionesCount: 0,
        patrones: [],
      },
    ],
  };
}

describe('BucketDetalleScreen — expanded group persists across categoría creation (issue #743)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCrearCategoria.mockResolvedValue({
      ok: true,
      value: {
        id: 'cat-fake',
        nombre: 'Fake',
        bucket: 'Necesidades',
        transaccionesCount: 0,
        patrones: [],
      },
    });
  });

  it('a group expanded before creating a categoría is STILL expanded after (no remount regression)', async () => {
    mockFetchDetalleBucketMes.mockResolvedValue({
      ok: true,
      value: makeDtoConGrupoLargo(),
    });

    await render(
      <BucketDetalleScreen
        bucket="Deseos"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('grupo-toggle-cat-1')).toBeTruthy();
    });

    // Collapsed by default: only the first 10 rows render, row 12 does not.
    expect(screen.queryByTestId('movimiento-tx-12')).toBeNull();
    expect(screen.getByText('Ver 2 más')).toBeOnTheScreen();

    // Expand the group.
    await act(async () => {
      fireEvent.press(screen.getByTestId('grupo-toggle-cat-1'));
    });
    await waitFor(() => {
      expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('movimiento-tx-12')).toBeTruthy();

    // Create a category from the screen's own "Agregar categoría" control.
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

    // The group must STILL be expanded — no remount collapsed it back.
    expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    expect(screen.getByTestId('movimiento-tx-12')).toBeTruthy();
  });
});

describe('BucketDetalleScreen — reclassifying does not collapse expanded groups (issue #762)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchCatalogo.mockResolvedValue({
      ok: true,
      value: makeCatalogoDosEnDeseos(),
    });
  });

  it('a group expanded before a reclassification is STILL expanded after it, and the moved row shows its new category, with the real GrupoMovimientosMobile mounted', async () => {
    // A DEFERRED second fetch (resolved manually, below) is deliberate: an
    // immediately-resolved mock lets React's automatic batching collapse
    // the loading→data transition into a single commit before this test
    // ever observes it, which would let this assertion pass even against
    // the OLD `cargar` (fase: 'loading') behavior — a false negative that
    // cannot see the bug. A real async gap forces a genuine intermediate
    // render, the same way a real network request would.
    let resolverSegundaCarga: (
      value: ApiResult<DetalleBucketMesDto>,
    ) => void = () => {};
    const segundaCarga = new Promise<ApiResult<DetalleBucketMesDto>>(
      (resolve) => {
        resolverSegundaCarga = resolve;
      },
    );
    mockFetchDetalleBucketMes
      .mockResolvedValueOnce({ ok: true, value: makeDtoConGrupoLargo() })
      .mockReturnValueOnce(segundaCarga);
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: {
        id: 'tx-1',
        bucket: 'Deseos',
        categoria: { id: 'cat-2', nombre: 'Streaming' },
      },
    });

    await render(
      <BucketDetalleScreen
        bucket="Deseos"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('grupo-toggle-cat-1')).toBeTruthy();
    });
    expect(screen.queryByTestId('movimiento-tx-12')).toBeNull();

    // Expand the group.
    await act(async () => {
      fireEvent.press(screen.getByTestId('grupo-toggle-cat-1'));
    });
    await waitFor(() => {
      expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('movimiento-tx-12')).toBeTruthy();

    // Reclassify tx-1 to the OTHER Deseos categoría (same-bucket — no Alert).
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-opcion-cat-2')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-2'));
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalledWith('tx-1', 'cat-2');
    });

    // The refetch is still in flight — resolve it now.
    await act(async () => {
      resolverSegundaCarga({ ok: true, value: makeDtoTrasReclasificar() });
    });

    // Wait for the background refetch to land: cat-2 is a new group.
    await waitFor(() => {
      expect(screen.getByTestId('grupo-movimientos-cat-2')).toBeTruthy();
    });

    // The group must STILL be expanded — the background refresh never
    // unmounted GrupoMovimientosMobile, so its own `expandido` state
    // survived untouched (issue #762 fix).
    expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    expect(screen.getByTestId('movimiento-tx-12')).toBeTruthy();

    // The reclassified movement really did move: it now renders under the
    // NEW categoría's group, not the old one.
    expect(
      within(screen.getByTestId('grupo-movimientos-cat-2')).getByTestId(
        'movimiento-tx-1',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('grupo-movimientos-cat-1')).queryByTestId(
        'movimiento-tx-1',
      ),
    ).toBeNull();
  });

  it('the background refetch never shows the full-page loading state (groups stay mounted while the request is in flight)', async () => {
    let resolverSegundaCarga: (
      value: ApiResult<DetalleBucketMesDto>,
    ) => void = () => {};
    const segundaCarga = new Promise<ApiResult<DetalleBucketMesDto>>(
      (resolve) => {
        resolverSegundaCarga = resolve;
      },
    );
    mockFetchDetalleBucketMes
      .mockResolvedValueOnce({ ok: true, value: makeDtoConGrupoLargo() })
      .mockReturnValueOnce(segundaCarga);
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: {
        id: 'tx-1',
        bucket: 'Deseos',
        categoria: { id: 'cat-2', nombre: 'Streaming' },
      },
    });

    await render(
      <BucketDetalleScreen
        bucket="Deseos"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('grupo-toggle-cat-1')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('grupo-toggle-cat-1'));
    });
    await waitFor(() => {
      expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-opcion-cat-2')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-2'));
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalled();
    });

    // The refetch IS in flight (segundaCarga unresolved) — the OLD dto's
    // groups must still be rendered, no full-page loading state.
    expect(screen.queryByTestId('bucket-detalle-loading')).toBeNull();
    expect(screen.getByTestId('bucket-detalle-grupos')).toBeTruthy();
    expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    expect(screen.getByTestId('movimiento-tx-12')).toBeTruthy();

    await act(async () => {
      resolverSegundaCarga({ ok: true, value: makeDtoTrasReclasificar() });
    });
    await waitFor(() => {
      expect(screen.getByTestId('grupo-movimientos-cat-2')).toBeTruthy();
    });
  });

  it('a failed background refresh keeps the previously loaded data on screen and surfaces the error non-destructively', async () => {
    mockFetchDetalleBucketMes
      .mockResolvedValueOnce({ ok: true, value: makeDtoConGrupoLargo() })
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } });
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: {
        id: 'tx-1',
        bucket: 'Deseos',
        categoria: { id: 'cat-2', nombre: 'Streaming' },
      },
    });

    await render(
      <BucketDetalleScreen
        bucket="Deseos"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('grupo-toggle-cat-1')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('grupo-toggle-cat-1'));
    });
    await waitFor(() => {
      expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-opcion-cat-2')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-2'));
    });

    // Wait for the failed background refetch to settle.
    await waitFor(() => {
      expect(
        screen.getByTestId('bucket-detalle-error-revalidacion'),
      ).toBeTruthy();
    });

    // The screen is NOT blanked: no full-page loading/error branch, and the
    // stale (pre-refresh) data is still fully rendered.
    expect(screen.queryByTestId('bucket-detalle-loading')).toBeNull();
    expect(screen.queryByTestId('bucket-detalle-error')).toBeNull();
    expect(screen.getByTestId('bucket-detalle-grupos')).toBeTruthy();
    expect(screen.getByText('Ver menos')).toBeOnTheScreen();
    expect(screen.getByTestId('movimiento-tx-12')).toBeTruthy();
  });
});
