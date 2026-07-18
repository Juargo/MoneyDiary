import { describe, expect, it, vi } from 'vitest'
import { isRedirect } from '@tanstack/react-router'
import { requireSession } from './require-session'
import type { ApiResult } from '@/api/client'
import type { MeDto } from '@/api/types'

/**
 * requireSession is the pure `beforeLoad` guard logic for the
 * `_authenticated` pathless layout (AUTH-10). Extracted into its own module
 * so it's unit-testable without a live TanStack Router context —
 * `createFileRoute`'s `beforeLoad` needs one, this helper doesn't (design.md
 * §6.1 note).
 */
function unauthorizedFetchMe(): () => Promise<ApiResult<MeDto>> {
  return vi.fn(
    async (): Promise<ApiResult<MeDto>> => ({
      ok: false,
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    }),
  )
}

describe('requireSession', () => {
  it('throws a TanStack Router redirect to /login when fetchMe resolves unauthorized', async () => {
    const fetchMe = unauthorizedFetchMe()

    let caught: unknown
    try {
      await requireSession(fetchMe)
    } catch (err) {
      caught = err
    }

    expect(isRedirect(caught)).toBe(true)
    expect((caught as { options: { to: string } }).options.to).toBe('/login')
  })

  it('does NOT set a redirect search param when no redirectTo is captured', async () => {
    const fetchMe = unauthorizedFetchMe()

    let caught: unknown
    try {
      await requireSession(fetchMe)
    } catch (err) {
      caught = err
    }

    expect((caught as { options: { search?: unknown } }).options.search).toBeUndefined()
  })

  it('captures redirectTo into the redirect search param when it is a meaningful path', async () => {
    const fetchMe = unauthorizedFetchMe()

    let caught: unknown
    try {
      await requireSession(fetchMe, '/buckets/Necesidades')
    } catch (err) {
      caught = err
    }

    expect(isRedirect(caught)).toBe(true)
    expect((caught as { options: { to: string; search?: { redirect?: string } } }).options).toEqual(
      expect.objectContaining({ to: '/login', search: { redirect: '/buckets/Necesidades' } }),
    )
  })

  it('does NOT set a redirect search param when redirectTo is just "/" (nothing meaningful to capture)', async () => {
    const fetchMe = unauthorizedFetchMe()

    let caught: unknown
    try {
      await requireSession(fetchMe, '/')
    } catch (err) {
      caught = err
    }

    expect((caught as { options: { search?: unknown } }).options.search).toBeUndefined()
  })

  it('resolves without throwing when fetchMe resolves ok (session valid)', async () => {
    const fetchMe = vi.fn(
      async (): Promise<ApiResult<MeDto>> => ({
        ok: true,
        value: { userId: 'user-1', email: 'usuario@moneydiary.cl' },
      }),
    )

    await expect(requireSession(fetchMe)).resolves.toBeUndefined()
    expect(fetchMe).toHaveBeenCalledTimes(1)
  })
})
