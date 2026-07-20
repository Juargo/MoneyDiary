import { HelpCircle, LayoutDashboard, Settings, Upload, type LucideIcon } from 'lucide-react'
import type { FileRouteTypes } from '@/routeTree.gen'

/** Any route the app router actually knows about — typos fail `tsc`, not just at runtime. */
export type NavRoute = FileRouteTypes['to']

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
  | { readonly kind: 'link'; readonly label: string; readonly to: NavRoute; readonly icon: LucideIcon }
  | { readonly kind: 'placeholder'; readonly label: string; readonly icon: LucideIcon }

/**
 * Single source of the shell's nav model (design.md §5) — `Sidebar` and
 * `BottomTabs` both render this exact list (DRY: define the nav once,
 * render it twice per breakpoint).
 *
 * "Resumen" (`/`) and "Subir nuevo archivo" (`/subir`) are `'link'` items:
 * both are nav-worthy routes that exist today under `_authenticated`
 * (`/buckets/$bucket` is a drill-down destination reached from within the
 * dashboard, not a primary nav target). "Subir nuevo archivo" was a
 * `'placeholder'` until the `upload-cartola-ui` route landed — now it is a
 * live link. "Configuración" and "Ayuda" stay `'placeholder'` items
 * (WDS-03) — visible, announced as disabled, never navigable, until their
 * routes/features exist.
 */
export const NAV_ITEMS: readonly NavItemModel[] = [
  { kind: 'link', label: 'Resumen', to: '/', icon: LayoutDashboard },
  { kind: 'link', label: 'Subir nuevo archivo', to: '/subir', icon: Upload },
  { kind: 'placeholder', label: 'Configuración', icon: Settings },
  { kind: 'placeholder', label: 'Ayuda', icon: HelpCircle },
]
