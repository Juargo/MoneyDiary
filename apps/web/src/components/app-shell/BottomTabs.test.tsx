import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { BottomTabs } from './BottomTabs';

async function renderBottomTabs() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <BottomTabs />
        <Outlet />
      </>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });
  const subirRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/subir',
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([indexRoute, subirRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

describe('BottomTabs', () => {
  it('renders the primary nav link as a tab', async () => {
    await renderBottomTabs();

    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
  });

  it('renders "Subir nuevo archivo" as a real nav link to /subir', async () => {
    await renderBottomTabs();

    const link = screen.getByRole('link', { name: 'Subir nuevo archivo' });
    expect(link).toHaveAttribute('href', '/subir');
  });

  // US-042 WCFG-01: "Configuración" flipped from placeholder to a real link.
  it('renders "Configuración" as a real nav link to /configuracion', async () => {
    await renderBottomTabs();

    const link = screen.getByRole('link', { name: 'Configuración' });
    expect(link).toHaveAttribute('href', '/configuracion');
  });

  it('renders the remaining placeholder as an inert, disabled tab', async () => {
    const router = await renderBottomTabs();

    const button = screen.getByRole('button', { name: 'Ayuda' });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(router.state.location.pathname).toBe('/');
  });

  it('exposes a navigation landmark distinct from the sidebar', async () => {
    await renderBottomTabs();

    expect(
      screen.getByRole('navigation', { name: 'Navegación principal (móvil)' }),
    ).toBeInTheDocument();
  });

  it('is shown on mobile and hidden at the lg breakpoint (responsive class switch, WDS-02)', async () => {
    await renderBottomTabs();

    const nav = screen.getByRole('navigation', {
      name: 'Navegación principal (móvil)',
    });
    expect(nav.className).toMatch(/\blg:hidden\b/);
  });
});
