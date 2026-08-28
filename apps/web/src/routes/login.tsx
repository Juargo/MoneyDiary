import { createFileRoute } from '@tanstack/react-router';
import { LoginForm } from '@/components/LoginForm';
import { GoogleLoginButton } from '@/components/GoogleLoginButton';
import { BrandBlock } from '@/components/BrandBlock';
import { useGoogleLoginVisible } from '@/api/capabilities';
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
 *
 * Brand + surface treatment (impeccable critique round 7, P1): before this,
 * `/login` was the only screen with no MoneyDiary wordmark and no Serene
 * Finance card — it could have belonged to any SaaS. `BrandBlock` (shared
 * with `Sidebar`) sits above a white card on the app's Pale Sky background;
 * the password form and the Google entry point live inside that one card so
 * the two auth paths read as one surface, not two stacked forms.
 *
 * `useGoogleLoginVisible()` (`@/api/capabilities`) is the single source of
 * truth for the "o" divider's visibility — the exact same derivation
 * `GoogleLoginButton` uses internally, so the two can never disagree about
 * whether the Google path is showing. It's a second call to the same
 * TanStack Query key `useAuthCapabilities` uses, so the underlying fetch is
 * deduped — this page never issues a second network request.
 */
function LoginPage() {
  const { redirect, error } = Route.useSearch();
  const { visible: showGoogleGroup } = useGoogleLoginVisible();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <BrandBlock asHeading />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <LoginForm redirectTo={redirect} />
        {error === 'google' && (
          <p role="alert" className="text-sm text-destructive">
            No pudimos iniciar sesión con Google.
          </p>
        )}
        {showGoogleGroup && (
          <div className="flex items-center gap-3">
            <hr className="h-px flex-1 border-0 bg-border" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">o</span>
            <hr className="h-px flex-1 border-0 bg-border" aria-hidden="true" />
          </div>
        )}
        <GoogleLoginButton />
      </div>
    </div>
  );
}
