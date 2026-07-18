import { renderHook, waitFor } from '@testing-library/react-native';
import type { ApiResult } from './client';
import type { ResumenMesDto } from '../domain/resumen.types';

const mockLeerToken = jest.fn<Promise<string | null>, []>();
const mockBorrarToken = jest.fn<Promise<void>, []>();
const mockFetchResumen = jest.fn<Promise<ApiResult<ResumenMesDto>>, []>();

jest.mock('./session-store', () => ({
  leerToken: () => mockLeerToken(),
  borrarToken: () => mockBorrarToken(),
}));

jest.mock('./client', () => ({
  fetchResumen: () => mockFetchResumen(),
}));

// The gate lives in the root layout, which re-checks on every navigation
// (usePathname changes) — stubbed to a constant here since the hook is
// tested in isolation, outside any real router context.
jest.mock('expo-router', () => ({
  usePathname: () => '/',
}));

// Import after jest.mock is registered.
import { useSessionGate } from './use-session-gate';

const dto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
};

describe('useSessionGate (MOB-03)', () => {
  beforeEach(() => {
    mockLeerToken.mockReset();
    mockBorrarToken.mockReset().mockResolvedValue(undefined);
    mockFetchResumen.mockReset();
  });

  it('reports unauthenticated and never calls fetchResumen when no token is stored', async () => {
    mockLeerToken.mockResolvedValue(null);

    const { result } = await renderHook(() => useSessionGate());

    await waitFor(() => expect(result.current.estado).toBe('unauthenticated'));
    expect(mockFetchResumen).not.toHaveBeenCalled();
  });

  it('clears the token and reports unauthenticated when the stored token is rejected (401)', async () => {
    mockLeerToken.mockResolvedValue('stale-token');
    mockFetchResumen.mockResolvedValue({ ok: false, error: { tag: 'unauthorized' } });

    const { result } = await renderHook(() => useSessionGate());

    await waitFor(() => expect(result.current.estado).toBe('unauthenticated'));
    expect(mockBorrarToken).toHaveBeenCalled();
  });

  it('reports authenticated when the stored token is accepted', async () => {
    mockLeerToken.mockResolvedValue('valid-token');
    mockFetchResumen.mockResolvedValue({ ok: true, value: dto });

    const { result } = await renderHook(() => useSessionGate());

    await waitFor(() => expect(result.current.estado).toBe('authenticated'));
    expect(mockBorrarToken).not.toHaveBeenCalled();
  });
});
