import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';
import { QUERY_CLIENT_DEFAULTS } from '@/api/query-client-defaults';
import type { MeDto } from '@/api/types';

const ME: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

/**
 * `buildFetchStub`/`renderConfiguracionPage` — mismo patrón que
 * `use-me-priming.test.tsx`/`demo-banner-layout.test.tsx`: ruta real
 * (`_authenticated/configuracion`) con `fetch` global stubeado (nunca
 * unstubbed contra la red) y un `QueryClient` armado desde
 * `QUERY_CLIENT_DEFAULTS` (mismo `staleTime` que producción). Landing en
 * `/configuracion` atraviesa el `beforeLoad` real de `_authenticated.tsx`,
 * que es la ÚNICA llamada a `/api/auth/me` que debería ocurrir — `useMe()`
 * dentro de `ConfiguracionPage` la lee de la caché ya primada.
 */
function buildFetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/auth/me')) {
      return { ok: true, status: 200, json: () => Promise.resolve(ME) };
    }
    return { ok: false, status: 401, json: () => Promise.resolve({}) };
  });
}

async function renderConfiguracionPage() {
  const fetchStub = buildFetchStub();
  vi.stubGlobal('fetch', fetchStub);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
        retry: false,
      },
    },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/configuracion'] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  await screen.findByRole('heading', { name: 'Editar perfil' });

  return { fetchStub };
}

describe('ConfiguracionPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renderiza el heading "Editar perfil" (CA-02), fetching /api/auth/me exactly once (priming contract)', async () => {
    const { fetchStub } = await renderConfiguracionPage();

    expect(
      screen.getByRole('heading', { name: 'Editar perfil' }),
    ).toBeInTheDocument();

    const meCalls = fetchStub.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith(
        '/api/auth/me',
      ),
    );
    expect(meCalls).toHaveLength(1);
  });

  it('renderiza la lista de tabs con Perfil actual y Categorías inerte', async () => {
    await renderConfiguracionPage();
    expect(screen.getByText('Perfil')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Categorías' })).toBeDisabled();
  });

  it('renderiza PerfilForm con los cuatro campos', async () => {
    await renderConfiguracionPage();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
    expect(screen.getByLabelText('Password actual')).toBeInTheDocument();
    expect(screen.getByLabelText('Password nueva')).toBeInTheDocument();
  });

  it('monta las dos regiones del aviso de Google, vacías cuando avisoGoogle no llega por props', async () => {
    await renderConfiguracionPage();
    expect(screen.getByTestId('aviso-google')).toBeEmptyDOMElement();
    expect(screen.getByTestId('aviso-google-error')).toBeEmptyDOMElement();
  });

  it('renderiza el tercer bloque (Cuenta de Google) — No vinculada por defecto en el fixture', async () => {
    await renderConfiguracionPage();
    expect(screen.getByText('No vinculada')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Vincular con Google' }),
    ).toBeInTheDocument();
  });

  it('grid fluido T1 (CA-04, task 6.3): columna fija bajo lg, apila en una sola columna debajo', async () => {
    await renderConfiguracionPage();
    const grid = screen.getByTestId('configuracion-grid');
    // Sin tier `md:` nuevo (D-08): solo `lg` (el mismo breakpoint que el
    // shell usa para Sidebar vs BottomTabs, `layout.ts`'s
    // `SIDEBAR_CONTENT_OFFSET_CLASS = 'lg:pl-64'`). Por defecto (debajo de
    // `lg`) UNA columna — heading+tabs arriba del panel.
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('lg:grid-cols-[200px_1fr]');
  });
});
