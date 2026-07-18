import { createFileRoute } from '@tanstack/react-router'
import { LoginForm } from '@/components/LoginForm'
import { sanitizeRedirect } from '@/lib/sanitize-redirect'

export const Route = createFileRoute('/login')({
  // `sanitizeRedirect` is the security boundary for this param: it is
  // attacker-controlled (lands here straight from the URL bar), so it is
  // NEVER passed to `LoginForm`/`navigate({ to })` unvalidated — only a
  // same-origin internal path survives, everything else falls back to `/`
  // (see `lib/sanitize-redirect.ts`). Kept optional (not just possibly `/`)
  // so a rejected/absent value omits `?redirect=` from the URL entirely
  // instead of round-tripping a no-op `?redirect=/`.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const sanitized = sanitizeRedirect(search.redirect)
    return sanitized === '/' ? {} : { redirect: sanitized }
  },
  component: LoginPage,
})

/**
 * Thin container (mirrors `routes/index.tsx`): only extracts the sanitized
 * `redirect` search param via `Route.useSearch()` — `LoginForm` owns the
 * actual form state, `postLogin` call, and navigation, so it carries the
 * component test instead of this file (same reasoning as
 * `ResumenPage`/`routes/index.tsx`).
 */
function LoginPage() {
  const { redirect } = Route.useSearch()

  return <LoginForm redirectTo={redirect} />
}
