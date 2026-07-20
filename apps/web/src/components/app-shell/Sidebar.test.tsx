import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { Sidebar } from './Sidebar'

async function renderSidebar() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Sidebar />
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null })
  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

describe('Sidebar', () => {
  it('renders the brand block and the primary nav link', async () => {
    await renderSidebar()

    expect(screen.getByText('MoneyDiary')).toBeInTheDocument()
    expect(screen.getByText('Sin registro. Solo analiza.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument()
  })

  it('renders the placeholders as inert, disabled controls', async () => {
    const router = await renderSidebar()

    for (const label of ['Subir nuevo archivo', 'Configuración', 'Ayuda']) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }

    expect(router.state.location.pathname).toBe('/')
  })

  it('exposes a navigation landmark distinct from the mobile bar', async () => {
    await renderSidebar()

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
  })

  it('is hidden on mobile and shown at the lg breakpoint (responsive class switch, WDS-02)', async () => {
    await renderSidebar()

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(nav.className).toMatch(/\bhidden\b/)
    expect(nav.className).toMatch(/\blg:flex\b/)
  })
})
