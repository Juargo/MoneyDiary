import { describe, expect, it } from 'vitest'
import { sanitizeRedirect } from './sanitize-redirect'

/**
 * sanitizeRedirect is the ONLY gate between an attacker-controlled
 * `?redirect=` search param and `navigate({ to })` (AUTH-10 follow-up).
 * Mirrors `apps/web/api/[...path].ts`'s `resolveSafePath` intent: only a
 * same-origin-relative path+query (single leading slash, no scheme, no
 * protocol-relative prefix) is allowed through — everything else falls back
 * to `/`.
 */
describe('sanitizeRedirect', () => {
  it.each([
    ['https://evil.com', 'absolute URL with scheme'],
    ['//evil.com', 'protocol-relative URL'],
    ['/\\evil.com', 'backslash-prefixed path (browser-normalized to //)'],
    ['javascript:alert(1)', 'javascript: pseudo-scheme'],
  ])('rejects %s (%s) and falls back to /', (raw) => {
    expect(sanitizeRedirect(raw)).toBe('/')
  })

  it('honors a valid same-origin internal path', () => {
    expect(sanitizeRedirect('/buckets/Necesidades')).toBe('/buckets/Necesidades')
  })

  it('falls back to / for non-string input', () => {
    expect(sanitizeRedirect(undefined)).toBe('/')
    expect(sanitizeRedirect(42)).toBe('/')
    expect(sanitizeRedirect(null)).toBe('/')
  })

  it('preserves an internal path with a query string', () => {
    expect(sanitizeRedirect('/buckets/Deseos?periodo=2026-07')).toBe('/buckets/Deseos?periodo=2026-07')
  })
})
