import { renderHook } from '@testing-library/react-native';
import type { AuthRequest } from 'expo-auth-session';
import { NETWORK_LEG_TIMEOUT_MS } from './con-timeout';

/**
 * `expo-auth-session` reaches a real native boundary (Custom Tabs, PKCE
 * crypto) that jest-expo cannot exercise — mocking at this module boundary
 * is the only option and is the documented approach (design.md §11.3).
 * `use-google-id-token.ts` is the ONLY file importing `expo-auth-session`.
 */
const mockUseAutoDiscovery = jest.fn();
const mockUseAuthRequest = jest.fn();
const mockExchangeCodeAsync = jest.fn();
const mockMakeRedirectUri = jest.fn();

jest.mock('expo-auth-session', () => ({
  useAutoDiscovery: (...args: unknown[]) => mockUseAutoDiscovery(...args),
  useAuthRequest: (...args: unknown[]) => mockUseAuthRequest(...args),
  exchangeCodeAsync: (...args: unknown[]) => mockExchangeCodeAsync(...args),
  makeRedirectUri: (...args: unknown[]) => mockMakeRedirectUri(...args),
}));

const ORIGINAL_ENV = process.env;
const FAKE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/auth',
};
const FAKE_REDIRECT_URI = 'cl.moneydiary.app:/oauthredirect';
const FAKE_REQUEST = { codeVerifier: 'a-code-verifier' } as AuthRequest;

/**
 * `config.ts` reads `process.env` at module-load time, so — like
 * `client.spec.ts` — every test resets the module registry and re-requires
 * the hook under test.
 */
function requireHook(): typeof import('./use-google-id-token') {
  return jest.requireActual('./use-google-id-token');
}

