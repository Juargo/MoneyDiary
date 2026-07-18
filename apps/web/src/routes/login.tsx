import { createFileRoute } from '@tanstack/react-router'
import { LoginForm } from '@/components/LoginForm'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

/**
 * Thin container (mirrors `routes/index.tsx`): only extracts the optional
 * `redirect` search param via `Route.useSearch()` — `LoginForm` owns the
 * actual form state, `postLogin` call, and navigation, so it carries the
 * component test instead of this file (same reasoning as
 * `ResumenPage`/`routes/index.tsx`).
 */
function LoginPage() {
  const { redirect } = Route.useSearch()

  return <LoginForm redirectTo={redirect} />
}
