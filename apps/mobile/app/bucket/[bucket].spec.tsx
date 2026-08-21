/**
 * bucket/[bucket] route spec — T-10 RED (US-056, D-12/MDET-01)
 *
 * Tests the route-level state machine: useLocalSearchParams drives fetch,
 * period arrows re-fetch, back button calls router.back().
 *
 * All cases MUST fail RED before the real route replaces the PR1 stub (T-12).
 */

import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import type { ApiResult } from '../../src/api/client';
import type { DetalleBucketMesDto } from '../../src/domain/detalle.types';

import BucketDetallePage from './[bucket]';

const mockFetchDetalleBucketMes = jest.fn<
  Promise<ApiResult<DetalleBucketMesDto>>,
  [string, string?]
>();

jest.mock('../../src/api/client', () => ({
  ...jest.requireActual('../../src/api/client'),
  fetchDetalleBucketMes: (bucket: string, periodo?: string) =>
    mockFetchDetalleBucketMes(bucket, periodo),
}));

const mockRouterBack = jest.fn();
const mockUseLocalSearchParams = jest.fn<
  { bucket?: string; destacar?: string; periodo?: string },
  []
>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

function makeDto(
  overrides: Partial<DetalleBucketMesDto> = {},
): DetalleBucketMesDto {
  return {
    bucket: 'Necesidades',
    periodo: '2026-07',
    total: '200000',
    totalTransacciones: 2,
    totalCategorias: 1,
    porcentajeBp: 4500,
    metaBp: 5000,
    grupos: [
      {
        categoriaId: 'cat-a',
        nombre: 'Alimentación',
        conteo: 2,
        subtotal: '200000',
        transacciones: [
          {
            id: 'tx-a1',
            descripcion: 'Supermercado',
            fecha: '2026-07-02',
            monto: '100000',
          },
          {
            id: 'tx-a2',
            descripcion: 'Feria',
            fecha: '2026-07-08',
            monto: '100000',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('bucket/[bucket] route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('useLocalSearchParams drives fetchDetalleBucketMes with bucket and periodo', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      bucket: 'Necesidades',
      periodo: '2026-07',
    });
    mockFetchDetalleBucketMes.mockResolvedValue({ ok: true, value: makeDto() });

    render(<BucketDetallePage />);

    await waitFor(() => {
      expect(mockFetchDetalleBucketMes).toHaveBeenCalledWith(
        'Necesidades',
        '2026-07',
      );
    });
  });

  it('periodo state steps on SelectorPeriodoMes arrow press → re-fetch fires', async () => {
    // Pin date to a past month so next arrow is not disabled for '2026-07'
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
      mockUseLocalSearchParams.mockReturnValue({
        bucket: 'Necesidades',
        periodo: '2026-07',
      });
      mockFetchDetalleBucketMes.mockResolvedValue({
        ok: true,
        value: makeDto(),
      });

      render(<BucketDetallePage />);

      // Wait for initial fetch
      await waitFor(() => {
        expect(mockFetchDetalleBucketMes).toHaveBeenCalledWith(
          'Necesidades',
          '2026-07',
        );
      });

      // Press the back (previous month) arrow on SelectorPeriodoMes
      const prevBtn = screen.getByRole('button', { name: 'Mes anterior' });
      await act(async () => {
        fireEvent.press(prevBtn);
      });

      // Re-fetch fires with new periodo
      await waitFor(() => {
        expect(mockFetchDetalleBucketMes).toHaveBeenCalledWith(
          'Necesidades',
          '2026-06',
        );
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('back Pressable calls router.back', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      bucket: 'Necesidades',
      periodo: '2026-07',
    });
    // Keep loading so the page renders quickly
    mockFetchDetalleBucketMes.mockReturnValue(new Promise(() => {}));

    render(<BucketDetallePage />);

    const backBtn = screen.getByRole('button', { name: 'Volver al resumen' });
    fireEvent.press(backBtn);

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});
