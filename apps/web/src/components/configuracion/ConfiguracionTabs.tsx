import { Link } from '@tanstack/react-router';

const TAB_BASE =
  'block rounded-md px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50';
const TAB_ACTIVE = 'bg-slate-100 font-semibold text-slate-900';

/**
 * ConfiguracionTabs — the section-tab list, now shared chrome rendered once
 * by `ConfiguracionLayout` (US-043 design.md §1/Q1a) rather than owned by
 * `ConfiguracionPage`. Both entries are real `<Link>`s to their own route
 * (`NavItem.tsx`'s `activeProps` idiom, DRY): `aria-current="page"` is
 * derived from the actual matched route, never hardcoded — a static
 * `aria-current` on `Perfil` would leave TWO tabs claiming to be current the
 * moment `/configuracion/categorias` became reachable, which is exactly the
 * a11y defect a tab list must not have (proposal §7).
 *
 * `Categorías` replaces the disabled placeholder `<button>` this file used
 * to render (`NavItem.tsx:56-68`'s "not built yet" treatment) — WCTG-01: it
 * is now a real, active link on its own route.
 *
 * `activeOptions={{ exact: true }}` on `Perfil` stops `/configuracion` from
 * matching as a PREFIX once `/configuracion/categorias` exists — otherwise
 * both tabs would show active at once on the Categorías route.
 */
export function ConfiguracionTabs() {
  return (
    <nav aria-label="Secciones de configuración">
      <ul className="flex flex-col gap-1">
        <li>
          <Link
            to="/configuracion"
            activeOptions={{ exact: true }}
            activeProps={{ className: TAB_ACTIVE, 'aria-current': 'page' }}
            className={TAB_BASE}
          >
            Perfil
          </Link>
        </li>
        <li>
          <Link
            to="/configuracion/categorias"
            activeProps={{ className: TAB_ACTIVE, 'aria-current': 'page' }}
            className={TAB_BASE}
          >
            Categorías
          </Link>
        </li>
      </ul>
    </nav>
  );
}
