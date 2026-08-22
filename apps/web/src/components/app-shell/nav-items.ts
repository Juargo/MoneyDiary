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
 * Nav items are a discriminated union on `kind`, not a `to?`/`disabled`
 * pair: "functional" (navigable, real route) and "placeholder" (inert,
 * announced-disabled) are mutually exclusive concepts, so there is exactly
 * one field (`kind`) that decides which shape — and therefore which shape
 * of `NavItem` renders — instead of two independently-settable flags that
 * could only be kept in sync by convention (`disabled: false` with no `to`,
 * or `disabled: true` with a stray `to`, were both previously representable
 * but meaningless).
 */
export type NavItemModel =
  | {
      readonly kind: 'link';
      readonly label: string;
      readonly to: NavRoute;
      readonly icon: LucideIcon;
    }
  | {
      readonly kind: 'placeholder';
      readonly label: string;
      readonly icon: LucideIcon;
    };

/**
 * Single source of the shell's nav model (design.md §5) — `Sidebar` and
 * `BottomTabs` both render this exact list (DRY: define the nav once,
 * render it twice per breakpoint).
 *
 * "Resumen" (`/`), "Subir nuevo archivo" (`/subir`), and "Gestionar
 * cartolas" (`/ingestas`) are `'link'` items: all three are nav-worthy
 * routes that exist today under `_authenticated` (`/buckets/$bucket` is a
 * drill-down destination reached from within the dashboard, not a primary
 * nav target). "Subir nuevo archivo" was a `'placeholder'` until the
 * `upload-cartola-ui` route landed; "Gestionar cartolas" likewise was a gap
 * until `us-018-eliminar-ingesta` Slice 2 landed the `/ingestas` route
 * (T2.13) — now both are live links. "Configuración" (US-042, WCFG-01) is
 * now a live link too, to `/configuracion`. "Ayuda" stays a `'placeholder'`
 * item (WDS-03) — visible, announced as disabled, never navigable, until its
 * route/feature exists.
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
  { kind: 'placeholder', label: 'Ayuda', icon: HelpCircle },
];
