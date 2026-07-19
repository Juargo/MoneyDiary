import { useState } from 'react'

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
 * exists.
 *
 * A11y (ADR-018): `role="status"` (as used by `states/Loading.tsx`) so
 * mounting the banner announces it to assistive technology; an explicit
 * `aria-label` gives it a distinct accessible name (other `role="status"`
 * regions — e.g. `states/Loading.tsx` — can coexist on the same page, so
 * name-based queries disambiguate them). The dismiss button carries its own
 * `aria-label` since its visible glyph ("×") alone is not descriptive.
 */
export function DemoBanner({ esDemo }: { readonly esDemo: boolean }) {
  const [descartado, setDescartado] = useState(false)

  if (!esDemo || descartado) {
    return null
  }

  return (
    <div
      role="status"
      aria-label="Aviso de modo demo"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <p className="flex-1">
        Estás en modo demo: los datos son de ejemplo y esta cuenta se elimina automáticamente.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href="https://moneydiary.cl"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white"
        >
          Crear cuenta
        </a>
        <button
          type="button"
          aria-label="Cerrar aviso de modo demo"
          onClick={() => setDescartado(true)}
          className="rounded-full px-2 py-1 text-lg leading-none text-amber-700 hover:bg-amber-100"
        >
          ×
        </button>
      </div>
    </div>
  )
}
