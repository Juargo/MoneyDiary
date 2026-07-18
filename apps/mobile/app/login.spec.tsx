import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import type { ApiResult, LoginResponseDto } from '../src/api/client';

// RED-first (Slice 4 §4.3, MOB-01): `postLogin` and `guardarToken` are
// mocked at the module boundary so the login screen's own state wiring is
// what's under test — never a real fetch or SecureStore call.
const mockPostLogin = jest.fn<Promise<ApiResult<LoginResponseDto>>, [string, string]>();
const mockGuardarToken = jest.fn<Promise<void>, [string]>();
const mockReplace = jest.fn();

jest.mock('../src/api/client', () => ({
  postLogin: (email: string, password: string) => mockPostLogin(email, password),
}));

jest.mock('../src/api/session-store', () => ({
  guardarToken: (token: string) => mockGuardarToken(token),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Import after jest.mock is registered.
import Login from './login';

const successResponse: LoginResponseDto = {
  token: 'session-token',
  userId: 'user-1',
  expiresAt: '2026-07-25T00:00:00.000Z',
};

describe('Login screen (MOB-01)', () => {
  beforeEach(() => {
    mockPostLogin.mockReset();
    mockGuardarToken.mockReset().mockResolvedValue(undefined);
    mockReplace.mockReset();
  });

  it('renders email and password inputs and a submit affordance', async () => {
    await render(<Login />);

    expect(screen.getByTestId('login-email')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password')).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit')).toBeOnTheScreen();
  });

  it('submits the typed credentials to postLogin, stores the token, and navigates to / on success', async () => {
    mockPostLogin.mockResolvedValue({ ok: true, value: successResponse });

    await render(<Login />);

    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mockPostLogin).toHaveBeenCalledWith('a@b.com', 'secret'));
    expect(mockGuardarToken).toHaveBeenCalledWith('session-token');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('shows a generic error and does NOT store a token on failure', async () => {
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
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
