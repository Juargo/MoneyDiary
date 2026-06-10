import { createFileRoute } from '@tanstack/react-router'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { UploadHero } from '@/components/upload/upload-hero'
import { UploadDropZone } from '@/components/upload/upload-drop-zone'
import { UploadFeatures } from '@/components/upload/upload-features'
import { SupportedBanks } from '@/components/upload/supported-banks'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <DashboardLayout title="">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 py-10">
        <UploadHero />
        <UploadDropZone />
        <UploadFeatures />
        <SupportedBanks />
      </div>
    </DashboardLayout>
  )
}
