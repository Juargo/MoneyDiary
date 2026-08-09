import {
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react-native';
import type {
  ApiResult,
  AuthCapabilitiesDto,
  LoginResponseDto,
} from '../src/api/client';

// Import after jest.mock is registered.
import Login from './login';

// RED-first (Slice 4 §4.3, MOB-01): `postLogin` and `guardarToken` are
// mocked at the module boundary so the login screen's own state wiring is
// what's under test — never a real fetch or SecureStore call. Navigation is
// no longer driven by `router.replace` (Slice 4 fix, review finding #1/#2):
// `useSession().signIn` flips the synchronous auth-context guard, and
// `Stack.Protected` (tested for real in
// `test/auth-navigation.integration.spec.tsx`) does the actual navigating.
const mockPostLogin = jest.fn<
  Promise<ApiResult<LoginResponseDto>>,
  [string, string]
>();
const mockPostGoogleIdToken = jest.fn<
  Promise<ApiResult<LoginResponseDto>>,
  [string]
>();
const mockFetchAuthCapabilities = jest.fn<
  Promise<ApiResult<AuthCapabilitiesDto>>,
  []
>();
const mockGuardarToken = jest.fn<Promise<void>, [string]>();
const mockSignIn = jest.fn<void, [string]>();
const mockObtenerIdToken = jest.fn<Promise<string | null>, []>();

jest.mock('../src/api/client', () => ({
  postLogin: (email: string, password: string) =>
    mockPostLogin(email, password),
  postGoogleIdToken: (idToken: string) => mockPostGoogleIdToken(idToken),
  fetchAuthCapabilities: () => mockFetchAuthCapabilities(),
}));

jest.mock('../src/api/session-store', () => ({
  guardarToken: (token: string) => mockGuardarToken(token),
}));

jest.mock('../src/api/session-context', () => ({
  useSession: () => ({ signIn: mockSignIn }),
}));

// `listo` defaults to `true` (request ready) — the "request not ready" test
// flips it via the exported `__setListo` test helper (jest.mock factories
// return plain, writable objects; `mockObtenerIdToken` is reachable here
// because babel-plugin-jest-hoist allowlists `mock`-prefixed identifiers).
jest.mock('../src/api/use-google-id-token', () => {
  const estado = { listo: true };
  return {
    __setListo: (value: boolean) => {
      estado.listo = value;
    },
    useGoogleIdToken: () => ({
      listo: estado.listo,
      obtenerIdToken: mockObtenerIdToken,
    }),
  };
});

// `GOOGLE_CLIENT_ID_ANDROID` defaults to configured — the "client ID absent"
// test overrides this module's export directly (jest.mock factories return
// plain, writable objects).
jest.mock('../src/api/config', () => ({
  GOOGLE_CLIENT_ID_ANDROID: 'a-client-id.apps.googleusercontent.com',
}));

const successResponse: LoginResponseDto = {
  token: 'session-token',
  userId: 'user-1',
  expiresAt: '2026-07-25T00:00:00.000Z',
};

const capabilitiesAllOn: AuthCapabilitiesDto = {
  googleLoginEnabled: true,
  googleLoginMobileEnabled: true,
};

// Deferred promise so the in-flight state is observable before resolution
// (double-submit guard test needs this — mirrors app/index.spec.tsx).
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Login screen (MOB-01)', () => {
  beforeEach(() => {
    mockPostLogin.mockReset();
    mockPostGoogleIdToken.mockReset();
    mockFetchAuthCapabilities
      .mockReset()
      .mockResolvedValue({ ok: true, value: capabilitiesAllOn });
    mockGuardarToken.mockReset().mockResolvedValue(undefined);
    mockSignIn.mockReset();
    mockObtenerIdToken.mockReset();
    jest.requireMock('../src/api/config').GOOGLE_CLIENT_ID_ANDROID =
      'a-client-id.apps.googleusercontent.com';
    jest.requireMock('../src/api/use-google-id-token').__setListo(true);
  });

  it('renders email and password inputs and a submit affordance', async () => {
    await render(<Login />);

    expect(screen.getByTestId('login-email')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password')).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit')).toBeOnTheScreen();
  });

  it('hides the password by default and reveals it when the toggle is pressed', async () => {
    await render(<Login />);

    const toggle = screen.getByTestId('login-password-toggle');

    // Hidden by default — secureTextEntry masks the field.
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(
      true,
    );
    expect(screen.getByLabelText('Mostrar contraseña')).toBeOnTheScreen();

    await fireEvent.press(toggle);
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(
      false,
    );
    expect(screen.getByLabelText('Ocultar contraseña')).toBeOnTheScreen();

    // Tapping again re-masks it.
    await fireEvent.press(screen.getByTestId('login-password-toggle'));
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(
      true,
    );
  });

  it('submits the typed credentials to postLogin, stores the token, and signs in on success', async () => {
    mockPostLogin.mockResolvedValue({ ok: true, value: successResponse });

    await render(<Login />);

    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(mockPostLogin).toHaveBeenCalledWith('a@b.com', 'secret'),
    );
    expect(mockGuardarToken).toHaveBeenCalledWith('session-token');
    expect(mockSignIn).toHaveBeenCalledWith('session-token');
  });

  it('shows a generic error and does NOT store a token or sign in on failure', async () => {
    mockPostLogin.mockResolvedValue({
      ok: false,
      error: { tag: 'unauthorized' },
    });

    await render(<Login />);

    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrong');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'No pudimos iniciar sesión. Verifica tus datos e intenta de nuevo.',
        ),
      ).toBeOnTheScreen(),
    );
    expect(mockGuardarToken).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // REL MEDIUM (review finding): `disabled={enviando}` lags a frame behind
  // state, so a fast double-tap can fire `postLogin` twice. The handler
  // itself must guard against a second submit while one is in flight.
  it('ignores a second submit while the first is still in flight (double-tap guard)', async () => {
    const d = deferred<ApiResult<LoginResponseDto>>();
    mockPostLogin.mockReturnValue(d.promise);

    await render(<Login />);

    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret');

    await fireEvent.press(screen.getByTestId('login-submit'));
    await fireEvent.press(screen.getByTestId('login-submit'));

    d.resolve({ ok: true, value: successResponse });
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());

    expect(mockPostLogin).toHaveBeenCalledTimes(1);
  });
});

