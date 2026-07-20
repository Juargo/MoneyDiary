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

  it('reserves clearance for the fixed sidebar and bottom bar on <main> (responsive class switch, WDS-02)', async () => {
    await renderAppShell()

    const main = screen.getByRole('main')
    expect(main.className).toMatch(/\blg:pl-64\b/)
    expect(main.className).toMatch(/\bpb-16\b/)
    expect(main.className).toMatch(/\blg:pb-0\b/)
  })
})
