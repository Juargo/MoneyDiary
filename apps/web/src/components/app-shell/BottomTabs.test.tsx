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
import { BottomTabs } from './BottomTabs'

async function renderBottomTabs() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <BottomTabs />
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

describe('BottomTabs', () => {
  it('renders the primary nav link as a tab', async () => {
    await renderBottomTabs()

    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument()
  })

  it('renders the placeholders as inert, disabled tabs', async () => {
    const router = await renderBottomTabs()

    for (const label of ['Subir nuevo archivo', 'Configuración', 'Ayuda']) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }

    expect(router.state.location.pathname).toBe('/')
  })

  it('exposes a navigation landmark distinct from the sidebar', async () => {
    await renderBottomTabs()

    expect(screen.getByRole('navigation', { name: 'Navegación principal (móvil)' })).toBeInTheDocument()
  })
})
