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
  /**
   * Shorter label for the `bottom-tab` presentation only (`NavItem.tsx`).
   * `Sidebar` always renders `label` in full — the bottom bar is the one
   * surface tight enough (5 tabs across 360px) that a label like "Subir
   * nuevo archivo" wraps into multiple lines instead of fitting one. Omit
   * this field when `label` is already short enough to work in both
   * places (e.g. "Resumen", "Registrar").
   */
  readonly shortLabel?: string;
  readonly to: NavRoute;
  readonly icon: LucideIcon;
  /**
   * When true, `BottomTabs` skips this item — it still renders in
   * `Sidebar`. Introduced for "Ayuda": 6 items across a 360px bottom bar
   * violates the 3-5 tab convention, and Ayuda is the one item mobile
   * users can reach a beat later without losing the task at hand (it gets
   * its own entry inside the Configuración screen instead, see
   * `ConfiguracionLayout.tsx`).
   */
  readonly hideFromBottomTabs?: boolean;
};

/**
 * Single source of the shell's nav model (design.md §5) — `Sidebar` and
 * `BottomTabs` both render this exact list (DRY: define the nav once,
 * present it per breakpoint instead of duplicating it).
 *
 * All six items are nav-worthy routes that exist today under
 * `_authenticated` (`/buckets/$bucket` is a drill-down destination reached
 * from within the dashboard, not a primary nav target). "Subir nuevo
 * archivo", "Gestionar cartolas", and "Configuración" (US-042, WCFG-01) were
 * each a `'placeholder'` until their route landed. "Ayuda" (WDS-03) was the
 * last placeholder — it now points at `/ayuda`, a real help page, closing
 * out the discriminated union's dead `'placeholder'` arm (see
 * `NavItemModel`'s docstring above).
 *
 * `Sidebar` still renders all six; `BottomTabs` renders only the five whose
 * `hideFromBottomTabs` is not set (mobile bottom-nav redesign, Impeccable
 * critique P1) — six tabs at 360px exceeded the 3-5 tab convention and
 * forced long labels to wrap across lines. `shortLabel` keeps the bottom
 * bar's labels to one line without inventing a second nav list.
 */
export const NAV_ITEMS: readonly NavItemModel[] = [
  { kind: 'link', label: 'Resumen', to: '/', icon: LayoutDashboard },
  {
    kind: 'link',
    label: 'Subir nuevo archivo',
    shortLabel: 'Subir',
    to: '/subir',
    icon: Upload,
  },
  { kind: 'link', label: 'Registrar', to: '/registrar', icon: PencilLine },
  {
    kind: 'link',
    label: 'Gestionar cartolas',
    shortLabel: 'Cartolas',
    to: '/ingestas',
    icon: Files,
  },
  {
    kind: 'link',
    label: 'Configuración',
    shortLabel: 'Config',
    to: '/configuracion',
    icon: Settings,
  },
  {
    kind: 'link',
    label: 'Ayuda',
    to: '/ayuda',
    icon: HelpCircle,
    hideFromBottomTabs: true,
  },
];
