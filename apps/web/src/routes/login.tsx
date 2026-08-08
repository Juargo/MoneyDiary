import { createFileRoute } from '@tanstack/react-router';
import { LoginForm } from '@/components/LoginForm';
import { GoogleLoginButton } from '@/components/GoogleLoginButton';
import { sanitizeRedirect } from '@/lib/sanitize-redirect';

export const Route = createFileRoute('/login')({
  // `sanitizeRedirect` is the security boundary for this param: it is
  // attacker-controlled (lands here straight from the URL bar), so it is
  // NEVER passed to `LoginForm`/`navigate({ to })` unvalidated — only a
  // same-origin internal path survives, everything else falls back to `/`
  // (see `lib/sanitize-redirect.ts`). Kept optional (not just possibly `/`)
  // so a rejected/absent value omits `?redirect=` from the URL entirely
  // instead of round-tripping a no-op `?redirect=/`.
  //
  // `error` (AUTH-15/AUTH-17, design.md §6.2) is the same discipline applied
  // to a second attacker-controlled param: the Google callback redirects
  // here as `/login?error=google` on ANY failure (state mismatch, no-match,
  // token failure — all indistinguishable, AUTH-15). Only the single known
  // literal `'google'` survives `validateSearch`; anything else is dropped
  // silently — the raw value is NEVER echoed into the page (no reflected-XSS
  // surface via this query param).
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; error?: 'google' } => {
    const sanitized = sanitizeRedirect(search.redirect);
    return {
      ...(sanitized === '/' ? {} : { redirect: sanitized }),
      ...(search.error === 'google' ? { error: 'google' as const } : {}),
    };
  },
  component: LoginPage,
});

/**
 * Thin container (mirrors `routes/index.tsx`): extracts the sanitized
 * `redirect`/`error` search params via `Route.useSearch()`. `LoginForm`
 * owns the actual native form state, `postLogin` call, and navigation
 * (unchanged by this slice); the Google entry point
 * (`GoogleLoginButton`) and the `?error=google` alert are rendered here,
 * below the form, reusing the same `role="alert"` style `LoginForm` uses
 * for its own failure message — no second alert component.
 */
function LoginPage() {
  const { redirect, error } = Route.useSearch();

  return (
    <div className="flex flex-col items-center gap-4">
      <LoginForm redirectTo={redirect} />
      {error === 'google' && (
        <p role="alert" className="text-sm text-red-600">
          No pudimos iniciar sesión con Google.
        </p>
      )}
      <div className="w-full max-w-sm px-8">
        <GoogleLoginButton />
      </div>
    </div>
  );
}
