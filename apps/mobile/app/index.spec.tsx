import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react-native';
import type { ApiResult } from '../src/api/client';
import type {
  ResumenAnualDto,
  ResumenMesDto,
} from '../src/domain/resumen.types';

// Import after jest.mock is registered. `resumen-refresh` is intentionally
// NOT mocked here (unlike `app/subir.spec.tsx`) — the real pub/sub module is
// exercised so the CU-10 end-to-end wiring (subir -> index refetch) has at
// least one test asserting the actual registration/invocation, not just each
// side mocking the other (review fix #1).
import Index from './index';
import { solicitarRecargaResumen } from '../src/api/resumen-refresh';

// RED-first (T3.9, sprint3-mvp-mobile, MOB-03/MOB-04): the 4-way state
// switch that `app/index.tsx` owns. `fetchResumen` is mocked at the module
// boundary so the screen's own useEffect/useState wiring is what's under
// test — never a real fetch (D2: plain fetch, no query library).
const mockFetchResumen = jest.fn<
  Promise<ApiResult<ResumenMesDto>>,
  [string?]
>();
// T5b.2 (US-050, design §1.9): `app/index.tsx` now also mounts `ResumenAnual`
// as an always-rendered sibling of the month SLOT — its own `fetchResumenAnual`
// must be mocked here too, or every existing test in this file would trigger a
// real (env-less) fetch and risk colliding "Reintentar"/loading text with the
// month card's own. Reset with a default success value in `beforeEach` so the
// 12 pre-existing cases stay unedited and green.
const mockFetchResumenAnual = jest.fn<
  Promise<ApiResult<ResumenAnualDto>>,
  [number?]
>();
const mockPostLogout = jest.fn<Promise<ApiResult<void>>, []>();

// `copiaPorApiError` is re-exported from the real module (review readability
// fix #7, DRY): `src/components/states/Error.tsx` imports it from
// `../../api/client`, so mocking this module without it would break the
// error-state render with a "not a function" crash.
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  fetchResumen: (periodo?: string) => mockFetchResumen(periodo),
  fetchResumenAnual: (anio?: number) => mockFetchResumenAnual(anio),
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

// D-15 gate (judgment-day fix, PR5b): the old test asserted on
// `getByLabelText(...).props.onPress`, which is the HOST Pressable's own
// prop — `undefined` in RNTL, since `Pressable` never forwards `onPress`
// verbatim onto the rendered host node. That made the assertion
// `expect(undefined).toBe(undefined)`, passing unconditionally regardless of
// whether the shell's `onSelectPeriodo` is actually stable. This mock
// replaces that vacuous read with a real probe: it wraps the REAL
// `ResumenAnual` (rendered via `createElement`, so its own hooks still run
// against its own fiber) and records the `onSelectPeriodo` identity it
// receives on every render the shell triggers.
const mockOnSelectPeriodoIdentidades: unknown[] = [];

jest.mock('../src/components/ResumenAnual', () => {
  const actual = jest.requireActual('../src/components/ResumenAnual');
  const { createElement } = jest.requireActual('react');
  return {
    ...actual,
    ResumenAnual: (props: {
      readonly anio: number;
      readonly periodoSeleccionado?: string;
      readonly onSelectPeriodo: (periodo: string) => void;
    }) => {
      mockOnSelectPeriodoIdentidades.push(props.onSelectPeriodo);
      return createElement(actual.ResumenAnual, props);
    },
  };
});

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
    {
      bucket: 'Necesidades',
      total: '500000',
      porcentajeBp: 5000,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Deseos',
      total: '300000',
      porcentajeBp: 3000,
      estadoSemaforo: 'amarillo',
    },
    {
      bucket: 'Ahorro',
      total: '200000',
      porcentajeBp: 2000,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'SinCategoria',
      total: '0',
      porcentajeBp: null,
      estadoSemaforo: null,
    },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
  cantidadSinCategoria: 0,
};

const emptyDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '0',
  sinIngreso: true,
  buckets: [
    {
      bucket: 'Necesidades',
      total: '0',
      porcentajeBp: null,
      estadoSemaforo: null,
    },
    { bucket: 'Deseos', total: '0', porcentajeBp: null, estadoSemaforo: null },
    { bucket: 'Ahorro', total: '0', porcentajeBp: null, estadoSemaforo: null },
    {
      bucket: 'SinCategoria',
      total: '0',
      porcentajeBp: null,
      estadoSemaforo: null,
    },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: null,
  cantidadSinCategoria: 0,
};

