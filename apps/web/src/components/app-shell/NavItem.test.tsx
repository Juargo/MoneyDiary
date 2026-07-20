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
import { LayoutDashboard, Upload } from 'lucide-react'
import { NavItem } from './NavItem'
import type { NavItemModel } from './nav-items'

/**
 * NavItem is mounted at the (always-rendered) root layout, wrapping an
 * `Outlet`, with two leaf routes ("/" and "/otra") to move the "current
 * route" without unmounting NavItem — mirrors LoginForm.test.tsx's synthetic
 * route-tree pattern.
 */
async function renderNavItem(item: NavItemModel, initialPath: '/' | '/otra' = '/') {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <NavItem item={item} />
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null })
  const otraRoute = createRoute({ getParentRoute: () => rootRoute, path: '/otra', component: () => null })
  const routeTree = rootRoute.addChildren([indexRoute, otraRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialPath] }) })
  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

const FUNCTIONAL_ITEM: NavItemModel = { label: 'Resumen', to: '/', icon: LayoutDashboard, disabled: false }
const PLACEHOLDER_ITEM: NavItemModel = { label: 'Subir nuevo archivo', icon: Upload, disabled: true }

describe('NavItem', () => {
  it('gets active styling and aria-current on the matching route', async () => {
    await renderNavItem(FUNCTIONAL_ITEM, '/')

    const link = screen.getByRole('link', { name: 'Resumen' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('has no aria-current when the route does not match', async () => {
    await renderNavItem(FUNCTIONAL_ITEM, '/otra')

    const link = screen.getByRole('link', { name: 'Resumen' })
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('renders a disabled placeholder that is not activatable', async () => {
    const router = await renderNavItem(PLACEHOLDER_ITEM, '/')

    const button = screen.getByRole('button', { name: 'Subir nuevo archivo' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(button)

    expect(router.state.location.pathname).toBe('/')
  })
})
