import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from '@/routeTree.gen'

/**
 * End-to-end proof that "redirect-after-login" is actually wired, using the
 * REAL generated route tree (`routeTree.gen.ts`) — not a synthetic 2-route
 * memory router like `LoginForm.test.tsx`/`require-session.test.ts` use for
 * their narrower unit checks. This is the only test that exercises
 * `_authenticated.tsx`'s `beforeLoad` together with `routes/login.tsx`'s
 * `validateSearch` (via `sanitizeRedirect`) together with `LoginForm`'s
 * `navigate({ to: redirectTo })` in one continuous flow.
 *
 * This test FAILS against the pre-fix code: `requireSession` used to always
 * `throw redirect({ to: '/login' })` with no `search`, so hitting a protected
 * route while unauthenticated landed on `/login` with NO `redirect` param,
 * and a subsequent successful login always landed on `/` — never back on
 * the originally-requested protected route.
 */
function buildFetchStub() {
  let authenticated = false

  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.startsWith('/api/auth/me')) {
      return authenticated
        ? {
            ok: true,
            status: 200,
            json: () => Promise.resolve({ userId: 'user-1', email: 'usuario@moneydiary.cl' }),
          }
        : { ok: false, status: 401 }
    }

    if (url.startsWith('/api/auth/login')) {
      authenticated = true
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 't', userId: 'user-1', expiresAt: 'x' }),
      }
    }

    // Any downstream data call reached after landing back on the protected
    // route (e.g. /api/buckets/:bucket) — content is irrelevant to this
    // test, which only asserts on the router's location.
    return { ok: false, status: 401 }
  })
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('redirect-after-login (real route tree)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('bounces an unauthenticated hit on a protected route to /login?redirect=<path>, and returns there after login', async () => {
    vi.stubGlobal('fetch', buildFetchStub())

    const router = renderApp('/buckets/Necesidades')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({ redirect: '/buckets/Necesidades' })

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/buckets/Necesidades'))
  })

  it('does not append a useless ?redirect=/ when the protected destination is already the home route', async () => {
    vi.stubGlobal('fetch', buildFetchStub())

    const router = renderApp('/')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({})
  })
})
