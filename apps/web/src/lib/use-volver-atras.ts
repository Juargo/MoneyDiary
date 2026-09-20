import { useCanGoBack, useRouter } from '@tanstack/react-router';

/**
 * useVolverAtras (issue #752) — a "volver" control returns to the screen
 * the user actually came from, instead of a hard-coded destination that
 * loses whatever context (period, scroll position, in-progress state) the
 * previous screen had.
 *
 * **Why `useCanGoBack` and not raw browser history:** TanStack Router's
 * `location.state.__TSR_index` is maintained by the router's OWN history
 * wrapper, not the browser's session-history length. Two properties make it
 * the honest signal this needs (`@tanstack/history`'s `createBrowserHistory`,
 * `index.js`):
 *
 * 1. It resets to `0` on every fresh page load that carries no existing
 *    `__TSR_key` in `window.history.state` — i.e. a direct URL open, an
 *    external link, or a hard reload of a tab that never navigated in-app.
 *    `puedeVolver` is `false` in exactly that case, so this hook NEVER calls
 *    `history.back()` past the edge of the SPA session — the failure mode
 *    the issue calls out as "worse than the bug" (popping the user out to
 *    whatever the browser had open before this app).
 * 2. It only increments on navigations the router itself performed, so
 *    `puedeVolver` genuinely means "there is an in-app screen to return to",
 *    not just "the browser tab has *a* history entry".
 *
 * `volverAtras` calls `router.history.back()` (not `router.navigate`) so the
 * destination — route, search params (e.g. `periodo`), and scroll
 * restoration, where the browser/router provides it) — is whatever the
 * PREVIOUS screen actually was, not a guess.
 *
 * Callers MUST render a fixed fallback destination when `puedeVolver` is
 * `false` (a plain `<Link>`), and should NOT reuse the "back" label for that
 * fallback — the fallback's destination is a known, fixed place, while a
 * real back can land anywhere the user came from (see call sites).
 */
export function useVolverAtras() {
  const puedeVolver = useCanGoBack();
  const router = useRouter();

  return {
    puedeVolver,
    volverAtras: () => router.history.back(),
  } as const;
}
