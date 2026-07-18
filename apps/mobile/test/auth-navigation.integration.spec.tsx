// `act`/`cleanup`/`fireEvent`/`screen`/`waitFor` come from
// `expo-router/testing-library` (NOT `@testing-library/react-native`
// directly): pnpm's isolated node_modules can resolve those two import
// specifiers to physically distinct copies of the RNTL package, which means
// a `screen` imported from the "wrong" copy is a different singleton than
// the one `renderRouter` renders into — `screen.getByTestId(...)` would
// then always see an empty/never-rendered tree. Importing everything from
// `expo-router/testing-library` guarantees the SAME instance `renderRouter`
// uses internally.
import { act, cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ApiResult, LoginResponseDto } from '../src/api/client';
import type { MeDto, ResumenMesDto } from '../src/domain/resumen.types';

/**
 * Real-navigation integration test (review finding #3 — the coverage gap
 * that hid the login/logout deadlock). Renders the ACTUAL `app/_layout.tsx`
 * + `app/login.tsx` + `app/index.tsx` wired through a real Expo Router
 * stack via `expo-router/testing-library`'s `renderRouter` — not a stubbed
 * `usePathname`. Only the network boundary (`src/api/client.ts`) and the
 * native `expo-secure-store` module are faked; `SessionProvider`'s
 * guard-flip drives navigation for real, exactly as it does on-device.
 *
 * This is the test that would RED against the old pathname-keyed
 * `useSessionGate` (login would strand the user on `/login` because the
 * pathname never changes when `Stack.Protected` blocks the navigation) and
 * GREEN against the synchronous `session-context.tsx` fix.
 *
 * `renderRouter` is given an in-memory route map (real screen components,
 * imported directly) rather than scanning the real `./app` directory, so
 * colocated `*.spec.tsx` files under `app/` are never swept in as phantom
 * routes.
 */
const mockPostLogin = jest.fn<Promise<ApiResult<LoginResponseDto>>, [string, string]>();
const mockPostLogout = jest.fn<Promise<ApiResult<void>>, []>();
const mockFetchMe = jest.fn<Promise<ApiResult<MeDto>>, []>();
const mockFetchResumen = jest.fn<Promise<ApiResult<ResumenMesDto>>, [string?]>();

jest.mock('../src/api/client', () => ({
  postLogin: (email: string, password: string) => mockPostLogin(email, password),
  postLogout: () => mockPostLogout(),
  fetchMe: () => mockFetchMe(),
  fetchResumen: (periodo?: string) => mockFetchResumen(periodo),
}));

const mockSecureStoreMemoria = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: (key: string, value: string) => {
    mockSecureStoreMemoria.set(key, value);
    return Promise.resolve();
  },
  getItemAsync: (key: string) => Promise.resolve(mockSecureStoreMemoria.get(key) ?? null),
  deleteItemAsync: (key: string) => {
    mockSecureStoreMemoria.delete(key);
    return Promise.resolve();
  },
}));

// Import after jest.mock is registered — real screen components, wired
// manually into `renderRouter`'s in-memory context (see docstring above).
import RootLayout from '../app/_layout';
import Login from '../app/login';
import Index from '../app/index';

const successLogin: LoginResponseDto = {
  token: 'session-token',
  userId: 'user-1',
  expiresAt: '2026-07-25T00:00:00.000Z',
};

const meOk: MeDto = { userId: 'user-1', email: 'a@b.com' };

const resumenDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '500000', porcentajeBp: 5000, estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '300000', porcentajeBp: 3000, estadoSemaforo: 'amarillo' },
    { bucket: 'Ahorro', total: '200000', porcentajeBp: 2000, estadoSemaforo: 'verde' },
    { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
};

function renderApp() {
  const result = renderRouter(
    { _layout: RootLayout, index: Index, login: Login },
    { initialUrl: '/' },
  );
  // `renderRouter` force-enables Jest fake timers (its own workaround for an
  // unrelated React Navigation/Date.now() issue — see its source comment).
  // Left active, `waitFor`'s internal polling (which schedules its re-checks
  // via a REAL `setTimeout`) never gets a second chance to run, so any
  // multi-microtask-hop async chain (login: postLogin -> guardarToken ->
  // signIn -> Stack.Protected re-render -> Index mount -> fetchResumen)
  // times out even though the state resolves correctly. Restoring real
  // timers immediately after the initial synchronous mount fixes this
  // without touching `renderRouter` itself.
  jest.useRealTimers();
  return result;
}

describe('mobile auth navigation — real Stack.Protected gate (Slice 4 fix)', () => {
  beforeEach(() => {
    mockSecureStoreMemoria.clear();
    mockPostLogin.mockReset();
    mockPostLogout.mockReset().mockResolvedValue({ ok: true, value: undefined });
    mockFetchMe.mockReset();
    mockFetchResumen.mockReset().mockResolvedValue({ ok: true, value: resumenDto });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('cold start with no stored token shows the login screen and never calls /api/resumen', async () => {
    renderApp();

    await waitFor(() => expect(screen.getByTestId('login-submit')).toBeOnTheScreen());
    expect(mockFetchResumen).not.toHaveBeenCalled();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('logging in with valid credentials LANDS on the resumen screen (not stranded on /login)', async () => {
    mockPostLogin.mockResolvedValue({ ok: true, value: successLogin });
    renderApp();

    await waitFor(() => expect(screen.getByTestId('login-submit')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('login-submit'));
    });

    await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());
    expect(screen.queryByTestId('login-submit')).not.toBeOnTheScreen();
  });

  it('logging out LANDS back on the login screen and clears the stored token', async () => {
    mockPostLogin.mockResolvedValue({ ok: true, value: successLogin });
    renderApp();

    await waitFor(() => expect(screen.getByTestId('login-submit')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('login-submit'));
    });
    await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());

    await act(async () => {
      await fireEvent.press(screen.getByTestId('logout-button'));
    });

    await waitFor(() => expect(screen.getByTestId('login-submit')).toBeOnTheScreen());
    expect(mockSecureStoreMemoria.has('md_session_token')).toBe(false);
  });

  it('cold start with a valid stored token shows the resumen screen directly', async () => {
    mockSecureStoreMemoria.set('md_session_token', 'existing-token');
    mockFetchMe.mockResolvedValue({ ok: true, value: meOk });
    renderApp();

    await waitFor(() => expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen());
    expect(mockFetchMe).toHaveBeenCalledTimes(1);
  });
});
