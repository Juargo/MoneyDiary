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
    // Anchors for the two subtle defenses that the cheap prefix guards do NOT
    // cover: dot-segment normalization collapsing to a protocol-relative
    // pathname, and control-char injection the raw-string checks can't see.
    // These only get rejected by the post-`new URL` `pathname.startsWith('//')`
    // re-check + the path-only return — pin them so a future refactor can't
    // silently drop those lines and reopen the redirect.
    ['/..//evil.com', 'dot-segment normalizing to a protocol-relative pathname'],
    ['/\t/evil.com', 'tab-injected host trick (stripped inside new URL)'],
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
