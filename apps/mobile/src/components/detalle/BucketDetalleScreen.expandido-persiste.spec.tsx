/**
 * BucketDetalleScreen — expanded-group persistence across categoría
 * creation (agregar-categoria-desde-bucket, issue #743, review rework).
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
 * `ReclasificarMobileControl` (real, nested under the real
 * `GrupoMovimientosMobile`) is never opened here — its own catalog-refetch
 * behavior is covered by `ReclasificarMobileControl.spec.tsx`'s
 * `categoriaVersion` describe block instead.
 */
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react-native';
import * as categoriasApi from '../../api/categorias';
import type { ApiResult } from '../../api/client';
import type { DetalleBucketMesDto } from '../../domain/detalle.types';
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
// precedent). fetchCatalogo stays REAL but unexercised: this file never
// opens a reclassify modal.
jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearCategoria: jest.fn(),
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
