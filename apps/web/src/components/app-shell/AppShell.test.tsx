import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { AppShell } from './AppShell'

async function renderAppShell() {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <p>contenido hijo</p>
        <Outlet />
      </AppShell>
    ),
  })
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null })
  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  render(<RouterProvider router={router} />)
}

describe('AppShell', () => {
  it('composes Sidebar, BottomTabs, and renders its children', async () => {
    await renderAppShell()

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navegación principal (móvil)' })).toBeInTheDocument()
    expect(screen.getByText('contenido hijo')).toBeInTheDocument()
  })
})
