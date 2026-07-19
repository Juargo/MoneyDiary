import { act, render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import type { ApiResult } from '../src/api/client';
import type { ResumenMesDto } from '../src/domain/resumen.types';

// RED-first (T3.9, sprint3-mvp-mobile, MOB-03/MOB-04): the 4-way state
// switch that `app/index.tsx` owns. `fetchResumen` is mocked at the module
// boundary so the screen's own useEffect/useState wiring is what's under
// test — never a real fetch (D2: plain fetch, no query library).
const mockFetchResumen = jest.fn<Promise<ApiResult<ResumenMesDto>>, [string?]>();
const mockPostLogout = jest.fn<Promise<ApiResult<void>>, []>();

// `copiaPorApiError` is re-exported from the real module (review readability
// fix #7, DRY): `src/components/states/Error.tsx` imports it from
// `../../api/client`, so mocking this module without it would break the
// error-state render with a "not a function" crash.
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  fetchResumen: (periodo?: string) => mockFetchResumen(periodo),
  postLogout: () => mockPostLogout(),
}));

// Logout affordance (Slice 4 §4.4, MOB-04): borrarToken + the session
// context's `signOut` are mocked at the module boundary alongside
// fetchResumen/postLogout above. Navigation is no longer driven by
// `router.replace` (Slice 4 fix, review finding #1/#2) — `signOut` flips the
// synchronous auth-context guard and `Stack.Protected` does the actual
// navigating (tested for real in `test/auth-navigation.integration.spec.tsx`).
const mockBorrarToken = jest.fn<Promise<void>, []>();
const mockSignOut = jest.fn<void, []>();

jest.mock('../src/api/session-store', () => ({
  borrarToken: () => mockBorrarToken(),
}));

jest.mock('../src/api/session-context', () => ({
  useSession: () => ({ signOut: mockSignOut }),
}));

// "Subir cartola" entry affordance (B.7, upload-cartola-ui Slice 2b): the
// screen navigates via expo-router's `useRouter().push`, mocked at the
// module boundary — no real Router context is mounted in this unit test.
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Deferred promise so the loading state is observable before resolution.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const dataDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '500000', porcentajeBp: 5000, estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '300000', porcentajeBp: 3000, estadoSemaforo: 'amarillo' },
    { bucket: 'Ahorro', total: '200000', porcentajeBp: 2000, estadoSemaforo: 'verde' },
    { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
};

const emptyDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '0',
  sinIngreso: true,
  buckets: [
    { bucket: 'Necesidades', total: '0', porcentajeBp: null, estadoSemaforo: null },
    { bucket: 'Deseos', total: '0', porcentajeBp: null, estadoSemaforo: null },
    { bucket: 'Ahorro', total: '0', porcentajeBp: null, estadoSemaforo: null },
    { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: null,
};

// Import after jest.mock is registered. `resumen-refresh` is intentionally
// NOT mocked here (unlike `app/subir.spec.tsx`) — the real pub/sub module is
// exercised so the CU-10 end-to-end wiring (subir -> index refetch) has at
// least one test asserting the actual registration/invocation, not just each
// side mocking the other (review fix #1).
import Index from './index';
import { solicitarRecargaResumen } from '../src/api/resumen-refresh';

describe('Index (4-state switch)', () => {
  beforeEach(() => {
    mockFetchResumen.mockReset();
    mockPostLogout.mockReset();
    mockBorrarToken.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset();
    mockPush.mockReset();
  });

  it('shows the loading state while the request is in flight', async () => {
    const d = deferred<ApiResult<ResumenMesDto>>();
    mockFetchResumen.mockReturnValue(d.promise);

    await render(<Index />);

    expect(screen.getByText('Cargando resumen…')).toBeOnTheScreen();
    expect(screen.queryByText('Distribución del gasto')).not.toBeOnTheScreen();
    expect(screen.queryByText('Reintentar')).not.toBeOnTheScreen();

    d.resolve({ ok: true, value: dataDto });
    await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());
  });

  it('shows the data state with income, all buckets, and the global semáforo', async () => {
    mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

    await render(<Index />);

    await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());
    expect(screen.getByText('$1.000.000')).toBeOnTheScreen();
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('Gustos')).toBeOnTheScreen();
    expect(screen.getByText('Ahorro')).toBeOnTheScreen();
    expect(screen.getByTestId('semaforo-global')).toBeOnTheScreen();
  });

  it('shows the empty state (distinct from $0) when sinIngreso is true', async () => {
    mockFetchResumen.mockResolvedValue({ ok: true, value: emptyDto });

    await render(<Index />);

    await waitFor(() =>
      expect(screen.getByText('Sin ingresos registrados este período')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Distribución del gasto')).not.toBeOnTheScreen();
  });

  it('shows the error state with a retry affordance on a mapped failure', async () => {
    mockFetchResumen.mockResolvedValue({ ok: false, error: { tag: 'network' } });

    await render(<Index />);

    await waitFor(() => expect(screen.getByText('Reintentar')).toBeOnTheScreen());
    expect(screen.queryByText('Distribución del gasto')).not.toBeOnTheScreen();
  });

  it('refetches when retry is pressed', async () => {
    mockFetchResumen
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } })
      .mockResolvedValueOnce({ ok: true, value: dataDto });

    await render(<Index />);

    await waitFor(() => expect(screen.getByText('Reintentar')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Reintentar'));

    await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());
    expect(mockFetchResumen).toHaveBeenCalledTimes(2);
  });

  describe('logout affordance (MOB-04)', () => {
    it('calls postLogout, then borrarToken, then signs out', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });
      mockPostLogout.mockResolvedValue({ ok: true, value: undefined });

      await render(<Index />);
      await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());

      // REL LOW (review finding): wrap the async logout interaction so its
      // chained awaits (postLogout -> borrarToken -> signOut) settle inside
      // `act` before the assertions run, eliminating the stray act() warning.
      await act(async () => {
        await fireEvent.press(screen.getByTestId('logout-button'));
      });

      await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
      expect(mockPostLogout).toHaveBeenCalled();
      expect(mockBorrarToken).toHaveBeenCalled();
    });

    it('still clears the local token and signs out even when postLogout network-fails', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });
      mockPostLogout.mockResolvedValue({ ok: false, error: { tag: 'network' } });

      await render(<Index />);
      await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());

      await act(async () => {
        await fireEvent.press(screen.getByTestId('logout-button'));
      });

      await waitFor(() => expect(mockBorrarToken).toHaveBeenCalled());
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('"Subir cartola" entry affordance (B.7)', () => {
    it('navigates to /subir when pressed', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

      await render(<Index />);
      await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());

      const trigger = screen.getByTestId('subir-cartola-button');
      expect(trigger).toHaveProp('accessibilityRole', 'button');

      fireEvent.press(trigger);

      expect(mockPush).toHaveBeenCalledWith('/subir');
    });
  });

  describe('resumen-refresh wiring (CU-10, real pub/sub — review fix #1)', () => {
    it('re-fetches the resumen when the real solicitarRecargaResumen() is called', async () => {
      mockFetchResumen
        .mockResolvedValueOnce({ ok: true, value: dataDto })
        .mockResolvedValueOnce({ ok: true, value: dataDto });

      await render(<Index />);
      await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());
      expect(mockFetchResumen).toHaveBeenCalledTimes(1);

      // This is the REAL module — no jest.mock on '../src/api/resumen-refresh'
      // in this file — exercising the actual registration `index.tsx` performs
      // on mount, closing the end-to-end gap the review flagged.
      await act(async () => {
        solicitarRecargaResumen();
      });

      await waitFor(() => expect(mockFetchResumen).toHaveBeenCalledTimes(2));
    });

    it('unregisters its listener on unmount, so a subsequent solicitarRecargaResumen() does not refetch (review fix #2)', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

      const view = await render(<Index />);
      await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());
      expect(mockFetchResumen).toHaveBeenCalledTimes(1);

      // `unmount()` must run inside `act` so the effect cleanup (the
      // unregister call returned from `registrarRecargaResumen`) actually
      // flushes before the assertions below.
      await act(async () => {
        view.unmount();
      });

      solicitarRecargaResumen();

      // Give any stray async work a tick, then assert no additional call
      // reached the stale `cargar` from the unmounted screen.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockFetchResumen).toHaveBeenCalledTimes(1);
    });
  });
});
