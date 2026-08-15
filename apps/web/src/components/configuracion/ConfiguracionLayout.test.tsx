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
    if (url.startsWith('/api/categorias')) {
      // `/configuracion/categorias` now renders the real `CategoriasPanel`
      // (US-043 PR #2 task 21, replacing PR #1a task 2's `<p>Cargando…</p>`
      // stub) — it needs a `GET /api/categorias` response too, or its own
      // query would surface as an error/pending state instead of the
      // `Categorías y patrones` heading the outlet test below looks for.
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ categorias: [] }),
      };
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

  it('renderiza el h1 "Configuración" (A2) — sigue en el árbol de a11y en todo ancho', async () => {
    renderAt('/configuracion');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configuración' }),
    ).toBeInTheDocument();
  });

  it('el h1 lleva max-md:sr-only (US-063 D-07, WCTM-04) — mecanismo; la geometría real (invisible <768, visible ≥768) la prueba Playwright', async () => {
    renderAt('/configuracion');

    const h1 = await screen.findByRole('heading', {
      level: 1,
      name: 'Configuración',
    });
    expect(h1).toHaveClass('max-md:sr-only');
  });

  it('renderiza la grilla fluida T1 (WCFG-11/WCTG-14), activada en md (US-063 D-01/D-02, repara WCTG-14: 880px ya no cae a una sola columna)', async () => {
    renderAt('/configuracion');

    const grid = await screen.findByTestId('configuracion-grid');
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('md:grid-cols-[200px_1fr]');
  });

  it('el track de contenido lleva min-w-0 (WCTG-13 guarantee 1, mecanismo 1 de 2, Q10a)', async () => {
    renderAt('/configuracion');

    const track = await screen.findByTestId('configuracion-content-track');
    expect(track).toHaveClass('min-w-0');
  });

  it('renderiza BotonVolver hacia "/" (US-063 D-05/D-06/D-07, WCTM-04, Q-02) — mecanismo; la visibilidad md:hidden real la prueba Playwright', async () => {
    renderAt('/configuracion');

    const volver = await screen.findByRole('link', {
      name: 'Volver al inicio',
    });
    expect(volver).toHaveAttribute('href', '/');
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

    // PR #1a task 2's `<p>Cargando…</p>` stub was replaced by the real
    // `CategoriasPanel` in PR #2 task 21 — this test now looks for ITS
    // content (the `Categorías y patrones` h2) instead of the stub text.
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Categorías y patrones',
      }),
    ).toBeInTheDocument();
  });
});