// T5b.2 (US-050, design §1.9): the shell's own year, always the current UTC
// year since `app/index.tsx` never injects `Date` (design binding decision
// 4 — no year navigation yet). Deriving it here, not hardcoding a literal,
// keeps this file correct regardless of when the suite runs.
const anioActual = new Date().getUTCFullYear();

/** One month of the annual grid fixture, always WITH data (§1.9's default
 * `periodoSeleccionado = periodoVista` marks the current month selected, and
 * every cell here is tappable so the tests below don't have to route around
 * a disabled cell). */
function mesAnualConDatos(mes: string): ResumenMesDto {
  return {
    periodo: `${anioActual}-${mes}`,
    totalIngreso: '1000000',
    sinIngreso: false,
    buckets: [
      {
        bucket: 'Necesidades',
        total: '500000',
        porcentajeBp: 5000,
        estadoSemaforo: 'verde',
      },
      {
        bucket: 'Deseos',
        total: '300000',
        porcentajeBp: 3000,
        estadoSemaforo: 'amarillo',
      },
      {
        bucket: 'Ahorro',
        total: '200000',
        porcentajeBp: 2000,
        estadoSemaforo: 'verde',
      },
      {
        bucket: 'SinCategoria',
        total: '0',
        porcentajeBp: null,
        estadoSemaforo: null,
      },
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: 'verde',
    cantidadSinCategoria: 0,
  };
}

const MESES_NUM = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
];

/** Module-level (not rebuilt per test/render) so `fetchResumenAnual`
 * resolving to this SAME object reference twice lets `ResumenAnual`'s
 * `useMemo(() => aResumenAnualViewModel(dto), [dto])` short-circuit on a
 * refetch — required by the D-15 referential-stability test below, which
 * needs the *only* thing that can change identity across the re-render to be
 * `onSelectPeriodo` from the shell, not the grid's own view model. */
const annualDtoConDatos: ResumenAnualDto = {
  anio: anioActual,
  meses: MESES_NUM.map(mesAnualConDatos),
};

