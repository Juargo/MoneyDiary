/**
 * IngresosMesScreen spec — T-16 RED → T-17 GREEN (US-056, D-12/D-18/D-08/MDET-06)
 *
 * Six-plus test cases covering:
 * - Loading state (three-tag machine initial state)
 * - Error state
 * - Empty state (filas.length === 0, derived inside data tag — NOT a 4th tag)
 * - Data state with income rows
 * - Header content (title "Ingresos", SelectorPeriodoMes "julio 2026", total "+$1.500.000")
 * - Origen badge verbatim (no normalization)
 * - Read-only contract (no reclasificar-* testIDs with rows present — genuine negative)
 * - Period arrow re-fetch (onChangePeriodo called with '2026-06')
 * - useFocusEffect stale-guard (D-18) — fetch called on focus/mount
 *
 * NOTE on totalLabel: the VM uses `formatearMontoConSigno(dto.total, '+')` which
 * produces '+$1.500.000' for 1500000 (non-zero amounts get the '+' sign per
 * D-22/ingresos-mes-view-model.spec.ts line 57). The MDET-06 spec says "$1.500.000"
 * but DESIGN (D-22) wins per the ARTIFACT AUTHORITY RULE — we pin "+$1.500.000".
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

  it('shows loading state while fetchIngresosMes is in flight (three-tag machine)', async () => {
    // Never resolves — keeps the component in loading state
    mockFetchIngresosMes.mockReturnValue(new Promise(() => {}));

    render(
      <IngresosMesScreen
        periodo="2026-07"
        onChangePeriodo={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    // Loading indicator must be visible
    await waitFor(() => {
      expect(screen.getByTestId('ingresos-mes-loading')).toBeTruthy();
    });
    expect(screen.queryByTestId('ingresos-mes-error')).toBeNull();
    expect(screen.queryByTestId('ingresos-mes-lista')).toBeNull();
  });

  it('shows error copy and no stale data on failure (three-tag machine error state)', async () => {
    mockFetchIngresosMes.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    render(
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
  });

  it('shows empty-state message when filas.length === 0 (derived from data tag, NOT a fourth state tag)', async () => {
    mockFetchIngresosMes.mockResolvedValue({
      ok: true,
      value: makeDto({ conteo: 0, transacciones: [] }),
    });

    render(
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
  });

  it('header shows "Ingresos" title, SelectorPeriodoMes with julio 2026, and formatted total +$1.500.000', async () => {
    // NOTE: totalLabel = formatearMontoConSigno(dto.total, '+') = '+$1.500.000'
    // (non-zero income amounts get the '+' sign per D-22 / VM contract).
    // MDET-06 spec says "$1.500.000" but DESIGN (D-22) is authoritative per
    // ARTIFACT AUTHORITY RULE — the actual rendered value is '+$1.500.000'.
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
    // Total formatted with sign (D-22 / formatearMontoConSigno).
    // Multiple elements may show the same amount (header total + row montoLabel)
    // so use getAllByText and assert at least one exists.
    expect(screen.getAllByText('+$1.500.000').length).toBeGreaterThan(0);
  });

  it('each income row shows Origen badge text (Banco de Chile) verbatim (no normalization)', async () => {
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

    // Origen verbatim — no normalization (WDI-06 / server is authority)
    expect(screen.getByText('Banco de Chile')).toBeTruthy();
  });

  it('no element with testID matching "reclasificar-*" exists (read-only contract, MDET-06 third scenario)', async () => {
    // This is a GENUINE negative: rows ARE present, but NO reclassify trigger.
    // A vacuous negative on an empty list would not prove read-only.
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

    // No reclassify trigger with rows present — this is the genuinely falsifying assertion
    const reclasificarElements = screen.queryAllByTestId(/^reclasificar-/);
    expect(reclasificarElements.length).toBe(0);
  });

  it('pressing ‹ on SelectorPeriodoMes calls onChangePeriodo with "2026-06" (MDET-06 fourth scenario)', async () => {
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

      // Press the left arrow on SelectorPeriodoMes
      const prevBtn = screen.getByRole('button', { name: 'Mes anterior' });
      await act(async () => {
        fireEvent.press(prevBtn);
      });

      // onChangePeriodo must have been called with '2026-06' by SelectorPeriodoMes
      expect(onChangePeriodo).toHaveBeenCalledWith('2026-06');
    } finally {
      jest.useRealTimers();
    }
  });

  it('useFocusEffect triggers cargar on focus (stale-guard, D-18)', async () => {
    // useFocusEffect is mocked as useEffect in this spec file (see mock at top).
    // On mount, focus fires → cargar() is called → fetchIngresosMes is invoked.
    // This test verifies the focus guard wiring: fetch must be called on mount
    // (which simulates the initial focus event). One call on mount = one cargar.
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