describe('useGoogleIdToken', () => {
  beforeEach(() => {
    jest.resetModules();
    mockUseAutoDiscovery.mockReset().mockReturnValue(FAKE_DISCOVERY);
    mockMakeRedirectUri.mockReset().mockReturnValue(FAKE_REDIRECT_URI);
    mockUseAuthRequest
      .mockReset()
      .mockReturnValue([
        FAKE_REQUEST,
        null,
        jest.fn().mockResolvedValue({ type: 'cancel' }),
      ]);
    mockExchangeCodeAsync.mockReset();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('calls useAuthRequest with clientId "" and reports listo:false when GOOGLE_CLIENT_ID_ANDROID is absent (hooks cannot be called conditionally, design §9.1)', async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
    mockUseAuthRequest.mockReturnValue([null, null, jest.fn()]);
    const { useGoogleIdToken } = requireHook();

    const { result } = await renderHook(() => useGoogleIdToken());

    expect(mockUseAuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: '' }),
      FAKE_DISCOVERY,
    );
    expect(result.current.listo).toBe(false);
  });

  it('reports listo:true once useAuthRequest resolves a request object', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        '12345-android.apps.googleusercontent.com',
    };
    const { useGoogleIdToken } = requireHook();

    const { result } = await renderHook(() => useGoogleIdToken());

    expect(mockUseAuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: '12345-android.apps.googleusercontent.com',
        scopes: ['openid', 'email', 'profile'],
        responseType: 'code',
        usePKCE: true,
        redirectUri: FAKE_REDIRECT_URI,
      }),
      FAKE_DISCOVERY,
    );
    expect(result.current.listo).toBe(true);
  });

  it.each([
    ['dismiss', { type: 'dismiss' }],
    ['cancel', { type: 'cancel' }],
    ['error', { type: 'error', errorCode: 'access_denied', params: {} }],
  ])(
    'obtenerIdToken resolves null on promptAsync %s, without calling exchangeCodeAsync',
    async (_label, promptResult) => {
      process.env = {
        ...ORIGINAL_ENV,
        EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
          'a-client-id.apps.googleusercontent.com',
      };
      const promptAsync = jest.fn().mockResolvedValue(promptResult);
      mockUseAuthRequest.mockReturnValue([FAKE_REQUEST, null, promptAsync]);
      const { useGoogleIdToken } = requireHook();
      const { result } = await renderHook(() => useGoogleIdToken());

      const idToken = await result.current.obtenerIdToken();

      expect(idToken).toBeNull();
      expect(mockExchangeCodeAsync).not.toHaveBeenCalled();
    },
  );

  it('obtenerIdToken resolves null (never throws) when promptAsync itself rejects', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        'a-client-id.apps.googleusercontent.com',
    };
    const promptAsync = jest
      .fn()
      .mockRejectedValue(new Error('native failure'));
    mockUseAuthRequest.mockReturnValue([FAKE_REQUEST, null, promptAsync]);
    const { useGoogleIdToken } = requireHook();
    const { result } = await renderHook(() => useGoogleIdToken());

    const idToken = await result.current.obtenerIdToken();

    expect(idToken).toBeNull();
  });

  it('obtenerIdToken resolves null (never throws) when exchangeCodeAsync throws', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        'a-client-id.apps.googleusercontent.com',
    };
    const promptAsync = jest
      .fn()
      .mockResolvedValue({ type: 'success', params: { code: 'auth-code' } });
    mockUseAuthRequest.mockReturnValue([FAKE_REQUEST, null, promptAsync]);
    mockExchangeCodeAsync.mockRejectedValue(new Error('token endpoint down'));
    const { useGoogleIdToken } = requireHook();
    const { result } = await renderHook(() => useGoogleIdToken());

    const idToken = await result.current.obtenerIdToken();

    expect(idToken).toBeNull();
    expect(mockExchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'a-client-id.apps.googleusercontent.com',
        code: 'auth-code',
        redirectUri: FAKE_REDIRECT_URI,
        extraParams: { code_verifier: 'a-code-verifier' },
      }),
      FAKE_DISCOVERY,
    );
  });

  it('obtenerIdToken resolves null when the token response has no idToken', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        'a-client-id.apps.googleusercontent.com',
    };
    const promptAsync = jest
      .fn()
      .mockResolvedValue({ type: 'success', params: { code: 'auth-code' } });
    mockUseAuthRequest.mockReturnValue([FAKE_REQUEST, null, promptAsync]);
    mockExchangeCodeAsync.mockResolvedValue({ accessToken: 'irrelevant' });
    const { useGoogleIdToken } = requireHook();
    const { result } = await renderHook(() => useGoogleIdToken());

    const idToken = await result.current.obtenerIdToken();

    expect(idToken).toBeNull();
  });

  it('obtenerIdToken resolves the idToken on the happy path', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        'a-client-id.apps.googleusercontent.com',
    };
    const promptAsync = jest
      .fn()
      .mockResolvedValue({ type: 'success', params: { code: 'auth-code' } });
    mockUseAuthRequest.mockReturnValue([FAKE_REQUEST, null, promptAsync]);
    mockExchangeCodeAsync.mockResolvedValue({ idToken: 'a-real-id-token' });
    const { useGoogleIdToken } = requireHook();
    const { result } = await renderHook(() => useGoogleIdToken());

    const idToken = await result.current.obtenerIdToken();

    expect(idToken).toBe('a-real-id-token');
    expect(mockMakeRedirectUri).toHaveBeenCalledWith({
      scheme: 'com.googleusercontent.apps.12345-android',
      path: 'oauthredirect',
    });
    expect(mockUseAutoDiscovery).toHaveBeenCalledWith(
      'https://accounts.google.com',
    );
  });

  it('obtenerIdToken omits extraParams when the request has no codeVerifier', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        'a-client-id.apps.googleusercontent.com',
    };
    const promptAsync = jest
      .fn()
      .mockResolvedValue({ type: 'success', params: { code: 'auth-code' } });
    const requestWithoutVerifier = { codeVerifier: undefined } as AuthRequest;
    mockUseAuthRequest.mockReturnValue([
      requestWithoutVerifier,
      null,
      promptAsync,
    ]);
    mockExchangeCodeAsync.mockResolvedValue({ idToken: 'a-real-id-token' });
    const { useGoogleIdToken } = requireHook();
    const { result } = await renderHook(() => useGoogleIdToken());

    await result.current.obtenerIdToken();

    expect(mockExchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ extraParams: undefined }),
      FAKE_DISCOVERY,
    );
  });

  it('obtenerIdToken resolves null without prompting when the request is not ready', async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
    const promptAsync = jest.fn();
    mockUseAuthRequest.mockReturnValue([null, null, promptAsync]);
    const { useGoogleIdToken } = requireHook();
    const { result } = await renderHook(() => useGoogleIdToken());

    const idToken = await result.current.obtenerIdToken();

    expect(idToken).toBeNull();
    expect(promptAsync).not.toHaveBeenCalled();
  });

  // FIX 1 (CRITICAL, design §9.4): `exchangeCodeAsync` is a bounded network
  // leg — a hung token endpoint must not lock the login screen forever.
  // `promptAsync` itself is deliberately NOT bounded (user-driven, Custom
  // Tab dismissal already resolves it) — only the exchange leg times out.
  it('obtenerIdToken resolves null within the timeout budget when exchangeCodeAsync hangs (bounded network leg)', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        'a-client-id.apps.googleusercontent.com',
    };
    const promptAsync = jest
      .fn()
      .mockResolvedValue({ type: 'success', params: { code: 'auth-code' } });
    mockUseAuthRequest.mockReturnValue([FAKE_REQUEST, null, promptAsync]);
    // Never resolves — simulates a hung token endpoint.
    mockExchangeCodeAsync.mockReturnValue(new Promise(() => {}));
    const { useGoogleIdToken } = requireHook();
    const { result } = await renderHook(() => useGoogleIdToken());

    // Fake timers are enabled only around the timed leg itself — enabling
    // them before `renderHook` starves React's scheduler of the real timers
    // it needs to flush effects.
    jest.useFakeTimers();
    try {
      const idTokenPromise = result.current.obtenerIdToken();
      // `obtenerIdToken` awaits `promptAsync()` (a microtask) BEFORE the
      // `conTimeout` timer is even created, so a plain `advanceTimersByTime`
      // would run before the timer exists. `advanceTimersByTimeAsync`
      // interleaves microtask flushes with timer advancement, which lets
      // the timer get created and then fire within the same call.
      await jest.advanceTimersByTimeAsync(NETWORK_LEG_TIMEOUT_MS);

      await expect(idTokenPromise).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
