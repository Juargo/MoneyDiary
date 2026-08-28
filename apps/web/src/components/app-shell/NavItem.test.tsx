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
  initialPath: '/' | '/otra' = '/',
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
  const routeTree = rootRoute.addChildren([indexRoute, otraRoute]);
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
