import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import type { ApiResult } from '../src/domain/api-error';
import type { MeDto } from '../src/domain/resumen.types';
import type { CatalogoDto } from '../src/domain/catalogo.types';
import Configuracion from './configuracion';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({
      back: mockBack,
      push: mockPush,
    }),
    useFocusEffect: (callback: () => void) => {
      useEffect(() => {
        callback();
      }, [callback]);
    },
  };
});

const mockFetchMe = jest.fn<Promise<ApiResult<MeDto>>, []>();
const mockFetchCatalogo = jest.fn<Promise<ApiResult<CatalogoDto>>, []>();

jest.mock('../src/api/client', () => {
  const actual = jest.requireActual('../src/api/client');
  return {
    ...actual,
    fetchMe: () => mockFetchMe(),
  };
});

jest.mock('../src/api/categorias', () => {
  const actual = jest.requireActual('../src/api/categorias');
  return {
    ...actual,
    fetchCatalogo: () => mockFetchCatalogo(),
  };
});

const sampleMe: MeDto = {
  userId: 'user-1',
  email: 'test@example.com',
  nombre: 'Test User',
  esDemo: false,
  googleVinculado: false,
};

const sampleCatalogo: CatalogoDto = {
  categorias: [
    {
      id: 'cat-1',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 5,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Configuracion Screen (app/configuracion.tsx — US-044 PR3b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMe.mockResolvedValue({ ok: true, value: sampleMe });
    mockFetchCatalogo.mockResolvedValue({ ok: true, value: sampleCatalogo });
  });

  it('renders the header title and back control (D-03)', async () => {
    await render(<Configuracion />);

    expect(screen.getByText('Configuración')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Volver al resumen' }),
    ).toBeOnTheScreen();
  });

  it('navigates back when pressing «Volver al resumen»', async () => {
    await render(<Configuracion />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Volver al resumen' }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('defaults to Perfil tab and shows Perfil content', async () => {
    await render(<Configuracion />);

    await waitFor(() => {
      expect(screen.getByTestId('perfil-tab-content')).toBeOnTheScreen();
    });
    expect(screen.queryByTestId('categorias-tab-content')).toBeNull();
  });

  it('switches between Perfil and Categorías tabs without re-fetching', async () => {
    await render(<Configuracion />);

    await waitFor(() => {
      expect(screen.getByTestId('perfil-tab-content')).toBeOnTheScreen();
    });

    const initialMeCalls = mockFetchMe.mock.calls.length;
    const initialCatalogoCalls = mockFetchCatalogo.mock.calls.length;

    await fireEvent.press(screen.getByRole('tab', { name: 'Categorías' }));

    expect(screen.getByTestId('categorias-tab-content')).toBeOnTheScreen();
    expect(screen.queryByTestId('perfil-tab-content')).toBeNull();

    expect(mockFetchMe.mock.calls.length).toBe(initialMeCalls);
    expect(mockFetchCatalogo.mock.calls.length).toBe(initialCatalogoCalls);

    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));

    expect(screen.getByTestId('perfil-tab-content')).toBeOnTheScreen();
    expect(screen.queryByTestId('categorias-tab-content')).toBeNull();
  });

  it('shows loading state for Perfil tab while fetchMe is pending', async () => {
    const pendingMe = deferred<ApiResult<MeDto>>();
    mockFetchMe.mockReturnValueOnce(pendingMe.promise);

    await render(<Configuracion />);

    expect(screen.getByTestId('perfil-loading')).toBeOnTheScreen();

    pendingMe.resolve({ ok: true, value: sampleMe });
    await waitFor(() => {
      // PerfilPanel replaces the placeholder — check its Nombre field is rendered
      expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    });
  });

  it('shows error state for Perfil tab on fetchMe failure and retries', async () => {
    mockFetchMe.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<Configuracion />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen();
    });

    mockFetchMe.mockResolvedValueOnce({ ok: true, value: sampleMe });
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      // PerfilPanel replaces the placeholder — check its Nombre field is rendered
      expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    });
  });

  it('shows loading state for Categorías tab while fetchCatalogo is pending', async () => {
    const pendingCatalogo = deferred<ApiResult<CatalogoDto>>();
    mockFetchCatalogo.mockReturnValueOnce(pendingCatalogo.promise);

    await render(<Configuracion />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Categorías' }));

    expect(screen.getByTestId('categorias-loading')).toBeOnTheScreen();

    pendingCatalogo.resolve({ ok: true, value: sampleCatalogo });
    await waitFor(() => {
      expect(
        screen.getByTestId('categorias-panel-placeholder'),
      ).toBeOnTheScreen();
    });
  });

  it('shows error state for Categorías tab on fetchCatalogo failure and retries', async () => {
    mockFetchCatalogo.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<Configuracion />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Categorías' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen();
    });

    mockFetchCatalogo.mockResolvedValueOnce({
      ok: true,
      value: sampleCatalogo,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(
        screen.getByTestId('categorias-panel-placeholder'),
      ).toBeOnTheScreen();
    });
  });

  it('isolates tab error states: Perfil error does not blank Categorías tab (D-01)', async () => {
    mockFetchMe.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'network' },
    });
    mockFetchCatalogo.mockResolvedValueOnce({
      ok: true,
      value: sampleCatalogo,
    });

    await render(<Configuracion />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen();
    });

    await fireEvent.press(screen.getByRole('tab', { name: 'Categorías' }));

    await waitFor(() => {
      expect(
        screen.getByTestId('categorias-panel-placeholder'),
      ).toBeOnTheScreen();
    });
  });

  it('isolates tab error states: Categorías error does not blank Perfil tab (D-01)', async () => {
    mockFetchMe.mockResolvedValueOnce({
      ok: true,
      value: sampleMe,
    });
    mockFetchCatalogo.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<Configuracion />);

    await waitFor(() => {
      // PerfilPanel replaces the placeholder — check its Nombre field is rendered
      expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    });

    await fireEvent.press(screen.getByRole('tab', { name: 'Categorías' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen();
    });

    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));

    // PerfilPanel persists across tab switches — Nombre field still visible
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
  });

  it('fires fetchCatalogo on initial screen focus via useFocusEffect (D-10)', async () => {
    await render(<Configuracion />);

    expect(mockFetchCatalogo).toHaveBeenCalledTimes(1);
  });
});
