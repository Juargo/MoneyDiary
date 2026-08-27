import { render, screen, within } from '@testing-library/react';
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

  // Mobile bottom-nav redesign (Impeccable critique P1): the bar shows the
  // short label ("Subir"), not the full sidebar label — six long labels at
  // 360px wrapped across lines. The link still resolves to the same route.
  it('renders "Subir" (short label) as a real nav link to /subir', async () => {
    await renderBottomTabs();

    const link = screen.getByRole('link', { name: 'Subir' });
    expect(link).toHaveAttribute('href', '/subir');
  });

  // US-042 WCFG-01: "Configuración" flipped from placeholder to a real
  // link. Mobile bottom-nav redesign: the bar shows "Config" (short label).
  it('renders "Config" (short label) as a real nav link to /configuracion', async () => {
    await renderBottomTabs();

    const link = screen.getByRole('link', { name: 'Config' });
    expect(link).toHaveAttribute('href', '/configuracion');
  });

  // Mobile bottom-nav redesign (Impeccable critique P1): 6 tabs at 360px
  // exceeded the 3-5 tab convention. "Ayuda" moved out of the bottom bar —
  // it stays in the desktop Sidebar and gains an entry inside Configuración
  // (ConfiguracionLayout.test.tsx) instead.
  it('does not render "Ayuda" — it left the bottom bar for the 5-tab redesign', async () => {
    await renderBottomTabs();

    expect(
      screen.queryByRole('link', { name: 'Ayuda' }),
    ).not.toBeInTheDocument();
  });

  it('renders exactly the 5 expected mobile tabs, in order', async () => {
    await renderBottomTabs();

    const nav = screen.getByRole('navigation', {
      name: 'Navegación principal (móvil)',
    });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Resumen',
      'Subir',
      'Registrar',
      'Cartolas',
      'Config',
    ]);
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