describe('Index (4-state switch)', () => {
  beforeEach(() => {
    mockFetchResumen.mockReset();
    mockFetchResumenAnual
      .mockReset()
      .mockResolvedValue({ ok: true, value: annualDtoConDatos });
    mockPostLogout.mockReset();
    mockBorrarToken.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset();
    mockPush.mockReset();
    mockOnSelectPeriodoIdentidades.length = 0;
  });

  it('shows the loading state while the request is in flight', async () => {
    const d = deferred<ApiResult<ResumenMesDto>>();
    mockFetchResumen.mockReturnValue(d.promise);

    await render(<Index />);

    expect(screen.getByText('Cargando resumen…')).toBeOnTheScreen();
    expect(screen.queryByText('Distribución del gasto')).not.toBeOnTheScreen();
    expect(screen.queryByText('Reintentar')).not.toBeOnTheScreen();

    d.resolve({ ok: true, value: dataDto });
    await waitFor(() =>
      expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
    );
  });

  it('shows the data state with income, all buckets, and the global semáforo', async () => {
    mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

    await render(<Index />);

    await waitFor(() =>
      expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
    );
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
      expect(
        screen.getByText('Sin ingresos registrados este período'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Distribución del gasto')).not.toBeOnTheScreen();
  });

  it('shows the error state with a retry affordance on a mapped failure', async () => {
    mockFetchResumen.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<Index />);

    await waitFor(() =>
      expect(screen.getByText('Reintentar')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Distribución del gasto')).not.toBeOnTheScreen();
  });

  it('refetches when retry is pressed', async () => {
    mockFetchResumen
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } })
      .mockResolvedValueOnce({ ok: true, value: dataDto });

    await render(<Index />);

    await waitFor(() =>
      expect(screen.getByText('Reintentar')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByText('Reintentar'));

    await waitFor(() =>
      expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
    );
    expect(mockFetchResumen).toHaveBeenCalledTimes(2);
  });

  describe('logout affordance (MOB-04)', () => {
    // ADR-018 layer 2 (RNTL semantic queries): the logout control must be
    // reachable by a screen reader through its accessible role + name, not
    // just by testID — asserted separately from the interaction tests below.
    it('exposes the logout control as an accessible button named "Cerrar sesión"', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

      await render(<Index />);
      await waitFor(() =>
        expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
      );

      expect(
        screen.getByRole('button', { name: 'Cerrar sesión' }),
      ).toBeOnTheScreen();
    });

    it('calls postLogout, then borrarToken, then signs out', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });
      mockPostLogout.mockResolvedValue({ ok: true, value: undefined });

      await render(<Index />);
      await waitFor(() =>
        expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
      );

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
      mockPostLogout.mockResolvedValue({
        ok: false,
        error: { tag: 'network' },
      });

      await render(<Index />);
      await waitFor(() =>
        expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
      );

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
      await waitFor(() =>
        expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
      );

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
      await waitFor(() =>
        expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
      );
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
      await waitFor(() =>
        expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
      );
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

  // T5b.2 (US-050, design §1.9/§0): the shell composes `ResumenAnual` as an
  // ALWAYS-rendered sibling of the month SLOT — asserted here against the
  // real `ResumenAnual` (not mocked), independent of the SLOT's own phase.
  describe('annual section composition (design §0/D-05, MOB-14)', () => {
    it('renders the annual section alongside the Empty state (CQ1/MOB-14)', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: emptyDto });

      await render(<Index />);

      await waitFor(() =>
        expect(
          screen.getByText('Sin ingresos registrados este período'),
        ).toBeOnTheScreen(),
      );
      await waitFor(() =>
        expect(screen.getByText(`Año ${anioActual}`)).toBeOnTheScreen(),
      );
    });

    it('renders the annual section alongside loading and error too (D-05)', async () => {
      const d = deferred<ApiResult<ResumenMesDto>>();
      mockFetchResumen.mockReturnValue(d.promise);

      await render(<Index />);

      expect(screen.getByText('Cargando resumen…')).toBeOnTheScreen();
      await waitFor(() =>
        expect(screen.getByText(`Año ${anioActual}`)).toBeOnTheScreen(),
      );

      d.resolve({ ok: false, error: { tag: 'network' } });

      await waitFor(() =>
        expect(screen.getByText('Reintentar')).toBeOnTheScreen(),
      );
      // Exactly one "Reintentar" on screen — the annual section's own fetch
      // resolved to data (this file's default mock), not to its own error
      // state, so there is no ambiguous duplicate.
      expect(screen.getAllByText('Reintentar')).toHaveLength(1);
      expect(screen.getByText(`Año ${anioActual}`)).toBeOnTheScreen();
    });
  });

  // Fix 5 (D-10): route-level wiring pin — pressing a legend row in the data
  // state must reach router.push with the exact path the shell computes.
  // FALSIFIABILITY: removing the router.push(path) wiring in index.tsx's
  // renderEstado would make onNavegar a no-op, so mockPush would not be
  // called and this test would fail on the toHaveBeenCalledWith assertion.
  describe('legend row navigation wiring (D-10, US-056 PR1)', () => {
    it('pressing leyenda-fila-Necesidades calls router.push with the correct bucket path and periodo', async () => {
      // Pin ONLY the Date constructor (every timer API stays real so RNTL's
      // waitFor is unaffected). index.tsx derives periodoVista at render time
      // via periodoActualUTC(new Date()); without this pin the test's own
      // new Date() and the component's could straddle a UTC month boundary.
      // Mid-June of the suite's current year keeps the annual-grid fixture
      // (built from module-level anioActual) consistent with the pinned clock.
      jest.useFakeTimers({
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
        now: new Date(Date.UTC(anioActual, 5, 15)),
      });

      try {
        mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

        await render(<Index />);
        await waitFor(() =>
          expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
        );

        fireEvent.press(screen.getByTestId('leyenda-fila-Necesidades'));

        // periodoVista in index.tsx = periodo state ?? periodoActualUTC(new Date()).
        // periodo state is undefined on initial mount (no month was tapped), so
        // the pinned clock makes the expected path an exact literal month.
        expect(mockPush).toHaveBeenCalledWith(
          `/bucket/Necesidades?periodo=${anioActual}-06`,
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('month selection (design §1.9, MOB-13)', () => {
    it('fetches with periodo undefined on the default mount (current month)', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

      await render(<Index />);

      await waitFor(() => expect(mockFetchResumen).toHaveBeenCalledTimes(1));
      expect(mockFetchResumen).toHaveBeenCalledWith(undefined);
    });

    it('tapping a month cell re-fetches /api/resumen with that periodo', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

      await render(<Index />);
      await waitFor(() =>
        expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen(),
      );
      expect(mockFetchResumen).toHaveBeenCalledTimes(1);
      expect(mockFetchResumen).toHaveBeenCalledWith(undefined);

      await waitFor(() =>
        expect(
          screen.getByLabelText(`Ver abril ${anioActual}`),
        ).toBeOnTheScreen(),
      );
      fireEvent.press(screen.getByLabelText(`Ver abril ${anioActual}`));

      await waitFor(() => expect(mockFetchResumen).toHaveBeenCalledTimes(2));
      expect(mockFetchResumen).toHaveBeenLastCalledWith(`${anioActual}-04`);
    });

    it('updates the header label to the selected month', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

      await render(<Index />);
      await waitFor(() =>
        expect(
          screen.getByLabelText(`Ver abril ${anioActual}`),
        ).toBeOnTheScreen(),
      );

      fireEvent.press(screen.getByLabelText(`Ver abril ${anioActual}`));

      await waitFor(() =>
        expect(screen.getByText(`Abril ${anioActual}`)).toBeOnTheScreen(),
      );
    });

    // Gate item carried from PR5a judgment (D-15, tasks.md Phase 5b header):
    // `MesCelda`'s `React.memo` only delivers "a tap re-renders exactly two
    // cells" if `onSelectPeriodo`'s identity is stable across renders — pin
    // it directly instead of trusting the `useCallback` by inspection alone.
    // `annualDtoConDatos` is a stable module-level reference (see its own
    // comment) so the ONLY thing that can flip a cell's `onPress` identity
    // across this re-render is the shell's own `onSelectPeriodo`.
    it('passes a referentially stable onSelectPeriodo into ResumenAnual across re-renders (D-15 gate)', async () => {
      mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

      await render(<Index />);
      await waitFor(() =>
        expect(
          screen.getByLabelText(`Ver abril ${anioActual}`),
        ).toBeOnTheScreen(),
      );
      // The shell renders `ResumenAnual` at least once for the initial
      // mount, then AGAIN when `cargar()` flips `estado` from `loading` to
      // `data` — both renders must have already happened by the time the
      // month cell is on screen, so there is a real baseline to compare
      // against below (not just a single capture).
      expect(mockOnSelectPeriodoIdentidades.length).toBeGreaterThanOrEqual(1);
      const primero = mockOnSelectPeriodoIdentidades[0];

      // The real resumen-refresh pub/sub — both `app/index.tsx` and
      // `ResumenAnual` are registered listeners, so this re-fetches both
      // the month card AND the annual grid, forcing a real re-render of the
      // shell without changing which month is selected.
      await act(async () => {
        solicitarRecargaResumen();
      });
      await waitFor(() => expect(mockFetchResumen).toHaveBeenCalledTimes(2));

      // Every `onSelectPeriodo` identity the (real) `ResumenAnual` received
      // across every shell re-render — mount through the refresh above —
      // must be the SAME function reference. A `useCallback` with a stable
      // dependency list guarantees this; an inline arrow or a plain
      // (non-memoized) function does not, and would fail this loop.
      expect(mockOnSelectPeriodoIdentidades.length).toBeGreaterThanOrEqual(2);
      for (const identidad of mockOnSelectPeriodoIdentidades) {
        expect(identidad).toBe(primero);
      }
    });

    // MOB-14 (judgment-day fix): the theoretical Empty→tap→data path had no
    // test — this pins it end-to-end. Initial mount resolves `sinIngreso:
    // true` (SLOT shows `Empty`, annual grid still visible per D-05), then
    // tapping a month cell WITH data must leave the SLOT's `Empty` state,
    // re-fire `/api/resumen` for that tapped periodo, and land on the data
    // view.
    it('leaves the Empty state and shows data after tapping a month with data (MOB-14)', async () => {
      mockFetchResumen
        .mockResolvedValueOnce({ ok: true, value: emptyDto })
        .mockResolvedValueOnce({ ok: true, value: dataDto });

      await render(<Index />);

      await waitFor(() =>
        expect(
          screen.getByText('Sin ingresos registrados este período'),
        ).toBeOnTheScreen(),
      );
      expect(screen.getByText(`Año ${anioActual}`)).toBeOnTheScreen();

      await waitFor(() =>
        expect(
          screen.getByLabelText(`Ver abril ${anioActual}`),
        ).toBeOnTheScreen(),
      );
      fireEvent.press(screen.getByLabelText(`Ver abril ${anioActual}`));

      await waitFor(() => expect(mockFetchResumen).toHaveBeenCalledTimes(2));
      expect(mockFetchResumen).toHaveBeenLastCalledWith(`${anioActual}-04`);

      await waitFor(() =>
        expect(
          screen.queryByText('Sin ingresos registrados este período'),
        ).not.toBeOnTheScreen(),
      );
      expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen();
    });
  });
});
