import { useState } from 'react';
import { useCerrarSesion } from '@/lib/use-cerrar-sesion';
import { Button } from '@/components/ui/button';

/**
 * DemoBanner (demo-trial-mode, DEMO-UI-02/DEMO-UI-04) — sticky, dismissable
 * notice shown only for demo accounts.
 *
 * Presentational and prop-driven (mirrors `SemaforoBadge`'s style): the
 * caller (`routes/_authenticated.tsx`) decides `esDemo` from the cached
 * `MeDto` already fetched by `requireSession` — no fetch happens here, and
 * none is needed (DEMO-UI-02 "MUST NOT make an additional API call").
 *
 * Dismissal is in-memory `useState`, deliberately NOT persisted to
 * localStorage/sessionStorage (design.md open question, resolved in favor of
 * "SessionScope"): `_authenticated`'s layout component — and this banner
 * mounted inside it — stays mounted across child-route navigations but
 * unmounts when the user leaves the `_authenticated` routes entirely (e.g.
 * logout → `/login`), so a fresh session naturally starts with a fresh,
 * undismissed banner (DEMO-UI-04 "reappears on new session") with no
 * persistence plumbing needed (YAGNI).
 *
 * CTA target: no in-app signup route exists yet, so "Crear cuenta" links out
 * to the public marketing site (same domain as `apps/landing`'s `SITE.url`)
 * as a provisional destination — replace with an in-app route once one
 * exists. This URL is hardcoded here and NOT imported from `apps/landing`
 * (no cross-workspace import) — if `SITE.url` changes, update this literal
 * too (accepted minor drift risk, low-impact marketing link).
 *
 * A11y (ADR-018): `role="status"` (as used by `states/Loading.tsx`) so
 * mounting the banner announces it to assistive technology; an explicit
 * `aria-label` gives it a distinct accessible name (other `role="status"`
 * regions — e.g. `states/Loading.tsx` — can coexist on the same page, so
 * name-based queries disambiguate them). The dismiss button carries its own
 * `aria-label` since its visible glyph ("×") alone is not descriptive.
 *
 * "Salir del demo" is the only in-app way out of a demo session — it now
 * shares `useCerrarSesion` (`lib/use-cerrar-sesion.ts`, design-hardening fix
 * P0) with the two real-user logout entry points instead of owning its own
 * copy of the postLogout+cache-clear+navigate sequence (DRY): `postLogout`
 * runs and its result is discarded (network/500 must not trap the user in
 * demo), the query cache is cleared (a subsequent real login must not see
 * cached demo data), then the app navigates to `/login`.
 */
export function DemoBanner({ esDemo }: { readonly esDemo: boolean }) {
  const [descartado, setDescartado] = useState(false);
  const { cerrarSesion } = useCerrarSesion();

  if (!esDemo || descartado) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Aviso de modo demo"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-warning-border bg-warning px-4 py-2 text-sm text-warning-foreground"
    >
      <p className="flex-1">
        Estás en modo demo: los datos son de ejemplo y esta cuenta se elimina
        automáticamente.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void cerrarSesion()}
          className="text-warning-foreground hover:bg-warning-accent hover:text-warning-foreground"
        >
          Salir del demo
        </Button>
        <Button asChild size="sm">
          <a
            href="https://moneydiary.cl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Crear cuenta
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Cerrar aviso de modo demo"
          onClick={() => setDescartado(true)}
          className="text-lg leading-none text-warning-foreground hover:bg-warning-accent hover:text-warning-foreground"
        >
          ×
        </Button>
      </div>
    </div>
  );
}
