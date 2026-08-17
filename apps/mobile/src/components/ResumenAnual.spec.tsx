import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react-native';
import { View, Text } from 'react-native';
import type { ApiResult } from '../api/client';
import type { ResumenAnualDto, ResumenMesDto } from '../domain/resumen.types';

// RED-first (T5a.3, US-050 design §1.7): `ResumenAnual` is a self-contained
// section — it owns its OWN fetch (`fetchResumenAnual`, called with NO
// argument, MOB-10) and its own Loading/Error+retry/Empty/data states,
// independently of the main chart card (MOB-12). `fetchResumenAnual` is
// mocked at the module boundary, same pattern `app/index.spec.tsx` uses for
// `fetchResumen`. `resumen-refresh` is intentionally NOT mocked (D-13) — the
// real pub/sub module is exercised so `ResumenAnual`'s registration as a
// second subscriber is actually asserted, not just assumed.
import { ResumenAnual } from './ResumenAnual';
import { solicitarRecargaResumen } from '../api/resumen-refresh';

const mockFetchResumenAnual = jest.fn<
  Promise<ApiResult<ResumenAnualDto>>,
  [anio?: number]
>();

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  fetchResumenAnual: (...args: [anio?: number]) =>
    mockFetchResumenAnual(...args),
}));

// Deferred promise so the loading state is observable before resolution.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mesDto(
  periodo: string,
  overrides: Partial<ResumenMesDto> = {},
): ResumenMesDto {
  return {
    periodo,
    totalIngreso: '0',
    sinIngreso: true,
    buckets: [
      {
        bucket: 'Necesidades',
        total: '0',
        porcentajeBp: null,
        estadoSemaforo: null,
      },
      {
        bucket: 'Deseos',
        total: '0',
        porcentajeBp: null,
        estadoSemaforo: null,
      },
      {
        bucket: 'Ahorro',
        total: '0',
        porcentajeBp: null,
        estadoSemaforo: null,
      },
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
    ...overrides,
  };
}

function mesConDatos(periodo: string): ResumenMesDto {
  return mesDto(periodo, {
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
    estadoGlobal: 'verde',
  });
}

const MESES_2026 = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
  '2026-12',
];

/** All 12 sinIngreso — the empty-year case. */
const dtoSinDatos: ResumenAnualDto = {
  anio: 2026,
  meses: MESES_2026.map((p) => mesDto(p)),
};

/** Abril and julio have data, the rest don't. */
const dtoConDatos: ResumenAnualDto = {
  anio: 2026,
  meses: MESES_2026.map((p) =>
    p === '2026-04' || p === '2026-07' ? mesConDatos(p) : mesDto(p),
  ),
};

describe('ResumenAnual', () => {
  const onSelectPeriodo = jest.fn<void, [string]>();

  beforeEach(() => {
    mockFetchResumenAnual.mockReset();
    onSelectPeriodo.mockReset();
  });

  it('shows the loading state while the annual request is in flight', async () => {
    const d = deferred<ApiResult<ResumenAnualDto>>();
    mockFetchResumenAnual.mockReturnValue(d.promise);

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    expect(screen.getByText('Cargando resumen anual…')).toBeOnTheScreen();

    d.resolve({ ok: true, value: dtoConDatos });
    await waitFor(() =>
      expect(screen.getByLabelText('Ver julio 2026')).toBeOnTheScreen(),
    );
  });

  it('shows an error state with a retry affordance on a mapped failure', async () => {
    mockFetchResumenAnual.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(screen.getByText('Reintentar')).toBeOnTheScreen(),
    );
  });

  it('refetches when retry is pressed', async () => {
    mockFetchResumenAnual
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } })
      .mockResolvedValueOnce({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(screen.getByText('Reintentar')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByText('Reintentar'));

    await waitFor(() =>
      expect(screen.getByLabelText('Ver abril 2026')).toBeOnTheScreen(),
    );
    expect(mockFetchResumenAnual).toHaveBeenCalledTimes(2);
  });

  it('shows the empty-year message and no grid when all 12 months are sinIngreso', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoSinDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(
        screen.getByText('Todavía no hay datos este año'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders the "Año {anio}" heading from the anio prop, independent of the fetch', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() => expect(screen.getByText('Año 2026')).toBeOnTheScreen());
  });

  it('renders exactly 12 cells', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(12));
  });

  it('each cell exposes accessibilityLabel="Ver {mes completo}"', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Ver julio 2026')).toBeOnTheScreen(),
    );
    expect(screen.getByLabelText('Ver enero 2026')).toBeOnTheScreen();
  });

  it('a month with data is pressable and calls onSelectPeriodo with its YYYY-MM', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Ver julio 2026')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('Ver julio 2026'));

    expect(onSelectPeriodo).toHaveBeenCalledWith('2026-07');
  });

  it('a month without data is disabled and pressing it does not call onSelectPeriodo', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Ver enero 2026')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('Ver enero 2026'));

    expect(onSelectPeriodo).not.toHaveBeenCalled();
  });

  it('the disabled cell carries accessibilityState.disabled', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('mes-celda-2026-01')).toBeOnTheScreen(),
    );
    expect(
      screen.getByTestId('mes-celda-2026-01').props.accessibilityState,
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByTestId('mes-celda-2026-04').props.accessibilityState,
    ).toHaveProperty('disabled', false);
    // NOTE: the RN-native `disabled` prop is NOT assertable here — Pressable
    // consumes it internally (folds it into accessibilityState + responder
    // gating) and does not forward it to the host element (props.disabled is
    // undefined). The observable contract is accessibilityState above plus
    // the "tap on a disabled cell never fires" test.
  });

  it('the selected cell carries accessibilityState.selected, no other cell does', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-04"
        onSelectPeriodo={onSelectPeriodo}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('mes-celda-2026-04')).toBeOnTheScreen(),
    );
    expect(
      screen.getByTestId('mes-celda-2026-04').props.accessibilityState,
    ).toHaveProperty('selected', true);
    expect(
      screen.getByTestId('mes-celda-2026-07').props.accessibilityState,
    ).toHaveProperty('selected', false);
  });

  it('an annual failure does not affect what the parent renders', async () => {
    mockFetchResumenAnual.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    await render(
      <View>
        <Text>Contenido padre</Text>
        <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />
      </View>,
    );

    await waitFor(() =>
      expect(screen.getByText('Reintentar')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Contenido padre')).toBeOnTheScreen();
  });

  it('registers with resumen-refresh and reloads when the real solicitarRecargaResumen() fires (D-13)', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Ver julio 2026')).toBeOnTheScreen(),
    );
    expect(mockFetchResumenAnual).toHaveBeenCalledTimes(1);

    await act(async () => {
      solicitarRecargaResumen();
    });

    await waitFor(() => expect(mockFetchResumenAnual).toHaveBeenCalledTimes(2));
  });

  it('calls fetchResumenAnual with no arguments (MOB-10 — anio prop only labels the heading)', async () => {
    mockFetchResumenAnual.mockResolvedValue({ ok: true, value: dtoConDatos });

    await render(
      <ResumenAnual anio={2026} onSelectPeriodo={onSelectPeriodo} />,
    );

    await waitFor(() => expect(mockFetchResumenAnual).toHaveBeenCalledTimes(1));
    expect(mockFetchResumenAnual).toHaveBeenCalledWith();
  });
});
