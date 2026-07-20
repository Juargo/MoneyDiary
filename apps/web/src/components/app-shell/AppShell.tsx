import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { BottomTabs } from './BottomTabs'

/**
 * AppShell — the responsive layout frame (design.md §5): composes `Sidebar`
 * (desktop, `lg`+) and `BottomTabs` (mobile, below `lg`) around the routed
 * content. Pure CSS breakpoint switch — `lg:pl-64` on `<main>` clears the
 * fixed sidebar, `pb-16` clears the fixed bottom bar on mobile (`lg:pb-0`
 * once the sidebar takes over). No JS media queries, no nav state: this
 * component's only job is the responsive frame (SRP) — "what's active" is
 * owned by the router and read directly inside `NavItem`.
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <main className="min-h-dvh pb-16 lg:pb-0 lg:pl-64">{children}</main>
      <BottomTabs />
    </div>
  )
}
