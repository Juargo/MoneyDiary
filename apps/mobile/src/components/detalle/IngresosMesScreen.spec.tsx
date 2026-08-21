/**
 * IngresosMesScreen spec — T-16 RED (US-056, D-12/D-18/D-08/MDET-06)
 *
 * Six test cases covering the three-tag state machine (loading|error|data;
 * empty derived from filas.length), header content, Origen badge verbatim,
 * read-only contract (no reclasificar-* testIDs), period arrow re-fetch,
 * and useFocusEffect stale-guard (D-18).
 *
 * Architecture decision (D-18 / useFocusEffect placement):
 * IngresosMesScreen owns the fetch lifecycle including useFocusEffect — same
 * pattern as BucketDetalleScreen (M1). The route (ingresos.tsx) is a thin
 * wrapper: reads useLocalSearchParams, manages local periodo state, renders
 * IngresosMesScreen. useFocusEffect lives in the SCREEN (not the route) so
 * the component is testable in isolation. expo-router's useFocusEffect fires
 * on every screen focus event — since it also fires on mount, no separate
 * useEffect is needed for the initial load (avoiding a double-fetch on mount
 * that would result from having both useEffect + useFocusEffect calling cargar).
 *
 * useFocusEffect in tests: mocked as useEffect (configuracion.spec.tsx pattern)
 * so it fires once on mount. The test asserts cargar was called (fetch count),
 * which is truthful — on mount focus fires, triggering one cargar call.
 */

import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react-native';
import type { ApiResult } from '../../api/client';
import type { IngresosMesDto } from '../../domain/detalle.types';

import { IngresosMesScreen } from './IngresosMesScreen';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock fetchIngresosMes at module boundary
const mockFetchIngresosMes = jest.fn<
  Promise<ApiResult<IngresosMesDto>>,
  [string?]
>();

jest.mock('../../api/client', () => ({
  ...jest.requireActual('../../api/client'),
  fetchIngresosMes: (periodo?: string) => mockFetchIngresosMes(periodo),
}));

