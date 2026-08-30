import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';
import type { MeDto, SemaforoDetalleDto } from '@/api/types';

/**
 * Route-tree integration proof for `/semaforo` (originally US-047 WG5-09
 * T12, now US-049 T7.5), using the REAL generated route tree (same pattern
 * as `configuracion-entry-points.test.tsx` / `redirect-after-login.test.tsx`):
 * `/semaforo` is a genuinely registered route, session-protected for free by
 * the existing `_authenticated` guard, and — since US-049 — renders the
 * REAL page content instead of the "en construcción" stub (WSEM-07/CA-08).
 */
const ME_DTO: MeDto = {
  userId: 'user-1',
  email: 'usuario@moneydiary.cl',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
};

const SEMAFORO_DETALLE_DTO: SemaforoDetalleDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  estadoGlobal: 'verde',
  diagnostico:
    'Tu veredicto del mes es Muy Saludable: los tres grupos están dentro de su rango.',
  bucketsCriticos: [],
  buckets: [
    {
      bucket: 'Necesidades',
      total: '400000',
      porcentajeBp: 4000,
      estadoSemaforo: 'verde',
      metaBp: 5000,
      bandas: {
        verdeMin: null,
        verdeMax: 5000,
        amarilloMin: null,
        amarilloMax: 6000,
      },
      consejo: null,
    },
    {
      bucket: 'Deseos',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
      metaBp: 3000,
      bandas: {
        verdeMin: null,
        verdeMax: 3000,
        amarilloMin: null,
        amarilloMax: 4000,
      },
      consejo: null,
    },
    {
      bucket: 'Ahorro',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
      metaBp: 2000,
      bandas: {
        verdeMin: 2000,
        verdeMax: 4000,
        amarilloMin: 1000,
        amarilloMax: 5000,
      },
      consejo: null,
    },
  ],
  sinCategoria: { cantidad: 0, total: '0' },
};

function buildFetchStub(authenticated: boolean) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.startsWith('/api/auth/me')) {
      return authenticated
        ? { ok: true, status: 200, json: () => Promise.resolve(ME_DTO) }
        : { ok: false, status: 401, json: () => Promise.resolve({}) };
    }

    if (url.startsWith('/api/resumen/semaforo')) {
      const periodo =
        new URL(url, 'http://localhost').searchParams.get('periodo') ??
        SEMAFORO_DETALLE_DTO.periodo;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...SEMAFORO_DETALLE_DTO, periodo }),
      };
    }

    // Any other call is irrelevant to this test, which only asserts on
    // navigation/rendered content of the real page.
    return { ok: false, status: 401, json: () => Promise.resolve({}) };
  });
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

  return router;
}

describe('/semaforo route (real route tree, US-049 WSEM-01..08)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('navigating to /semaforo (authenticated) resolves and renders the real page, not the "en construcción" stub, not blank or a 404', async () => {
    vi.stubGlobal('fetch', buildFetchStub(true));

    const router = renderApp('/semaforo?periodo=2026-07');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/semaforo'),
    );
    expect(
      await screen.findByRole('heading', { name: 'Semáforo' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        'Tu veredicto del mes es Muy Saludable: los tres grupos están dentro de su rango.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Volver al resumen' }),
    ).toBeInTheDocument();
  });

  it('a deep link ?periodo=2026-07 reaches the hook with that period (WSEM-07 arrival regression guard)', async () => {
    vi.stubGlobal('fetch', buildFetchStub(true));
    const fetchSpy = vi.mocked(globalThis.fetch);

    const router = renderApp('/semaforo?periodo=2026-07');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/semaforo'),
    );
    await screen.findByRole('heading', { name: 'Semáforo' });

    expect(
      fetchSpy.mock.calls.some(
        ([input]) =>
          (typeof input === 'string' ? input : input.toString()).includes(
            '/api/resumen/semaforo',
          ) &&
          (typeof input === 'string' ? input : input.toString()).includes(
            'periodo=2026-07',
          ),
      ),
    ).toBe(true);
  });

  it('"Volver al resumen" preserves the periodo being viewed (CA-08 back-link fix)', async () => {
    vi.stubGlobal('fetch', buildFetchStub(true));

    const router = renderApp('/semaforo?periodo=2026-03');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/semaforo'),
    );
    const volverLink = await screen.findByRole('link', {
      name: 'Volver al resumen',
    });

    expect(volverLink).toHaveAttribute(
      'href',
      expect.stringContaining('periodo=2026-03'),
    );
  });

  it('redirects an unauthenticated visit to /login?redirect=/semaforo, via the existing _authenticated guard, no new guard code', async () => {
    vi.stubGlobal('fetch', buildFetchStub(false));

    const router = renderApp('/semaforo');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toEqual({ redirect: '/semaforo' });
  });
});
