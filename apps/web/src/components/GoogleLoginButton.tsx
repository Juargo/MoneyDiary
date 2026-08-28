import { useGoogleLoginVisible } from '@/api/capabilities';
import { Button } from '@/components/ui/button';

/**
 * GoogleLoginButton — a top-level `<a href>` navigation to
 * `GET /api/auth/google` (AUTH-17). This MUST stay a real anchor doing a
 * full-page navigation, never an `onClick` handler issuing `fetch`/
 * `window.location`: the backend's Sec-Fetch guard on the initiate route
 * requires a genuine top-level document navigation to send the
 * `Sec-Fetch-*` headers it checks (same reasoning as the landing page's
 * demo link, `apps/landing/src/config.ts`).
 *
 * Visibility is driven entirely by `GET /api/auth/capabilities`
 * (design.md §4.5) — the kill switch lives server-side (Render env vars),
 * never a build-time flag — via the shared `useGoogleLoginVisible()` hook
 * (`@/api/capabilities`), the single source of truth `routes/login.tsx`'s
 * auth-path divider also reads so the two can never disagree. While the
 * capability answer is still loading, an invisible placeholder reserves the
 * button's footprint so the layout does not jump once the answer arrives (no
 * flash of a dead button); once resolved to `false`, or on any fetch failure
 * (fail-closed), nothing is rendered at all.
 */
export function GoogleLoginButton() {
  const { isPending, visible } = useGoogleLoginVisible();

  if (isPending) {
    return <div aria-hidden="true" className="h-9 w-full" />;
  }

  if (!visible) {
    return null;
  }

  return (
    <Button asChild variant="outline" className="w-full">
      <a href="/api/auth/google">Continuar con Google</a>
    </Button>
  );
}
