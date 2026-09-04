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
import { LayoutDashboard } from 'lucide-react';
import { NavItem } from './NavItem';
import type { NavItemModel } from './nav-items';

/**
 * NavItem is mounted at the (always-rendered) root layout, wrapping an
 * `Outlet`, with two leaf routes ("/" and "/otra") to move the "current
 * route" without unmounting NavItem — mirrors LoginForm.test.tsx's synthetic
 * route-tree pattern.
 */
async function renderNavItem(
  item: NavItemModel,
  initialPath: string = '/',
  variant?: 'sidebar' | 'bottom-tab',
) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <NavItem item={item} variant={variant} />
        <Outlet />
      </>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });
  const otraRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/otra',
    component: () => null,
  });
  // A parent SECTION route with a child, mirroring the real
  // `/configuracion` → `/configuracion/categorias` shape. The synthetic tree
  // used to be two flat leaves, which is exactly why the nested-route defect
  // below could never surface here.
  const seccionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion',
    component: () => <Outlet />,
  });
  const seccionIndexRoute = createRoute({
    getParentRoute: () => seccionRoute,
    path: '/',
    component: () => null,
  });
  const seccionHijaRoute = createRoute({
    getParentRoute: () => seccionRoute,
    path: 'categorias',
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([
    indexRoute,
    otraRoute,
    seccionRoute.addChildren([seccionIndexRoute, seccionHijaRoute]),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

const FUNCTIONAL_ITEM: NavItemModel = {
  kind: 'link',
  label: 'Resumen',
  to: '/',
  icon: LayoutDashboard,
};

const SECTION_ITEM: NavItemModel = {
  kind: 'link',
  label: 'Configuración',
  to: '/configuracion',
  icon: LayoutDashboard,
};

const ITEM_WITH_SHORT_LABEL: NavItemModel = {
  kind: 'link',
  label: 'Subir nuevo archivo',
  shortLabel: 'Subir',
  to: '/subir',
  icon: LayoutDashboard,
};

describe('NavItem', () => {
  it('gets active styling and aria-current on the matching route', async () => {
    await renderNavItem(FUNCTIONAL_ITEM, '/');

    const link = screen.getByRole('link', { name: 'Resumen' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('has no aria-current when the route does not match', async () => {
    await renderNavItem(FUNCTIONAL_ITEM, '/otra');

    const link = screen.getByRole('link', { name: 'Resumen' });
    expect(link).not.toHaveAttribute('aria-current');
  });

  // ── Two defects found in the browser, 2026-09-03 ────────────────────────
  // Both were invisible to the original suite because it exercised bare,
  // search-less, flat routes — the two shapes the real app almost never has.

  // `activeOptions.includeSearch` DEFAULTS TO TRUE in router-core: a link is
  // active only if the current URL's search params inclusively match the
  // link's own `search` prop. Nav items declare no `search`, so every screen
  // carrying query state (the dashboard is `/?periodo=YYYY-MM`, and it is the
  // most-visited one) silently lost its active item — measured in-browser:
  // `/` lit "Resumen", `/?periodo=2026-07` lit nothing at all.
  //
  // A section link is about WHERE you are, not about the state of the screen.
  it('stays active when the current route carries search params (includeSearch)', async () => {
    await renderNavItem(FUNCTIONAL_ITEM, '/?periodo=2026-07');

    const link = screen.getByRole('link', { name: 'Resumen' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  // `exact: true` means "no children routes", so a nav item pointing at a
  // section never lit up once the user drilled into it: `/configuracion` lit
  // "Configuración", `/configuracion/categorias` lit nothing in the sidebar.
  it('stays active on a child of its section route', async () => {
    await renderNavItem(SECTION_ITEM, '/configuracion/categorias');

    const link = screen.getByRole('link', { name: 'Configuración' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  // The counterweight to the test above, and the reason `exact` cannot simply
  // be dropped for every item: `to: '/'` is a PREFIX of every path in the
  // app, so a non-exact index link would report itself as the current page on
  // every single screen — replacing "no active item" with "always the wrong
  // active item", which is worse.
  it('the index item does NOT stay active on other routes', async () => {
    await renderNavItem(FUNCTIONAL_ITEM, '/configuracion/categorias');

    const link = screen.getByRole('link', { name: 'Resumen' });
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('the bottom-tab variant shows shortLabel when present, as the accessible name too', async () => {
    await renderNavItem(ITEM_WITH_SHORT_LABEL, '/otra', 'bottom-tab');

    expect(screen.getByRole('link', { name: 'Subir' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Subir nuevo archivo' }),
    ).not.toBeInTheDocument();
  });

  it('the bottom-tab variant falls back to the full label when shortLabel is absent', async () => {
    await renderNavItem(FUNCTIONAL_ITEM, '/', 'bottom-tab');

    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
  });

  it('the sidebar variant always shows the full label, even when shortLabel is present', async () => {
    await renderNavItem(ITEM_WITH_SHORT_LABEL, '/otra', 'sidebar');

    expect(
      screen.getByRole('link', { name: 'Subir nuevo archivo' }),
    ).toBeInTheDocument();
  });
});
