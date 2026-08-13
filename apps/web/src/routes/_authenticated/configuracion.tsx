import { createFileRoute } from '@tanstack/react-router';
import { ConfiguracionPage } from '@/components/configuracion/ConfiguracionPage';

type ConfiguracionSearch = { readonly google?: 'vinculado' | 'error' };

/**
 * `/configuracion` — session-protected for free by nesting under the
 * pathless `_authenticated` layout (WCFG-01; zero new guard code, same
 * pattern as every other `_authenticated/*` route).
 *
 * `validateSearch` narrows `?google=` to the literal union `'vinculado' |
 * 'error'` (US-042 design.md §1/Q6a): any other value — a typo, a hostile
 * string, an array, an object — is dropped to `undefined`. This is the
 * `sanitizeRedirect` discipline `/login` already applies to `?redirect=`: the
 * URL SELECTS a client constant, it never supplies content that gets
 * rendered or interpolated.
 *
 * `component` renders the full `ConfiguracionPage` composition as of PR #1b
 * (task 4.11) — the `?google=` read/clean effect (design.md §1/Q6b) still
 * lands in PR #2 (task 6.1); reading `google` here early would render a
 * Google-outcome message on a page with no Google section yet, which
 * design.md's PR #1→#2 window explicitly rejects. `search.google` is
 * therefore still validated (so the URL never carries an un-narrowed value
 * through this route) but deliberately unused by `component` until then.
 */
export const Route = createFileRoute('/_authenticated/configuracion')({
  validateSearch: (search: Record<string, unknown>): ConfiguracionSearch => {
    const valor = search.google;
    return valor === 'vinculado' || valor === 'error' ? { google: valor } : {};
  },
  component: ConfiguracionPage,
});
