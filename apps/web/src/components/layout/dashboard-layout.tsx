import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { DashboardFooter } from './dashboard-footer'

type DashboardLayoutProps = {
  title: string
  children: ReactNode
}

export function DashboardLayout({ title, children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-background text-on-background">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={title} />

        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>

        <DashboardFooter />
      </div>
    </div>
  )
}
