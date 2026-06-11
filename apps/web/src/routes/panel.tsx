import { createFileRoute } from '@tanstack/react-router'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { IncomeCard } from '@/components/panel/income-card'
import { BudgetDistributionCard } from '@/components/panel/budget-distribution-card'
import { CategoryCard } from '@/components/panel/category-card'
import { TipCard } from '@/components/panel/tip-card'
import { DataVizPlaceholder } from '@/components/panel/data-viz-placeholder'

export const Route = createFileRoute('/panel')({
  component: PanelPage,
})

function PanelPage() {
  return (
    <DashboardLayout title="Panel de Control">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
          <div className="flex flex-col gap-6 lg:col-span-4">
            <IncomeCard period="Mayo 2026" amount={2_100_000} />

            <BudgetDistributionCard
              rows={[
                { key: 'needs', label: 'Necesidades', actual: 50, ideal: 50 },
                { key: 'wants', label: 'Gustos', actual: 32, ideal: 30 },
                { key: 'savings', label: 'Ahorro', actual: 18, ideal: 20 },
              ]}
            />
          </div>

          <div className="flex flex-col gap-4 lg:col-span-6">
            <CategoryCard
              variant="needs"
              label="Necesidades"
              spent={1_050_000}
              budget={1_050_000}
            />
            <CategoryCard
              variant="wants"
              label="Gustos"
              spent={672_000}
              budget={630_000}
              exceeded
            />
            <CategoryCard
              variant="savings"
              label="Ahorro"
              spent={378_000}
              budget={420_000}
            />

            <TipCard
              badge="Tip Financiero"
              title="Podrías ahorrar $180.000 este mes"
              description='Hemos detectado 3 suscripciones inactivas y un gasto inusual en "Delivery" que podrías optimizar para alcanzar tu meta de ahorro del 20%.'
              ctaLabel="Ver detalles"
            />

            <DataVizPlaceholder />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
