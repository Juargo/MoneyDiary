import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { ConfiguracionTabs } from './ConfiguracionTabs';

/**
 * WCTG-01: `Categorías` becomes a real, active `<Link>` on its own route,
 * replacing the disabled placeholder `<button>`. `Perfil` must reflect the
 * SAME "current route" mechanism — a hardcoded `aria-current="page"` on
 * `Perfil` would leave two tabs claiming to be current once `/configuracion
 * /categorias` is a real, reachable route.
 *
 * Same synthetic route-tree idiom as `NavItem.test.tsx`: a root layout
 * rendering `ConfiguracionTabs` + `<Outlet/>`, with two leaves at the exact
 * paths `ConfiguracionTabs` links to, so `<Link>`'s active-matching has a
 * real route to compare against without pulling in the whole app (auth
 * priming, QueryClient, fetch stubs).
 */
async function renderTabs(
  initialPath: '/configuracion' | '/configuracion/categorias',
) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <ConfiguracionTabs />
        <Outlet />
      </>
    ),
  });
  const perfilRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion',
    component: () => null,
  });
  const categoriasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion/categorias',
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([perfilRoute, categoriasRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

describe('ConfiguracionTabs', () => {
  it('el <ul> lleva flex-row (mecanismo, no geometría — US-063 D-01/WCTM-02: la fila horizontal bajo md se verifica en Playwright, e2e/mobile-header.e2e.ts)', async () => {
    await renderTabs('/configuracion');

    const lista = screen.getByRole('link', { name: 'Perfil' }).closest('ul');
    expect(lista).toHaveClass('flex');
    expect(lista).toHaveClass('flex-row');
    expect(lista).toHaveClass('md:flex-col');
  });

  it('el <li>, no el <a>, lleva flex-1 (mecanismo — es el <li> el flex item real del <ul>; ponerlo en el <a> no distribuye ancho, ver ConfiguracionTabs.tsx)', async () => {
    await renderTabs('/configuracion');

    const perfilLi = screen.getByRole('link', { name: 'Perfil' }).closest('li');
    const categoriasLi = screen
      .getByRole('link', { name: 'Categorías' })
      .closest('li');
    expect(perfilLi).toHaveClass('flex-1');
    expect(perfilLi).toHaveClass('md:flex-none');
    expect(categoriasLi).toHaveClass('flex-1');
    expect(categoriasLi).toHaveClass('md:flex-none');
  });

  it('Perfil es un <Link> real a /configuracion, con aria-current cuando esa es la ruta activa', async () => {
    await renderTabs('/configuracion');

    const perfil = screen.getByRole('link', { name: 'Perfil' });
    expect(perfil).toHaveAttribute('href', '/configuracion');
    expect(perfil).toHaveAttribute('aria-current', 'page');
  });

  it('Categorías es un <Link> real a /configuracion/categorias — ya no un botón inerte (WCTG-01)', async () => {
    await renderTabs('/configuracion');

    const categorias = screen.getByRole('link', { name: 'Categorías' });
    expect(categorias).toHaveAttribute('href', '/configuracion/categorias');
    expect(categorias).not.toHaveAttribute('aria-current');
  });

  it('activar el tab Categorías navega a /configuracion/categorias y ese tab lleva aria-current="page" (WCTG-01 scenario)', async () => {
    const router = await renderTabs('/configuracion/categorias');

    const categorias = screen.getByRole('link', { name: 'Categorías' });
    expect(router.state.location.pathname).toBe('/configuracion/categorias');
    expect(categorias).toHaveAttribute('aria-current', 'page');
    // Perfil no reclama ser la página actual al mismo tiempo.
    expect(screen.getByRole('link', { name: 'Perfil' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
