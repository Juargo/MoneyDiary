import type { GrupoPresupuesto } from '@/api/types'
import { cn } from '@/lib/utils'
import { formatCLP } from '@/lib/format'
import type { CategoriaSummary } from '@/lib/transactions-aggregation'
import { LucideIcon } from '@/components/patrones/lucide-icon'

type TopCategoriasCardProps = {
  categorias: CategoriaSummary[]
  totalGastoMes: number
}

const grupoStyles: Record<GrupoPresupuesto, string> = {
  Ingresos: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  Necesidades: 'bg-primary-fixed text-on-primary-fixed-variant',
  Gustos: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  Ahorro: 'bg-surface-container-highest text-on-surface',
  SinCategorizar: 'bg-surface-container-high text-on-surface-variant',
}

const grupoBars: Record<GrupoPresupuesto, string> = {
  Ingresos: 'bg-tertiary',
  Necesidades: 'bg-primary',
  Gustos: 'bg-secondary',
  Ahorro: 'bg-on-surface',
  SinCategorizar: 'bg-outline',
}

export function TopCategoriasCard({
  categorias,
  totalGastoMes,
}: TopCategoriasCardProps) {
  if (categorias.length === 0) {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Dónde se va tu plata
        </h4>
        <p className="mt-4 text-sm text-on-surface-variant">
          Aún no hay gastos registrados este mes.
        </p>
      </section>
    )
  }

  const maxGasto = categorias[0].gastado

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Dónde se va tu plata
        </h4>
        <span className="text-xs font-medium text-on-surface-variant">
          Top {categorias.length}
        </span>
      </div>

      <ol className="flex flex-col gap-4">
        {categorias.map((cat, idx) => {
          const pctTotal =
            totalGastoMes > 0
              ? Math.round((cat.gastado / totalGastoMes) * 100)
              : 0
          const barWidth = (cat.gastado / maxGasto) * 100
          return (
            <li key={`${cat.grupo}-${cat.nombre}`} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 text-xs font-bold text-on-surface-variant">
                    {idx + 1}.
                  </span>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium',
                      grupoStyles[cat.grupo],
                    )}
                  >
                    {cat.icon && <LucideIcon name={cat.icon} className="size-3" />}
                    {cat.nombre}
                  </span>
                  <span className="truncate text-xs text-on-surface-variant">
                    {cat.conteo}{' '}
                    {cat.conteo === 1 ? 'transacción' : 'transacciones'}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold text-on-surface">
                    {formatCLP(cat.gastado)}
                  </div>
                  <div className="text-[10px] text-on-surface-variant">
                    {pctTotal}% del gasto
                  </div>
                </div>
              </div>
              <div className="ml-8 h-1 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className={cn('h-full rounded-full', grupoBars[cat.grupo])}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
