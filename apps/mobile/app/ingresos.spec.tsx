/**
 * ingresos route spec — T-16 RED (US-056, D-12/D-18/MDET-06)
 *
 * Three route-machine cases:
 * 1. useLocalSearchParams seeds periodo state from query param
 * 2. Arrow press steps periodo state → re-fetch fires
 * 3. back Pressable calls router.back
 *
 * Architecture: ingresos.tsx is a thin wrapper that reads params, owns local
 * periodo state, and passes them to IngresosMesScreen. The screen owns the
 * fetch lifecycle and useFocusEffect. This mirrors the M1 pattern
 * (bucket/[bucket].tsx → BucketDetalleScreen).
 */

import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import type { ApiResult } from '../src/api/client';
import type { IngresosMesDto } from '../src/domain/detalle.types';

import IngresosMesPage from './ingresos';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockFetchIngresosMes = jest.fn<
  Promise<ApiResult<IngresosMesDto>>,
  [string?]
>();

jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  fetchIngresosMes: (periodo?: string) => mockFetchIngresosMes(periodo),
}));

const mockRouterBack = jest.fn();
const mockUseLocalSearchParams = jest.fn<{ periodo?: string }, []>();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ back: mockRouterBack }),
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    useFocusEffect: (callback: () => void) => {
      useEffect(() => {
        callback();
      }, [callback]);
    },
  };
});

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeDto(overrides: Partial<IngresosMesDto> = {}): IngresosMesDto {
  return {
    conteo: 2,
    total: '500000',
    transacciones: [
      {
        id: 'ing-r1',
        descripcion: 'Sueldo',
        fecha: '2026-07-01',
        monto: '500000',
        origen: 'BancoEstado',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ingresos route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('useLocalSearchParams seeds periodo state from query param', async () => {
    mockUseLocalSearchParams.mockReturnValue({ periodo: '2026-07' });
    mockFetchIngresosMes.mockResolvedValue({ ok: true, value: makeDto() });

    render(<IngresosMesPage />);

    await waitFor(() => {
      expect(mockFetchIngresosMes).toHaveBeenCalledWith('2026-07');
    });
  });

  it('periodo state steps on SelectorPeriodoMes arrow press → re-fetch fires', async () => {
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
      mockUseLocalSearchParams.mockReturnValue({ periodo: '2026-07' });
      mockFetchIngresosMes.mockResolvedValue({ ok: true, value: makeDto() });

      render(<IngresosMesPage />);

      await waitFor(() => {
        expect(mockFetchIngresosMes).toHaveBeenCalledWith('2026-07');
      });

      jest.clearAllMocks();
      mockFetchIngresosMes.mockResolvedValue({ ok: true, value: makeDto() });

      const prevBtn = screen.getByRole('button', { name: 'Mes anterior' });
      await act(async () => {
        fireEvent.press(prevBtn);
      });

      await waitFor(() => {
        expect(mockFetchIngresosMes).toHaveBeenCalledWith('2026-06');
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('back Pressable calls router.back', async () => {
    mockUseLocalSearchParams.mockReturnValue({ periodo: '2026-07' });
    mockFetchIngresosMes.mockReturnValue(new Promise(() => {}));

    await render(<IngresosMesPage />);

    const backBtn = screen.getByRole('button', { name: 'Volver al resumen' });
    fireEvent.press(backBtn);

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});
