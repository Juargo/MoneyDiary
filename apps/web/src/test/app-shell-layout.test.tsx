import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from '@/routeTree.gen'

/**
 * Integration proof for WDS-02/WDS-03 (tasks 2.8/2.9), using the REAL
 * generated route tree (same pattern as `demo-banner-layout.test.tsx` /
 * `redirect-after-login.test.tsx`): `AppShell` is mounted in the
 * `_authenticated` pathless layout, so every route nested under it renders
 * the nav chrome — and `/login`, which sits OUTSIDE `_authenticated`, never
 * does.
 */
function buildFetchStub(meResponse: { userId: string; email: string | null; esDemo: boolean } | null) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.startsWith('/api/auth/me')) {
      return meResponse
        ? { ok: true, status: 200, json: () => Promise.resolve(meResponse) }
        : { ok: false, status: 401, json: () => Promise.resolve({ message: 'unauthorized' }) }
    }

    // Any other call (e.g. /api/resumen for the home route's own data) is
    // irrelevant to this test, which only asserts on the shell chrome.
    return { ok: false, status: 401, json: () => Promise.resolve({ message: 'unauthorized' }) }
  })
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialPath] }) })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('AppShell wiring in the route tree (real route tree)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the shell chrome for an authenticated route under _authenticated', async () => {
    const fetchStub = buildFetchStub({ userId: 'user-1', email: 'usuario@moneydiary.cl', esDemo: false })
    vi.stubGlobal('fetch', fetchStub)

    renderApp('/')

    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument())
    expect(screen.getByRole('navigation', { name: 'Navegación principal (móvil)' })).toBeInTheDocument()
  })

  it('renders /login WITHOUT the shell chrome', async () => {
    // No session at all — irrelevant here since /login has no beforeLoad
    // guard, but keeps the stub realistic.
    const fetchStub = buildFetchStub(null)
    vi.stubGlobal('fetch', fetchStub)

    renderApp('/login')

    await screen.findByRole('button', { name: 'Ingresar' })

    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navegación principal (móvil)' })).not.toBeInTheDocument()
  })
})
