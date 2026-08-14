import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('landing on /configuracion without ?google= triggers exactly one /api/auth/me fetch (control case)', async () => {
    const { router, fetchStub } = renderApp('/configuracion');

    await screen.findByRole('heading', { name: 'Editar perfil' });

    const meCalls = fetchStub.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith(
        '/api/auth/me',
      ),
    );
    expect(meCalls).toHaveLength(1);
    // No `?google=` to clean, so nothing for the router to settle on.
    expect(router.state.location.search).toEqual({});
  });

  it('landing on ?google=vinculado, with ConfiguracionRoute actually mounted, triggers exactly one /api/auth/me fetch (task 6.2 pin)', async () => {
    // Mounts through the REAL `RouterProvider` (the `renderApp` helper used
    // by every other test in this file) so `ConfiguracionRoute`'s cleanup
    // effect actually fires — unlike a bare `router.load()`, which only runs
    // `beforeLoad` for the landing and never mounts the component whose
    // effect is the thing under test. The URL cleanup (`?google=` →
    // `/configuracion`) MUST NOT cost a second `/api/auth/me` request
    // (WCFG-03, design.md §1/Q6c): the identity primed by THIS landing's
    // `beforeLoad` is still correct after the rewrite, so re-running
    // `beforeLoad` for it would be pure waste — and, on Render's free tier,
    // a cold start measured at 73s lands squarely on this second call.
    const { router, fetchStub } = renderApp('/configuracion?google=vinculado');

    await screen.findByText('Vinculaste tu cuenta de Google.');
    await waitFor(() => expect(router.state.location.search).toEqual({}));

    const meCalls = fetchStub.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith(
        '/api/auth/me',
      ),
    );
    expect(meCalls).toHaveLength(1);
  });

  it('una navegación GENUINA a otra página autenticada SÍ dispara un nuevo /api/auth/me (invariante que el fix anterior rompía)', async () => {
    // Companion pin to the task-6.2 test above: the guard reverted in this
    // corrective pass (`ensureQueryData`) fixed the double-fetch by making
    // `beforeLoad` cache-backed for EVERY navigation, not just the
    // `?google=` self-rewrite — which meant a real navigation between two
    // authenticated pages stopped re-checking the session for the rest of
    // the SPA session. `markSkipNextAuthRefetch` only arms for the ONE
    // synthetic rewrite `ConfiguracionRoute`'s cleanup effect performs, so a
    // distinct route entry (here `/configuracion` -> `/ingestas`) must still
    // cost its own `/api/auth/me` round trip.
    const { router, fetchStub } = renderApp('/configuracion');

    await screen.findByRole('heading', { name: 'Editar perfil' });

    await router.navigate({ to: '/ingestas' });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/ingestas'),
    );

    const meCalls = fetchStub.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith(
        '/api/auth/me',
      ),
    );
    expect(meCalls).toHaveLength(2);
  });

  it('refrescar la URL ya limpia (una navegación NUEVA sin ?google=) no reaparece el aviso', async () => {
    renderApp('/configuracion');

    await screen.findByRole('heading', { name: 'Editar perfil' });
    expect(screen.getByTestId('aviso-google')).toBeEmptyDOMElement();
  });

  it('abrir un diálogo de Google limpia la región aviso-google en el DOM (Q6b, la única regla de coordinación)', async () => {
    const user = userEvent.setup();
    renderApp('/configuracion?google=vinculado');

    await screen.findByText('Vinculaste tu cuenta de Google.');
    expect(screen.getByTestId('aviso-google')).toHaveTextContent(
      'Vinculaste tu cuenta de Google.',
    );

    // `ME_DTO.googleVinculado === false`, así que el trigger visible es
    // "Vincular con Google" — abrirlo debe limpiar el aviso viejo ANTES de
    // que el usuario pueda confirmar un fallo fresco (Q6b).
    await user.click(
      screen.getByRole('button', { name: 'Vincular con Google' }),
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByTestId('aviso-google')).toBeEmptyDOMElement();
  });
});
