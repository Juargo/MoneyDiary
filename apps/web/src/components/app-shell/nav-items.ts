import { HelpCircle, LayoutDashboard, Settings, Upload, type LucideIcon } from 'lucide-react'

export interface NavItemModel {
  readonly label: string
  /** Present only for functional items — absence means "inert placeholder". */
  readonly to?: string
  readonly icon: LucideIcon
  readonly disabled: boolean
}

/**
 * Single source of the shell's nav model (design.md §5) — `Sidebar` and
 * `BottomTabs` both render this exact list (DRY: define the nav once,
 * render it twice per breakpoint).
 *
 * Only "Resumen" (`/`) is a functional item: it is the sole nav-worthy
 * route that exists today under `_authenticated` (`/buckets/$bucket` is a
 * drill-down destination reached from within the dashboard, not a primary
 * nav target). "Subir nuevo archivo", "Configuración", and "Ayuda" are
 * `disabled: true` placeholders (WDS-03) — visible, announced as disabled,
 * never navigable, until their routes/features exist.
 */
export const NAV_ITEMS: readonly NavItemModel[] = [
  { label: 'Resumen', to: '/', icon: LayoutDashboard, disabled: false },
  { label: 'Subir nuevo archivo', icon: Upload, disabled: true },
  { label: 'Configuración', icon: Settings, disabled: true },
  { label: 'Ayuda', icon: HelpCircle, disabled: true },
]
