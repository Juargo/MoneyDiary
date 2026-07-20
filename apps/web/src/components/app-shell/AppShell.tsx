import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { BottomTabs } from './BottomTabs'
import { CONTENT_BOTTOM_CLEARANCE_CLASS, SIDEBAR_CONTENT_OFFSET_CLASS } from './layout'

/**
 * AppShell — the responsive layout frame (design.md §5): composes `Sidebar`
 * (desktop, `lg`+) and `BottomTabs` (mobile, below `lg`) around the routed
 * content. Pure CSS breakpoint switch — `SIDEBAR_CONTENT_OFFSET_CLASS` on
 * `<main>` clears the fixed sidebar, `CONTENT_BOTTOM_CLEARANCE_CLASS` clears
 * the fixed bottom bar on mobile (see `layout.ts` for the paired constants
 * that keep these in sync with `Sidebar`/`BottomTabs`' own dimensions). No
 * JS media queries, no nav state: this component's only job is the
 * responsive frame (SRP) — "what's active" is owned by the router and read
 * directly inside `NavItem`.
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <main className={`min-h-dvh ${CONTENT_BOTTOM_CLEARANCE_CLASS} ${SIDEBAR_CONTENT_OFFSET_CLASS}`}>{children}</main>
      <BottomTabs />
    </div>
  )
}
