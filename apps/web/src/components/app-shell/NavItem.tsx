import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import type { NavItemModel } from './nav-items'

const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800'

const VARIANT_STYLES = {
  sidebar: {
    base: cn(
      'flex items-center gap-3 rounded-lg border-r-4 border-transparent px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-accent',
      FOCUS_RING,
    ),
    active: 'border-primary bg-accent font-semibold text-primary',
    disabled: 'cursor-not-allowed text-muted-foreground opacity-50 hover:bg-transparent',
  },
  'bottom-tab': {
    base: cn('flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-secondary', FOCUS_RING),
    active: 'font-semibold text-primary',
    disabled: 'cursor-not-allowed text-muted-foreground opacity-50',
  },
} as const

type Variant = keyof typeof VARIANT_STYLES

/**
 * NavItem — one entry shared by `Sidebar` and `BottomTabs` (design.md §5,
 * DRY). Functional items (`to` present) render as a real `<Link>`; active
 * state (current route) is exposed both visually (`activeProps`, merged
 * with the base classes — router-core concatenates rather than overrides,
 * see `link.js`) and semantically via `aria-current="page"` (WDS-02).
 *
 * Disabled items (WDS-03 placeholders) render as a native `<button
 * disabled>` — no `href`, not focusable, not in the tab order, announced as
 * disabled to assistive tech out of the box. `aria-disabled="true"` is
 * added explicitly on top for tests/tooling that key off the ARIA state
 * rather than the DOM `disabled` property.
 */
export function NavItem({ item, variant = 'sidebar' }: { readonly item: NavItemModel; readonly variant?: Variant }) {
  const styles = VARIANT_STYLES[variant]
  const Icon = item.icon

  if (item.disabled || !item.to) {
    return (
      <button type="button" disabled aria-disabled="true" className={cn(styles.base, styles.disabled)}>
        <Icon className="size-5" aria-hidden="true" />
        <span>{item.label}</span>
      </button>
    )
  }

  return (
    <Link
      to={item.to}
      activeOptions={{ exact: true }}
      activeProps={{ className: styles.active, 'aria-current': 'page' }}
      className={styles.base}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  )
}
