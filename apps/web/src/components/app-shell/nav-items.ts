import {
  Files,
  HelpCircle,
  LayoutDashboard,
  PencilLine,
  Settings,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { FileRouteTypes } from '@/routeTree.gen';

/** Any route the app router actually knows about — typos fail `tsc`, not just at runtime. */
export type NavRoute = FileRouteTypes['to'];

/**
 * Every nav item is a real, navigable route. `kind: 'link'` used to sit
 * alongside a `'placeholder'` variant (inert, announced-disabled, for
 * WDS-03 items awaiting their route) — "Ayuda" was the last one standing,
 * so once it converted (its own `/ayuda` route shipped) `'placeholder'` had
 * no remaining consumer anywhere in `NAV_ITEMS` and became dead code: a
 * discriminant with only one live arm is not a discriminated union, it is a
 * single shape wearing a tag. Removed rather than kept "for the next
 * placeholder" (YAGNI) — a future gap re-adds the variant when it actually
 * has a second consumer, the same way this one is not the same variant
 * `Sidebar` used to render (see `NavItem.tsx`'s inline history, and re-add
 * the `NavItem.test.tsx`/`Sidebar.test.tsx`/`BottomTabs.test.tsx` disabled-
 * control coverage alongside it if it comes back).
 */
export type NavItemModel = {
  readonly kind: 'link';
  readonly label: string;
  readonly to: NavRoute;
  readonly icon: LucideIcon;
};

/**
 * Single source of the shell's nav model (design.md §5) — `Sidebar` and
 * `BottomTabs` both render this exact list (DRY: define the nav once,
 * render it twice per breakpoint).
 *
 * All six items are nav-worthy routes that exist today under
 * `_authenticated` (`/buckets/$bucket` is a drill-down destination reached
 * from within the dashboard, not a primary nav target). "Subir nuevo
 * archivo", "Gestionar cartolas", and "Configuración" (US-042, WCFG-01) were
 * each a `'placeholder'` until their route landed. "Ayuda" (WDS-03) was the
 * last placeholder — it now points at `/ayuda`, a real help page, closing
 * out the discriminated union's dead `'placeholder'` arm (see
 * `NavItemModel`'s docstring).
 */
export const NAV_ITEMS: readonly NavItemModel[] = [
  { kind: 'link', label: 'Resumen', to: '/', icon: LayoutDashboard },
  { kind: 'link', label: 'Subir nuevo archivo', to: '/subir', icon: Upload },
  { kind: 'link', label: 'Registrar', to: '/registrar', icon: PencilLine },
  { kind: 'link', label: 'Gestionar cartolas', to: '/ingestas', icon: Files },
  {
    kind: 'link',
    label: 'Configuración',
    to: '/configuracion',
    icon: Settings,
  },
  { kind: 'link', label: 'Ayuda', to: '/ayuda', icon: HelpCircle },
];
