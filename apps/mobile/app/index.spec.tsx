import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import type { ApiResult } from '../src/api/client';
import type { ResumenMesDto } from '../src/domain/resumen.types';

// RED-first (T3.9, sprint3-mvp-mobile, MOB-03/MOB-04): the 4-way state
// switch that `app/index.tsx` owns. `fetchResumen` is mocked at the module
// boundary so the screen's own useEffect/useState wiring is what's under
// test — never a real fetch (D2: plain fetch, no query library).
const mockFetchResumen = jest.fn<Promise<ApiResult<ResumenMesDto>>, [string?]>();

jest.mock('../src/api/client', () => ({
  fetchResumen: (periodo?: string) => mockFetchResumen(periodo),
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

// Import after jest.mock is registered.
import Index from './index';

describe('Index (4-state switch)', () => {
  beforeEach(() => {
    mockFetchResumen.mockReset();
  });

  it('shows the loading state while the request is in flight', async () => {
    const d = deferred<ApiResult<ResumenMesDto>>();
    mockFetchResumen.mockReturnValue(d.promise);

    await render(<Index />);

    expect(screen.getByText('Cargando resumen…')).toBeOnTheScreen();
    expect(screen.queryByText('Distribución 50/30/20')).not.toBeOnTheScreen();
    expect(screen.queryByText('Reintentar')).not.toBeOnTheScreen();

    d.resolve({ ok: true, value: dataDto });
    await waitFor(() => expect(screen.getByText('Distribución 50/30/20')).toBeOnTheScreen());
  });

  it('shows the data state with income, all buckets, and the global semáforo', async () => {
    mockFetchResumen.mockResolvedValue({ ok: true, value: dataDto });

    await render(<Index />);

    await waitFor(() => expect(screen.getByText('Distribución 50/30/20')).toBeOnTheScreen());
    expect(screen.getByText('$1.000.000')).toBeOnTheScreen();
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('Deseos')).toBeOnTheScreen();
    expect(screen.getByText('Ahorro')).toBeOnTheScreen();
    expect(screen.getByTestId('semaforo-global')).toBeOnTheScreen();
  });

  it('shows the empty state (distinct from $0) when sinIngreso is true', async () => {
    mockFetchResumen.mockResolvedValue({ ok: true, value: emptyDto });

    await render(<Index />);

    await waitFor(() =>
      expect(screen.getByText('Sin ingresos registrados este período')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Distribución 50/30/20')).not.toBeOnTheScreen();
  });

  it('shows the error state with a retry affordance on a mapped failure', async () => {
    mockFetchResumen.mockResolvedValue({ ok: false, error: { tag: 'network' } });

    await render(<Index />);

    await waitFor(() => expect(screen.getByText('Reintentar')).toBeOnTheScreen());
    expect(screen.queryByText('Distribución 50/30/20')).not.toBeOnTheScreen();
  });

  it('refetches when retry is pressed', async () => {
    mockFetchResumen
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } })
      .mockResolvedValueOnce({ ok: true, value: dataDto });

    await render(<Index />);

    await waitFor(() => expect(screen.getByText('Reintentar')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Reintentar'));

    await waitFor(() => expect(screen.getByText('Distribución 50/30/20')).toBeOnTheScreen());
    expect(mockFetchResumen).toHaveBeenCalledTimes(2);
  });
});