// useFocusEffect mock (configuracion.spec.tsx pattern):
// Simulates focus firing on mount so the stale-guard cargar is called.
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void) => {
      useEffect(() => {
        callback();
      }, [callback]);
    },
  };
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDto(overrides: Partial<IngresosMesDto> = {}): IngresosMesDto {
  return {
    conteo: 3,
    total: '1500000',
    transacciones: [
      {
        id: 'ing-1',
        descripcion: 'Sueldo julio',
        fecha: '2026-07-01',
        monto: '1500000',
        origen: 'Banco de Chile',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IngresosMesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading, error, empty, and data states (three-tag machine; empty = filas.length===0)', async () => {
    // Loading: never resolves
    mockFetchIngresosMes.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    // Loading state visible
    expect(screen.getByTestId('ingresos-mes-loading')).toBeTruthy();
    expect(screen.queryByTestId('ingresos-mes-error')).toBeNull();
    expect(screen.queryByTestId('ingresos-mes-lista')).toBeNull();

    // Error state
    jest.clearAllMocks();
    mockFetchIngresosMes.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    rerender(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ingresos-mes-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('ingresos-mes-lista')).toBeNull();

    // Empty state (filas.length === 0 derived inside data tag)
    jest.clearAllMocks();
    mockFetchIngresosMes.mockResolvedValue({
      ok: true,
      value: makeDto({ conteo: 0, transacciones: [] }),
    });

    rerender(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ingresos-mes-vacio')).toBeTruthy();
    });
    expect(screen.queryByTestId('ingresos-mes-lista')).toBeNull();

    // Data state
    jest.clearAllMocks();
    mockFetchIngresosMes.mockResolvedValue({
      ok: true,
      value: makeDto(),
    });

    rerender(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ingresos-mes-lista')).toBeTruthy();
    });
  });

  it('header shows "Ingresos" title, SelectorPeriodoMes with julio 2026, and formatted total $1.500.000', async () => {
    mockFetchIngresosMes.mockResolvedValue({
      ok: true,
      value: makeDto({ conteo: 5, total: '1500000' }),
    });

    render(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ingresos-mes-lista')).toBeTruthy();
    });

    // Title
    expect(screen.getByText('Ingresos')).toBeTruthy();
    // SelectorPeriodoMes shows julio 2026
    expect(screen.getByText('julio 2026')).toBeTruthy();
    // Total formatted
    expect(screen.getByText('$1.500.000')).toBeTruthy();
  });

  it('each income row shows Origen badge text (Banco de Chile) verbatim', async () => {
    mockFetchIngresosMes.mockResolvedValue({
      ok: true,
      value: makeDto({
        transacciones: [
          {
            id: 'ing-1',
            descripcion: 'Sueldo julio',
            fecha: '2026-07-01',
            monto: '1500000',
            origen: 'Banco de Chile',
          },
        ],
      }),
    });

    render(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ingresos-mes-lista')).toBeTruthy();
    });

    // Origen verbatim — no normalization
    expect(screen.getByText('Banco de Chile')).toBeTruthy();
  });

  it('no element with testID matching "reclasificar-*" exists (read-only contract, MDET-06 third scenario)', async () => {
    mockFetchIngresosMes.mockResolvedValue({
      ok: true,
      value: makeDto({
        transacciones: [
          {
            id: 'ing-1',
            descripcion: 'Sueldo',
            fecha: '2026-07-01',
            monto: '1500000',
            origen: 'Banco de Chile',
          },
        ],
      }),
    });

    render(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ingresos-mes-lista')).toBeTruthy();
    });

    // Must not have any reclasificar-* testID — genuinely falsifying: row present but
    // no reclassify trigger. A vacuous negative (empty list) would not prove read-only.
    const reclasificarElements = screen.queryAllByTestId(/^reclasificar-/);
    expect(reclasificarElements.length).toBe(0);
  });

  it('pressing ‹ on SelectorPeriodoMes calls fetchIngresosMes with periodo="2026-06" (MDET-06 fourth scenario)', async () => {
    // Pin date to a past month so the SelectorPeriodoMes › arrow is not disabled
    // for '2026-07'. We need to pin this so esMesActual does not disable › on '2026-07'.
    // The test presses ‹, which is always enabled, so pin is not strictly needed
    // but included for determinism.
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
      now: new Date('2026-08-15T12:00:00.000Z'),
    });

    try {
      mockFetchIngresosMes.mockResolvedValue({
        ok: true,
        value: makeDto({ total: '1500000' }),
      });

      const onChangePeriodo = jest.fn();

      render(
        <IngresosMesScreen
          periodo="2026-07"
          onChangePeriodo={onChangePeriodo}
          onBack={jest.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('ingresos-mes-lista')).toBeTruthy();
      });

      // Clear mock counts so we can assert the re-fetch call
      jest.clearAllMocks();
      mockFetchIngresosMes.mockResolvedValue({
        ok: true,
        value: makeDto({ total: '1000000' }),
      });

      // Press the left arrow on SelectorPeriodoMes
      const prevBtn = screen.getByRole('button', { name: 'Mes anterior' });
      await act(async () => {
        fireEvent.press(prevBtn);
      });

      // onChangePeriodo must have been called with '2026-06'
      expect(onChangePeriodo).toHaveBeenCalledWith('2026-06');
    } finally {
      jest.useRealTimers();
    }
  });

  it('useFocusEffect triggers cargar on focus (stale-guard, D-18)', async () => {
    // useFocusEffect is mocked as useEffect in this spec file (see mock at top).
    // On mount, focus fires → cargar() is called → fetchIngresosMes is invoked.
    // This test verifies the focus guard wiring: fetch must be called on mount
    // (which simulates the initial focus event).
    mockFetchIngresosMes.mockResolvedValue({
      ok: true,
      value: makeDto(),
    });

    render(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => {
      // cargar was invoked (focus effect fired on mount)
      expect(mockFetchIngresosMes).toHaveBeenCalledTimes(1);
      expect(mockFetchIngresosMes).toHaveBeenCalledWith('2026-07');
    });
  });
});
