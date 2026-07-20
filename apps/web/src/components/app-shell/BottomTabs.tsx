import { NAV_ITEMS } from './nav-items'
import { NavItem } from './NavItem'
import { BOTTOM_TABS_HEIGHT_CLASS } from './layout'

/**
 * BottomTabs — mobile nav bar (design.md §5): fixed bottom bar, visible only
 * below `lg` (`lg:hidden`; `AppShell`'s `<main>` reserves the matching
 * `CONTENT_BOTTOM_CLEARANCE_CLASS`, see `layout.ts`). Renders the same
 * `NAV_ITEMS` as `Sidebar` (DRY — one nav model, two responsive
 * presentations) as icon+label tabs.
 *
 * The `aria-label` intentionally differs from `Sidebar`'s ("... (móvil)")
 * so the two landmarks never collide on accessible name — in a real browser
 * only one is ever in the accessibility tree at a time (the other is
 * `display:none` via the responsive utility), but distinct names keep the
 * pair unambiguous for tooling/tests that don't evaluate CSS (jsdom).
 */
export function BottomTabs() {
  return (
    <nav
      aria-label="Navegación principal (móvil)"
      className={`fixed inset-x-0 bottom-0 z-40 flex ${BOTTOM_TABS_HEIGHT_CLASS} border-t border-border bg-card lg:hidden`}
    >
      {NAV_ITEMS.map((item) => (
        <NavItem key={item.label} item={item} variant="bottom-tab" />
      ))}
    </nav>
  )
}
