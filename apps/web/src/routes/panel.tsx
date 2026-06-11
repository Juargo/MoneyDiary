import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { IncomeCard } from '@/components/panel/income-card'
import { BudgetDistributionCard } from '@/components/panel/budget-distribution-card'
import { CategoryCard } from '@/components/panel/category-card'
import { TopCategoriasCard } from '@/components/panel/top-categorias-card'
import {
  PeriodFilter,
  type PeriodMode,
} from '@/components/panel/period-filter'
import { UploadPromptCard } from '@/components/transactions/upload-prompt-card'
import { useTransacciones } from '@/api/use-transacciones'
import {
  agruparPorAnio,
  agruparPorMes,
  resumenBuckets,
  topCategoriasGasto,
} from '@/lib/transactions-aggregation'

export const Route = createFileRoute('/panel')({
  component: PanelPage,
})

function PanelPage() {
  const navigate = useNavigate()
  const query = useTransacciones()
  const [mode, setMode] = useState<PeriodMode>('mes')
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string | null>(
    null,
  )

  const transacciones = query.data?.transacciones ?? []

  const periodos = useMemo(
    () =>
      mode === 'mes'
        ? agruparPorMes(transacciones)
        : agruparPorAnio(transacciones),
    [transacciones, mode],
  )

  // Cambiar de modo resetea la selección al período más reciente disponible.
  const periodoActual =
    periodos.find((p) => p.key === periodoSeleccionado) ?? periodos[0] ?? null

  const handleModeChange = (nextMode: PeriodMode) => {
    setMode(nextMode)
    setPeriodoSeleccionado(null)
  }

  if (query.isPending) {
    return (
      <DashboardLayout title="Panel de Control">
        <PanelSkeleton />
      </DashboardLayout>
    )
  }

  if (query.isError) {
    return (
      <DashboardLayout title="Panel de Control">
        <div className="mx-auto max-w-[1280px]">
          <div className="flex items-start gap-3 rounded-lg border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container">
            <AlertCircle className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
            <div>
              <p className="font-semibold">
                No se pudieron cargar las transacciones
              </p>
              <p className="mt-1 opacity-90">{query.error.message}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!periodoActual) {
    return (
      <DashboardLayout title="Panel de Control">
        <div className="mx-auto max-w-[1280px]">
          <UploadPromptCard
            title="Sube tu primera cartola"
            description="Aún no hay datos para analizar. Sube una cartola .xlsx para ver el resumen de tus finanzas."
            ctaLabel="Subir archivo"
            onCtaClick={() => navigate({ to: '/' })}
          />
        </div>
      </DashboardLayout>
    )
  }

  const periodosOpts = periodos.map((p) => ({ key: p.key, label: p.label }))
  const buckets = resumenBuckets(periodoActual)
  const topCategorias = topCategoriasGasto(periodoActual, 5)
  const totalGasto = periodoActual.items.reduce((s, t) => s + t.cargo, 0)
  const usandoFallback =
    mode === 'mes' &&
    periodoActual.ingresoMes === 0 &&
    periodoActual.ingresoBase > 0

  const distributionRows = (['Necesidades', 'Gustos', 'Ahorro'] as const).map(
    (grupo) => {
      const b = buckets.find((x) => x.grupo === grupo)
      const actualPct =
        b && totalGasto > 0 ? Math.round((b.gastado / totalGasto) * 100) : 0
      const idealPct = b?.porcentajeIdeal
        ? Math.round(b.porcentajeIdeal * 100)
        : 0
      return { grupo, actualPct, idealPct }
    },
  )

  const sinCategorizar = buckets.find((b) => b.grupo === 'SinCategorizar')
  const sinCategorizarPct =
    sinCategorizar && totalGasto > 0
      ? Math.round((sinCategorizar.gastado / totalGasto) * 100)
      : 0

  const categoryCards: Array<{
    grupo: 'Necesidades' | 'Gustos' | 'Ahorro'
    variant: 'needs' | 'wants' | 'savings'
    label: string
  }> = [
    { grupo: 'Necesidades', variant: 'needs', label: 'Necesidades' },
    { grupo: 'Gustos', variant: 'wants', label: 'Gustos' },
    { grupo: 'Ahorro', variant: 'savings', label: 'Ahorro' },
  ]

  return (
    <DashboardLayout title="Panel de Control">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
        <PeriodFilter
          mode={mode}
          onModeChange={handleModeChange}
          periodos={periodosOpts}
          periodoActual={{
            key: periodoActual.key,
            label: periodoActual.label,
          }}
          onPeriodoChange={setPeriodoSeleccionado}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
          <div className="flex flex-col gap-6 lg:col-span-4">
            <IncomeCard
              periodoLabel={periodoActual.label}
              amount={periodoActual.ingresoBase}
              usandoFallback={usandoFallback}
            />

            <BudgetDistributionCard
              rows={distributionRows}
              sinCategorizarPct={sinCategorizarPct}
            />
          </div>

          <div className="flex flex-col gap-4 lg:col-span-6">
            {categoryCards.map((cfg) => {
              const b = buckets.find((x) => x.grupo === cfg.grupo)
              const gastado = b?.gastado ?? 0
              const presupuesto = b?.presupuesto ?? 0
              const exceeded = presupuesto > 0 && gastado > presupuesto
              return (
                <CategoryCard
                  key={cfg.grupo}
                  variant={cfg.variant}
                  label={cfg.label}
                  spent={gastado}
                  budget={presupuesto}
                  exceeded={exceeded}
                />
              )
            })}

            <TopCategoriasCard
              categorias={topCategorias}
              totalGastoMes={totalGasto}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function PanelSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
        <div className="flex flex-col gap-6 lg:col-span-4">
          <div className="h-44 animate-pulse rounded-xl bg-surface-container" />
          <div className="h-96 animate-pulse rounded-xl bg-surface-container" />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl bg-surface-container"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
