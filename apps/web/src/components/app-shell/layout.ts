/**
 * Shared layout dimensions for the responsive nav shell (design.md §5).
 *
 * `Sidebar`'s width, `AppShell`'s content offset, `BottomTabs`' height, and
 * `AppShell`'s bottom clearance are coupled values that must change
 * together — defining each pair once here (instead of hand-copied literals
 * spread across three files) makes the coupling explicit and prevents one
 * side drifting without the other.
 *
 * Tailwind 4 needs every utility class to appear as a literal string in a
 * scanned source file (no dynamic class construction, e.g. no
 * template-built class names) — these constants satisfy that: they ARE the
 * literal classes, just imported instead of retyped.
 */

/** `Sidebar`'s fixed rail width (desktop, `lg`+). */
export const SIDEBAR_WIDTH_CLASS = 'w-64';
/** `AppShell`'s `<main>` left offset that clears the sidebar — must match `SIDEBAR_WIDTH_CLASS`. */
export const SIDEBAR_CONTENT_OFFSET_CLASS = 'lg:pl-64';

/** `BottomTabs`' fixed bar height (mobile, below `lg`). */
export const BOTTOM_TABS_HEIGHT_CLASS = 'h-16';
/** `AppShell`'s `<main>` bottom clearance that reserves space for the bottom bar — must match `BOTTOM_TABS_HEIGHT_CLASS`. */
export const CONTENT_BOTTOM_CLEARANCE_CLASS = 'pb-16 lg:pb-0';
