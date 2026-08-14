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

/**
 * `ConfiguracionLayout` owns the shared chrome introduced by the route
 * restructure (US-043 design.md §1/Q1a, Q10a, D-09): the `Configuración` h1
 * (A2), the fluid T1 grid, `ConfiguracionTabs`, and the `min-w-0`
 * content-track that guarantee 1 of the 360px floor (WCTG-13) depends on.
 *
 * Rendered through the REAL route tree (same idiom as the former
 * `ConfiguracionPage.test.tsx`) rather than in isolation: `ConfiguracionTabs`
 * renders real `<Link>`s once task 4 lands, which need router context, and
 * this is the actual production composition (`configuracion.tsx` wraps
 * `<Outlet/>` in `ConfiguracionLayout`).
 */
const ME: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

function buildFetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/auth/me')) {
      return { ok: true, status: 200, json: () => Promise.resolve(ME) };
    }
    return { ok: false, status: 401, json: () => Promise.resolve({}) };
  });
}

function renderAt(initialPath: string) {
  vi.stubGlobal('fetch', buildFetchStub());
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
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('ConfiguracionLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renderiza el h1 "Configuración" (A2)', async () => {
    renderAt('/configuracion');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configuración' }),
    ).toBeInTheDocument();
  });

  it('renderiza la grilla fluida T1 (WCFG-11), reproduciendo la de ConfiguracionPage', async () => {
    renderAt('/configuracion');

    const grid = await screen.findByTestId('configuracion-grid');
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('lg:grid-cols-[200px_1fr]');
  });

  it('el track de contenido lleva min-w-0 (WCTG-13 guarantee 1, mecanismo 1 de 2, Q10a)', async () => {
    renderAt('/configuracion');

    const track = await screen.findByTestId('configuracion-content-track');
    expect(track).toHaveClass('min-w-0');
  });

  it('renderiza ConfiguracionTabs dentro de la grilla', async () => {
    renderAt('/configuracion');

    expect(
      await screen.findByRole('navigation', {
        name: 'Secciones de configuración',
      }),
    ).toBeInTheDocument();
  });

  it('renderiza el contenido enrutado (children/Outlet) dentro del track', async () => {
    renderAt('/configuracion/categorias');

    expect(await screen.findByText('Cargando…')).toBeInTheDocument();
  });
});
