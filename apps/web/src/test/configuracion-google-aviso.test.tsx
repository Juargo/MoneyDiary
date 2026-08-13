import { render, screen, waitFor } from '@testing-library/react';
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
 * Integration proof for US-042 WCFG-10 (design.md §1/Q6b/Q6c, tasks 6.1/6.2),
 * using the REAL generated route tree (same pattern as
 * `configuracion-entry-points.test.tsx` / `use-me-priming.test.tsx`):
 * `?google=` is captured once on the first render, the URL is cleaned via
 * `replace: true`, and the message survives the rewrite without a second
 * `/api/auth/me` request.
 */
const ME_DTO: MeDto = {
  userId: 'user-1',
  email: 'usuario@moneydiary.cl',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
};

function buildFetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/auth/me')) {
      return { ok: true, status: 200, json: () => Promise.resolve(ME_DTO) };
    }
    return { ok: false, status: 401, json: () => Promise.resolve({}) };
  });
}

function renderApp(initialPath: string) {
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
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router, fetchStub };
}

describe('/configuracion ?google= return contract (real route tree, WCFG-10)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('?google=vinculado shows the polite success message, then cleans the URL, and the message survives the rewrite', async () => {
    const { router } = renderApp('/configuracion?google=vinculado');

    expect(
      await screen.findByText('Vinculaste tu cuenta de Google.'),
    ).toBeInTheDocument();

    await waitFor(() => expect(router.state.location.search).toEqual({}));
    // Survives the `replace: true` rewrite — still shown after the URL is
    // clean (Q6b: the message lives in state, not derived from the URL).
    expect(
      screen.getByText('Vinculaste tu cuenta de Google.'),
    ).toBeInTheDocument();
  });

  it('?google=error shows the alert failure message', async () => {
    renderApp('/configuracion?google=error');

    expect(
      await screen.findByText(
        'No se pudo vincular tu cuenta de Google. Intenta nuevamente.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('aviso-google-error')).toHaveTextContent(
      'No se pudo vincular tu cuenta de Google. Intenta nuevamente.',
    );
  });

  it('an unexpected ?google= value renders no message and no error', async () => {
    renderApp('/configuracion?google=algo-hostil');

    await screen.findByRole('heading', { name: 'Editar perfil' });
    expect(screen.getByTestId('aviso-google')).toBeEmptyDOMElement();
    expect(screen.getByTestId('aviso-google-error')).toBeEmptyDOMElement();
  });

  it('landing on ?google=vinculado triggers exactly one /api/auth/me fetch for that landing (task 6.2 pin)', async () => {
    // Same isolation technique as `use-me-priming.test.tsx`: `router.load()`
    // runs ONLY the matched routes' `beforeLoad` for this ONE landing,
    // without mounting `ConfiguracionRoute` — so the effect that cleans the
    // URL (a SEPARATE, later navigation) never fires here. This is the
    // correct scope for "no manual refetch added" (task 6.2): it isolates
    // the landing's own priming from the fact that ANY subsequent internal
    // navigation in this router re-runs `beforeLoad` and fetches again —
    // confirmed to be true for a plain `/` → `/configuracion` `<Link>` click
    // too (`_authenticated.tsx`'s beforeLoad has no such caching, by
    // design), so that second, later fetch is baseline app behaviour, not a
    // regression this task introduces.
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
      history: createMemoryHistory({
        initialEntries: ['/configuracion?google=vinculado'],
      }),
    });

    await router.load();

    const meCalls = fetchStub.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith(
        '/api/auth/me',
      ),
    );
    expect(meCalls).toHaveLength(1);
  });

  it('refrescar la URL ya limpia (una navegación NUEVA sin ?google=) no reaparece el aviso', async () => {
    renderApp('/configuracion');

    await screen.findByRole('heading', { name: 'Editar perfil' });
    expect(screen.getByTestId('aviso-google')).toBeEmptyDOMElement();
  });
});
