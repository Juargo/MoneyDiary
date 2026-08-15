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
import { BotonVolver } from './BotonVolver';

/**
 * BotonVolver (US-063 D-05/D-06, WCTM-04) — the shared back-icon control.
 * Same synthetic route-tree idiom as `ConfiguracionTabs.test.tsx`/
 * `NavItem.test.tsx`: a root layout rendering `BotonVolver` + `<Outlet/>`,
 * with real leaf routes at the two destinations this component can ever
 * point to, so `<Link>`'s `href` resolution has something real to compare
 * against.
 *
 * jsdom does not lay out CSS, so this only proves MECHANISM (D-08): the
 * link exists, resolves to the given destination, carries the given
 * accessible name, and carries `CLASE_BOTON_ICONO` (the 24×24 CSS px
 * class). Whether it is actually VISIBLE/hidden at a given viewport is
 * Playwright's job (`e2e/mobile-header.e2e.ts`, `E-05`).
 */
async function renderAt(initialPath: '/' | '/configuracion/categorias') {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <BotonVolver to="/" label="Volver al inicio" />,
  });
  const categoriasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion/categorias',
    component: () => (
      <BotonVolver to="/configuracion/categorias" label="Volver a Categorías" />
    ),
  });
  const routeTree = rootRoute.addChildren([indexRoute, categoriasRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe('BotonVolver', () => {
  it('renderiza un <Link> real con el destino y el nombre accesible dados', async () => {
    await renderAt('/');

    const link = screen.getByRole('link', { name: 'Volver al inicio' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('acepta otra combinación destino/label — el union type de "to" no es un accidente', async () => {
    await renderAt('/configuracion/categorias');

    const link = screen.getByRole('link', { name: 'Volver a Categorías' });
    expect(link).toHaveAttribute('href', '/configuracion/categorias');
  });

  it('lleva CLASE_BOTON_ICONO (size-6, 24×24 CSS px, WCAG 2.2 AA SC 2.5.8 — mecanismo, no geometría real)', async () => {
    await renderAt('/');

    const link = screen.getByRole('link', { name: 'Volver al inicio' });
    expect(link).toHaveClass('size-6');
  });

  it('lleva un anillo de foco visible (focus-visible:outline)', async () => {
    await renderAt('/');

    const link = screen.getByRole('link', { name: 'Volver al inicio' });
    expect(link).toHaveClass('focus-visible:outline');
  });
});
