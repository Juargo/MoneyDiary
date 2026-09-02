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
  /**
   * The active tab's contrast lives in the 4px `border-primary` rail, not in
   * the fill. The fill it used to rely on (`bg-accent` #eeeeee) measures
   * 1.07:1 against this screen's `--background` #e8f0fa — the defect these
   * scenarios exist to stop from coming back.
   *
   * jsdom resolves no CSS variables and computes no contrast, so the ratio
   * itself is NOT assertable here; the class literal that produces it is.
   * That is the same "mechanism, not geometry" split the `flex-row` scenario
   * above already uses, and the same one `estilos.test.ts` documents for
   * `size-6`. The real contrast check is a browser pass.
   */
  it('la tab activa lleva el riel border-primary — la señal que carga el contraste sobre el fondo azul', async () => {
    await renderTabs('/configuracion');

    const perfil = await screen.findByRole('link', { name: 'Perfil' });
    expect(perfil).toHaveClass('border-primary');
    expect(perfil).toHaveClass('bg-card');
  });

  it('la tab activa NO vuelve a bg-accent, el gris que da 1.07:1 sobre --background', async () => {
    await renderTabs('/configuracion');

    const perfil = await screen.findByRole('link', { name: 'Perfil' });
    expect(perfil.className.split(' ')).not.toContain('bg-accent');
    expect(perfil.className.split(' ')).not.toContain('hover:bg-accent');
  });

  it('el riel reserva su espacio en las tabs inactivas (border-transparent), así que activar una no corre a las demás', async () => {
    await renderTabs('/configuracion');

    const categorias = await screen.findByRole('link', { name: 'Categorías' });
    expect(categorias).toHaveClass('border-transparent');
    // Abajo de `md` la lista es una fila horizontal: riel abajo. De `md` para
    // arriba es una columna: riel a la izquierda.
    expect(categorias).toHaveClass('border-b-4');
    expect(categorias).toHaveClass('md:border-b-0');
    expect(categorias).toHaveClass('md:border-l-4');
  });

  it('cada tab tiene anillo de foco visible — SC 2.4.7, el hueco que tenían contra app-shell/NavItem', async () => {
    await renderTabs('/configuracion');

    for (const nombre of ['Perfil', 'Categorías', 'Ayuda']) {
      expect(await screen.findByRole('link', { name: nombre })).toHaveClass(
        'focus-visible:outline',
        'focus-visible:outline-2',
        'focus-visible:outline-ring',
      );
    }
  });

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

  // Mobile bottom-nav redesign (Impeccable critique P1, fresh-review fix):
  // "Ayuda" left `BottomTabs` (5-tab convention) and needed a discoverable
  // mobile path. Folded in HERE — a trailing <li> in this same nav/ul — so
  // it lives inside the existing "Secciones de configuración" landmark and
  // list, styled exactly like Perfil/Categorías (same TAB_BASE pill, no
  // icon), instead of a foreign NavItem-shaped element in its own wrapper.
  it('renderiza "Ayuda" como <li> final, estilizado igual que las otras tabs (TAB_BASE), visible solo bajo lg', async () => {
    await renderTabs('/configuracion');

    const ayuda = screen.getByRole('link', { name: 'Ayuda' });
    expect(ayuda).toHaveAttribute('href', '/ayuda');
    // Perfil is active in this render (TAB_ACTIVE appended) — compare
    // against Categorías, the other inactive tab, for a like-for-like
    // TAB_BASE-only className match.
    expect(ayuda.className).toBe(
      screen.getByRole('link', { name: 'Categorías' }).className,
    );

    const ayudaLi = ayuda.closest('li');
    expect(ayudaLi).toHaveClass('lg:hidden');
  });

  it('"Ayuda" no lleva aria-current — no es una sección de /configuracion, nunca es la ruta activa dentro de este árbol', async () => {
    await renderTabs('/configuracion');

    expect(screen.getByRole('link', { name: 'Ayuda' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
