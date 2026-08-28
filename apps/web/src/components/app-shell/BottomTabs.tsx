import { NAV_ITEMS } from './nav-items';
import { NavItem } from './NavItem';
import { BOTTOM_TABS_HEIGHT_CLASS } from './layout';

/**
 * BottomTabs — mobile nav bar (design.md §5): fixed bottom bar, visible only
 * below `lg` (`lg:hidden`; `AppShell`'s `<main>` reserves the matching
 * `CONTENT_BOTTOM_CLEARANCE_CLASS`, see `layout.ts`). Renders `NAV_ITEMS`
 * (DRY — the same nav model `Sidebar` renders) as icon+label tabs, filtered
 * to the five items whose `hideFromBottomTabs` is not set.
 *
 * **Mobile bottom-nav redesign (Impeccable critique P1):** the full six
 * `NAV_ITEMS` no longer fit — at 360px each tab got ~60px, and long labels
 * ("Subir nuevo archivo", "Gestionar cartolas", "Configuración") at
 * `text-xs` wrapped into 2-3 lines inside the 64px bar; six tabs also
 * exceeded the 3-5 tab convention. "Ayuda" is the one item that dropped out
 * (`nav-items.ts`'s `hideFromBottomTabs`) — it stays in `Sidebar` and gains
 * an entry inside the Configuración screen instead
 * (`ConfiguracionLayout.tsx`). The remaining five render their
 * `shortLabel` via the `bottom-tab` variant (`NavItem.tsx`) so labels fit
 * one line.
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
      {NAV_ITEMS.filter((item) => !item.hideFromBottomTabs).map((item) => (
        <NavItem key={item.label} item={item} variant="bottom-tab" />
      ))}
    </nav>
  );
}
