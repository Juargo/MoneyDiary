import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from '@/routeTree.gen'

/**
 * Integration proof for demo-trial-mode DEMO-UI-02, using the REAL generated
 * route tree (same pattern as `redirect-after-login.test.tsx`): the
 * `_authenticated` pathless layout's `beforeLoad` fetches `/api/auth/me`
 * exactly once (via `requireSession`) and threads `esDemo` into route
 * `context` for its component to conditionally render `<DemoBanner>` — no
 * second fetch to `/api/auth/me`.
 */
function buildFetchStub(meResponse: { userId: string; email: string | null; esDemo: boolean }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.startsWith('/api/auth/me')) {
      return { ok: true, status: 200, json: () => Promise.resolve(meResponse) }
    }

    // Any other call (e.g. /api/resumen for the home route's own data) is
    // irrelevant to this test, which only asserts on the DemoBanner.
    return { ok: false, status: 401 }
  })
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('DemoBanner wiring in _authenticated layout (real route tree)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders DemoBanner for a demo session, fetching /api/auth/me exactly once', async () => {
    const fetchStub = buildFetchStub({ userId: 'demo-1', email: null, esDemo: true })
    vi.stubGlobal('fetch', fetchStub)

    renderApp()

    await waitFor(() => expect(screen.getByRole('status', { name: /aviso de modo demo/i })).toHaveTextContent(/modo demo/i))

    const meCalls = fetchStub.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith('/api/auth/me'),
    )
    expect(meCalls).toHaveLength(1)
  })

  it('does NOT render DemoBanner for a real session', async () => {
    vi.stubGlobal('fetch', buildFetchStub({ userId: 'user-1', email: 'usuario@moneydiary.cl', esDemo: false }))

    const router = renderApp()

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByRole('status', { name: /aviso de modo demo/i })).not.toBeInTheDocument()
  })
})