// RED-first (C2.5/C2.6, MOB-06 §9.2/§9.3): the Google button is gated by
// THREE independent, fail-closed conditions — capabilities flag, configured
// client ID, and a ready auth request. All three must hold for the button to
// render; capabilities are fetched once on mount with no retry.
describe('Login screen — Google sign-in (MOB-06)', () => {
  beforeEach(() => {
    mockPostLogin.mockReset();
    mockPostGoogleIdToken.mockReset();
    mockFetchAuthCapabilities
      .mockReset()
      .mockResolvedValue({ ok: true, value: capabilitiesAllOn });
    mockGuardarToken.mockReset().mockResolvedValue(undefined);
    mockSignIn.mockReset();
    mockObtenerIdToken.mockReset();
    jest.requireMock('../src/api/config').GOOGLE_CLIENT_ID_ANDROID =
      'a-client-id.apps.googleusercontent.com';
    jest.requireMock('../src/api/use-google-id-token').__setListo(true);
  });

  it('renders the Google button when all three conditions hold', async () => {
    await render(<Login />);

    await waitFor(() =>
      expect(screen.getByTestId('login-google')).toBeOnTheScreen(),
    );
  });

  it('hides the Google button when the capabilities fetch fails (fail-closed, no retry)', async () => {
    mockFetchAuthCapabilities.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<Login />);

    await waitFor(() => expect(mockFetchAuthCapabilities).toHaveBeenCalled());
    expect(screen.queryByTestId('login-google')).toBeNull();
  });

  it('hides the Google button when the mobile flag is false', async () => {
    mockFetchAuthCapabilities.mockResolvedValue({
      ok: true,
      value: { googleLoginEnabled: true, googleLoginMobileEnabled: false },
    });

    await render(<Login />);

    await waitFor(() => expect(mockFetchAuthCapabilities).toHaveBeenCalled());
    expect(screen.queryByTestId('login-google')).toBeNull();
  });

  it('hides the Google button when GOOGLE_CLIENT_ID_ANDROID is not configured', async () => {
    jest.requireMock('../src/api/config').GOOGLE_CLIENT_ID_ANDROID = undefined;

    await render(<Login />);

    await waitFor(() => expect(mockFetchAuthCapabilities).toHaveBeenCalled());
    expect(screen.queryByTestId('login-google')).toBeNull();
  });

  it('hides the Google button when the auth request is not ready', async () => {
    jest.requireMock('../src/api/use-google-id-token').__setListo(false);

    await render(<Login />);

    await waitFor(() => expect(mockFetchAuthCapabilities).toHaveBeenCalled());
    expect(screen.queryByTestId('login-google')).toBeNull();
  });

  it('success path: obtains an id token, exchanges it, stores the session, and signs in', async () => {
    mockObtenerIdToken.mockResolvedValue('a-real-id-token');
    mockPostGoogleIdToken.mockResolvedValue({
      ok: true,
      value: successResponse,
    });

    await render(<Login />);
    await waitFor(() =>
      expect(screen.getByTestId('login-google')).toBeOnTheScreen(),
    );

    await fireEvent.press(screen.getByTestId('login-google'));

    await waitFor(() =>
      expect(mockPostGoogleIdToken).toHaveBeenCalledWith('a-real-id-token'),
    );
    expect(mockGuardarToken).toHaveBeenCalledWith('session-token');
    expect(mockSignIn).toHaveBeenCalledWith('session-token');
  });

  it('shows the same generic error and writes no token when obtenerIdToken resolves null (cancel/error)', async () => {
    mockObtenerIdToken.mockResolvedValue(null);

    await render(<Login />);
    await waitFor(() =>
      expect(screen.getByTestId('login-google')).toBeOnTheScreen(),
    );

    await fireEvent.press(screen.getByTestId('login-google'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'No pudimos iniciar sesión. Verifica tus datos e intenta de nuevo.',
        ),
      ).toBeOnTheScreen(),
    );
    expect(mockPostGoogleIdToken).not.toHaveBeenCalled();
    expect(mockGuardarToken).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows the same generic error and writes no token when the API rejects the id token (401)', async () => {
    mockObtenerIdToken.mockResolvedValue('a-real-id-token');
    mockPostGoogleIdToken.mockResolvedValue({
      ok: false,
      error: { tag: 'unauthorized' },
    });

    await render(<Login />);
    await waitFor(() =>
      expect(screen.getByTestId('login-google')).toBeOnTheScreen(),
    );

    await fireEvent.press(screen.getByTestId('login-google'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'No pudimos iniciar sesión. Verifica tus datos e intenta de nuevo.',
        ),
      ).toBeOnTheScreen(),
    );
    expect(mockGuardarToken).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // Same double-tap guard as password login: a second press while
  // `submitting` is a no-op (design §9.2, review carry-over #1).
  it('ignores a second Google press while the first is still in flight (double-tap guard)', async () => {
    const d = deferred<string | null>();
    mockObtenerIdToken.mockReturnValue(d.promise);

    await render(<Login />);
    await waitFor(() =>
      expect(screen.getByTestId('login-google')).toBeOnTheScreen(),
    );

    await fireEvent.press(screen.getByTestId('login-google'));
    await fireEvent.press(screen.getByTestId('login-google'));

    d.resolve('a-real-id-token');
    mockPostGoogleIdToken.mockResolvedValue({
      ok: true,
      value: successResponse,
    });
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());

    expect(mockObtenerIdToken).toHaveBeenCalledTimes(1);
  });
});
