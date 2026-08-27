import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import type { NavItemModel } from './nav-items';

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';

const VARIANT_STYLES = {
  sidebar: {
    base: cn(
      'flex items-center gap-3 rounded-lg border-r-4 border-transparent px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-accent',
      FOCUS_RING,
    ),
    active: 'border-primary bg-accent font-semibold text-primary',
  },
  'bottom-tab': {
    base: cn(
      'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-secondary',
      FOCUS_RING,
    ),
    active: 'font-semibold text-primary',
  },
} as const;

type Variant = keyof typeof VARIANT_STYLES;

/**
 * NavItem — one entry shared by `Sidebar` and `BottomTabs` (design.md §5,
 * DRY). Every `NavItemModel` is a real, navigable route (see
 * `nav-items.ts`'s docstring — the `'placeholder'` variant that used to
 * share this type was removed once "Ayuda" was its last consumer), so this
 * always renders a real `<Link>`. Active state (current route) is exposed
 * both visually (`activeProps`, merged with the base classes — router-core
 * concatenates rather than overrides, see `link.js`) and semantically via
 * `aria-current="page"` (WDS-02).
 *
 * `bottom-tab` prefers `item.shortLabel` over `item.label` when the model
 * provides one (mobile bottom-nav redesign, Impeccable critique P1) — the
 * rendered text is the only label, so it stays the accessible name too;
 * `sidebar` always renders the full `label`.
 *
 * `VARIANT_STYLES` no longer carries a `disabled` treatment — it was the
 * announced-disabled styling for the placeholder branch removed above.
 * Nothing reads it now, so it went with the branch (YAGNI); a future
 * placeholder item re-adds both together instead of one outliving the
 * other unreferenced.
 */
export function NavItem({
  item,
  variant = 'sidebar',
}: {
  readonly item: NavItemModel;
  readonly variant?: Variant;
}) {
  const styles = VARIANT_STYLES[variant];
  const Icon = item.icon;
  // `bottom-tab` is the one presentation tight on horizontal space (5 tabs
  // across 360px) — it prefers `shortLabel` when the model provides one.
  // `sidebar` always renders the full `label`; there is no aria-label
  // divergence, since whichever text renders is also the link's accessible
  // name.
  const displayLabel =
    variant === 'bottom-tab' ? (item.shortLabel ?? item.label) : item.label;

  return (
    <Link
      to={item.to}
      activeOptions={{ exact: true }}
      activeProps={{ className: styles.active, 'aria-current': 'page' }}
      className={styles.base}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{displayLabel}</span>
    </Link>
  );
}
