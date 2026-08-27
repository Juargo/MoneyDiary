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
import { Sidebar } from './Sidebar';

async function renderSidebar() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Sidebar />
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

describe('Sidebar', () => {
  it('renders the brand block and the primary nav link', async () => {
    await renderSidebar();

    expect(screen.getByText('MoneyDiary')).toBeInTheDocument();
    expect(screen.getByText('Tu mes, un veredicto claro.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
  });

  it('renders "Subir nuevo archivo" as a real nav link to /subir', async () => {
    await renderSidebar();

    const link = screen.getByRole('link', { name: 'Subir nuevo archivo' });
    expect(link).toHaveAttribute('href', '/subir');
  });

  // US-042 WCFG-01: "Configuración" flipped from placeholder to a real link.
  it('renders "Configuración" as a real nav link to /configuracion', async () => {
    await renderSidebar();

    const link = screen.getByRole('link', { name: 'Configuración' });
    expect(link).toHaveAttribute('href', '/configuracion');
  });

  // Ayuda flipped from placeholder to a real link once /ayuda shipped.
  it('renders "Ayuda" as a real nav link to /ayuda', async () => {
    await renderSidebar();

    const link = screen.getByRole('link', { name: 'Ayuda' });
    expect(link).toHaveAttribute('href', '/ayuda');
  });

  it('exposes a navigation landmark distinct from the mobile bar', async () => {
    await renderSidebar();

    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
  });

  it('is hidden on mobile and shown at the lg breakpoint (responsive class switch, WDS-02)', async () => {
    await renderSidebar();

    const nav = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });
    expect(nav.className).toMatch(/\bhidden\b/);
    expect(nav.className).toMatch(/\blg:flex\b/);
  });
});
