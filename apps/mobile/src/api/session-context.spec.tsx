import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ApiResult } from './client';
import type { MeDto } from '../domain/resumen.types';

// RED-first (Slice 4 fix — root-cause bug §review finding #1/#2): replaces
// the old pathname-keyed `use-session-gate.spec.ts`. `signIn`/`signOut` MUST
// flip `estado` synchronously (a plain `setState`), not depend on any
// external re-trigger (previously `usePathname()`), because
// `Stack.Protected` in `app/_layout.tsx` re-renders on every context value
// change — a pathname-keyed effect never re-ran after a sibling screen
// stored a token, which is exactly the deadlock this fix closes.
const mockLeerToken = jest.fn<Promise<string | null>, []>();
const mockBorrarToken = jest.fn<Promise<void>, []>();
const mockFetchMe = jest.fn<Promise<ApiResult<MeDto>>, []>();

jest.mock('./session-store', () => ({
  leerToken: () => mockLeerToken(),
  borrarToken: () => mockBorrarToken(),
}));

jest.mock('./client', () => ({
  fetchMe: () => mockFetchMe(),
}));

// Import after jest.mock is registered.
import { SessionProvider, useSession } from './session-context';

const meDto: MeDto = { userId: 'user-1', email: 'a@b.com' };

describe('SessionProvider / useSession (synchronous auth-context gate)', () => {
  beforeEach(() => {
    mockLeerToken.mockReset();
    mockBorrarToken.mockReset().mockResolvedValue(undefined);
    mockFetchMe.mockReset();
  });

  it('starts checking, then reports unauthenticated when no token is stored (cold start)', async () => {
    mockLeerToken.mockResolvedValue(null);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await waitFor(() => expect(result.current.estado).toBe('unauthenticated'));
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('validates a stored token via fetchMe (not fetchResumen) and reports authenticated when accepted', async () => {
    mockLeerToken.mockResolvedValue('valid-token');
    mockFetchMe.mockResolvedValue({ ok: true, value: meDto });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await waitFor(() => expect(result.current.estado).toBe('authenticated'));
    expect(mockFetchMe).toHaveBeenCalledTimes(1);
  });

  it('clears the token and reports unauthenticated when the stored token is rejected (401)', async () => {
    mockLeerToken.mockResolvedValue('stale-token');
    mockFetchMe.mockResolvedValue({ ok: false, error: { tag: 'unauthorized' } });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await waitFor(() => expect(result.current.estado).toBe('unauthenticated'));
    expect(mockBorrarToken).toHaveBeenCalled();
  });

  it('stays optimistically authenticated when fetchMe fails for a non-auth reason (network)', async () => {
    mockLeerToken.mockResolvedValue('valid-token');
    mockFetchMe.mockResolvedValue({ ok: false, error: { tag: 'network' } });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await waitFor(() => expect(result.current.estado).toBe('authenticated'));
    expect(mockBorrarToken).not.toHaveBeenCalled();
  });

  it('signIn flips estado to authenticated synchronously — no external re-trigger needed', async () => {
    mockLeerToken.mockResolvedValue(null);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.estado).toBe('unauthenticated'));

    await act(() => {
      result.current.signIn('new-token');
    });

    expect(result.current.estado).toBe('authenticated');
  });

  it('signOut flips estado to unauthenticated synchronously', async () => {
    mockLeerToken.mockResolvedValue('valid-token');
    mockFetchMe.mockResolvedValue({ ok: true, value: meDto });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.estado).toBe('authenticated'));

    await act(() => {
      result.current.signOut();
    });

    expect(result.current.estado).toBe('unauthenticated');
  });
});
