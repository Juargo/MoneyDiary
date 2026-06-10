import { createFileRoute } from '@tanstack/react-router'
import { DashboardLayout } from '@/components/layout/dashboard-layout'

export const Route = createFileRoute('/panel')({
  component: PanelPage,
})

function PanelPage() {
  return <DashboardLayout title="Panel de Control">{null}</DashboardLayout>
}
