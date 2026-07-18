const FALLBACK = '/'

/**
 * sanitizeRedirect — the ONLY gate between the `?redirect=` search param on
 * `/login` and `navigate({ to })` (follow-up to AUTH-10). Mirrors
 * `apps/web/api/[...path].ts`'s `resolveSafePath` intent: only a
 * same-origin-relative path+query is allowed through — absolute URLs,
 * protocol-relative URLs (`//host/...`), backslash-prefixed paths, and any
 * scheme (`javascript:`, `http:`, ...) are rejected in favor of falling back
 * to `/`. Never pass the raw search value to `navigate({ to })` directly.
 */
export function sanitizeRedirect(raw: unknown): string {
  if (typeof raw !== 'string') return FALLBACK
  if (!raw.startsWith('/')) return FALLBACK
  if (raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('\\')) return FALLBACK
  if (raw.includes('://')) return FALLBACK

  // Re-parse against a throwaway base to normalize path+query and catch
  // anything that still resolves outside a single-leading-slash path.
  const parsed = new URL(raw, 'http://sanitize-redirect-base.invalid')
  if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return FALLBACK

  return `${parsed.pathname}${parsed.search}`
}
