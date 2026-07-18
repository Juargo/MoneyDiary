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
describe('requireSession', () => {
  it('throws a TanStack Router redirect to /login when fetchMe resolves unauthorized', async () => {
    const fetchMe = vi.fn(
      async (): Promise<ApiResult<MeDto>> => ({
        ok: false,
        error: { tag: 'unauthorized', message: 'Sesión no válida.' },
      }),
    )

    let caught: unknown
    try {
      await requireSession(fetchMe)
    } catch (err) {
      caught = err
    }

    expect(isRedirect(caught)).toBe(true)
    expect((caught as { options: { to: string } }).options.to).toBe('/login')
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
