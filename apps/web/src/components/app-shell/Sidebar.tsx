import { NAV_ITEMS } from './nav-items'
import { NavItem } from './NavItem'
import { SIDEBAR_WIDTH_CLASS } from './layout'

/**
 * Sidebar — desktop nav rail (design.md §5): fixed left column, visible only
 * at `lg`+ (`hidden lg:flex`; `AppShell`'s `<main>` reserves the matching
 * `SIDEBAR_CONTENT_OFFSET_CLASS`, see `layout.ts`). Brand block + the shared
 * `NAV_ITEMS` (functional + inert placeholders, WDS-02/WDS-03).
 */
export function Sidebar() {
  return (
    <nav
      aria-label="Navegación principal"
      className={`fixed inset-y-0 left-0 z-40 hidden ${SIDEBAR_WIDTH_CLASS} flex-col gap-6 border-r border-border bg-card px-4 py-6 lg:flex`}
    >
      <div className="px-3">
        <p className="text-lg font-semibold text-primary">MoneyDiary</p>
        <p className="text-xs text-muted-foreground">Sin registro. Solo analiza.</p>
      </div>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.label}>
            <NavItem item={item} variant="sidebar" />
          </li>
        ))}
      </ul>
    </nav>
  )
}
