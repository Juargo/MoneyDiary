import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';
import type { MeDto } from '@/api/types';

/**
 * Integration proof for the P0 design-hardening fix ("no logout"), using
 * the REAL generated route tree (same pattern as
 * `configuracion-entry-points.test.tsx` / `app-shell-layout.test.tsx`): a
 * real (non-demo) user has TWO in-app logout entry points — the sidebar
 * footer (desktop) and the Perfil panel (`/configuracion`, mobile+desktop)
 * — both sharing `useCerrarSesion` (`lib/use-cerrar-sesion.ts`).
 */
const ME_DTO: MeDto = {
  userId: 'user-1',
  email: 'usuario@moneydiary.cl',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
};

function buildFetchStub() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.startsWith('/api/auth/logout')) {
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }
    if (url.startsWith('/api/auth/me')) {
      return { ok: true, status: 200, json: () => Promise.resolve(ME_DTO) };
    }
    return {
      ok: false,
      status: init?.method === 'POST' ? 400 : 401,
      json: () => Promise.resolve({}),
    };
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

  return { router, queryClient };
}

describe('Cerrar sesión entry points (real route tree, design critique P0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sidebar footer: renders a "Cerrar sesión" button with the LogOut icon inside the primary nav', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    renderApp('/');

    const sidebar = await screen.findByRole('navigation', {
      name: 'Navegación principal',
    });
    const boton = within(sidebar).getByRole('button', {
      name: 'Cerrar sesión',
    });
    expect(boton.querySelector('svg')).toBeInTheDocument();
  });

  it('sidebar footer: clicking "Cerrar sesión" logs out and navigates to /login, dropping the shell chrome', async () => {
    const fetchStub = buildFetchStub();
    vi.stubGlobal('fetch', fetchStub);

    const { router } = renderApp('/');

    const sidebar = await screen.findByRole('navigation', {
      name: 'Navegación principal',
    });
    const boton = within(sidebar).getByRole('button', {
      name: 'Cerrar sesión',
    });

    fireEvent.click(boton);

    expect(
      within(sidebar).getByRole('button', { name: 'Cerrando sesión…' }),
    ).toBeDisabled();

    await waitFor(() =>
      expect(fetchStub).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'Navegación principal' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('Perfil panel: renders a "Cerrar sesión" button with the LogOut icon', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    renderApp('/configuracion');

    // Scoped to `<main>` (`AppShell`'s routed-content region): jsdom does
    // not evaluate the `hidden lg:flex` breakpoint classes, so the desktop
    // sidebar's OWN "Cerrar sesión" control is also present in the DOM —
    // without scoping, `getByRole` would match both and throw.
    const main = await screen.findByRole('main');
    const boton = within(main).getByRole('button', { name: 'Cerrar sesión' });
    expect(boton.querySelector('svg')).toBeInTheDocument();
  });

  it('Perfil panel: clicking "Cerrar sesión" logs out and navigates to /login', async () => {
    const fetchStub = buildFetchStub();
    vi.stubGlobal('fetch', fetchStub);

    const { router } = renderApp('/configuracion');

    const main = await screen.findByRole('main');
    const boton = within(main).getByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(boton);

    expect(
      within(main).getByRole('button', { name: 'Cerrando sesión…' }),
    ).toBeDisabled();

    await waitFor(() =>
      expect(fetchStub).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
