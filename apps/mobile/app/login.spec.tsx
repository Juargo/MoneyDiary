import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import type { ApiResult, LoginResponseDto } from '../src/api/client';

// RED-first (Slice 4 §4.3, MOB-01): `postLogin` and `guardarToken` are
// mocked at the module boundary so the login screen's own state wiring is
// what's under test — never a real fetch or SecureStore call. Navigation is
// no longer driven by `router.replace` (Slice 4 fix, review finding #1/#2):
// `useSession().signIn` flips the synchronous auth-context guard, and
// `Stack.Protected` (tested for real in
// `test/auth-navigation.integration.spec.tsx`) does the actual navigating.
const mockPostLogin = jest.fn<Promise<ApiResult<LoginResponseDto>>, [string, string]>();
const mockGuardarToken = jest.fn<Promise<void>, [string]>();
const mockSignIn = jest.fn<void, [string]>();

jest.mock('../src/api/client', () => ({
  postLogin: (email: string, password: string) => mockPostLogin(email, password),
}));

jest.mock('../src/api/session-store', () => ({
  guardarToken: (token: string) => mockGuardarToken(token),
}));

jest.mock('../src/api/session-context', () => ({
  useSession: () => ({ signIn: mockSignIn }),
}));

// Import after jest.mock is registered.
import Login from './login';

const successResponse: LoginResponseDto = {
  token: 'session-token',
  userId: 'user-1',
  expiresAt: '2026-07-25T00:00:00.000Z',
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
    mockGuardarToken.mockReset().mockResolvedValue(undefined);
    mockSignIn.mockReset();
  });

  it('renders email and password inputs and a submit affordance', async () => {
    await render(<Login />);

    expect(screen.getByTestId('login-email')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password')).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit')).toBeOnTheScreen();
  });

  it('submits the typed credentials to postLogin, stores the token, and signs in on success', async () => {
    mockPostLogin.mockResolvedValue({ ok: true, value: successResponse });

    await render(<Login />);

    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mockPostLogin).toHaveBeenCalledWith('a@b.com', 'secret'));
    expect(mockGuardarToken).toHaveBeenCalledWith('session-token');
    expect(mockSignIn).toHaveBeenCalledWith('session-token');
  });

  it('shows a generic error and does NOT store a token or sign in on failure', async () => {
    mockPostLogin.mockResolvedValue({ ok: false, error: { tag: 'unauthorized' } });

    await render(<Login />);

    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrong');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(
        screen.getByText('No pudimos iniciar sesión. Verifica tus datos e intenta de nuevo.'),
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
