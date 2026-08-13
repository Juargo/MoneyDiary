import { createFileRoute } from '@tanstack/react-router';

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
 * `component` is a thin placeholder in THIS PR (#1a) — it only proves the
 * route exists and is reachable (WCFG-01). The `?google=` read/clean effect
 * (design.md §1/Q6b) and the full page composition (`ConfiguracionPage`) land
 * in PR #1b (task 4.11) and PR #2 (task 6.1) respectively; wiring them here
 * early would render a Google-outcome message on a page with no Google
 * section, which design.md's PR #1→#2 window explicitly rejects.
 */
export const Route = createFileRoute('/_authenticated/configuracion')({
  validateSearch: (search: Record<string, unknown>): ConfiguracionSearch => {
    const valor = search.google;
    return valor === 'vinculado' || valor === 'error' ? { google: valor } : {};
  },
  component: ConfiguracionRoute,
});

function ConfiguracionRoute() {
  return <h1>Editar perfil</h1>;
}
