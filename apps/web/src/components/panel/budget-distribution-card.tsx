import type { GrupoPresupuesto } from '@/api/types'
import { cn } from '@/lib/utils'

const CIRCUMFERENCE = 2 * Math.PI * 40 // r=40

const segmentColors: Record<
  Exclude<GrupoPresupuesto, 'Ingresos' | 'SinCategorizar'>,
  string
> = {
  Necesidades: '#afc7f3',
  Gustos: '#cbc1ec',
  Ahorro: '#dac589',
}

const grupoLabels: Record<
  Exclude<GrupoPresupuesto, 'Ingresos' | 'SinCategorizar'>,
  string
> = {
  Necesidades: 'Necesidades',
  Gustos: 'Gustos',
  Ahorro: 'Ahorro',
}

type DistributionRow = {
  grupo: Exclude<GrupoPresupuesto, 'Ingresos' | 'SinCategorizar'>
  actualPct: number // 0–100
  idealPct: number // 0–100
}

type BudgetDistributionCardProps = {
  rows: DistributionRow[]
  sinCategorizarPct: number // 0–100
}

export function BudgetDistributionCard({
  rows,
  sinCategorizarPct,
}: BudgetDistributionCardProps) {
  let cumulative = 0
  const segments = rows.map((row) => {
    const length = (row.actualPct / 100) * CIRCUMFERENCE
    const offset = -cumulative
    cumulative += length
    return { ...row, length, offset }
  })

  return (
    <section className="flex flex-col items-center rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <h4 className="mb-6 self-start text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        Distribución del Gasto
      </h4>

      <div className="relative mb-8 size-56">
        <svg
          className="size-full -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="transparent"
            strokeWidth="12"
            className="stroke-surface-container-high"
          />
          {segments.map((segment) => (
            <circle
              key={segment.grupo}
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              strokeWidth="12"
              stroke={segmentColors[segment.grupo]}
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
              strokeDashoffset={segment.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-primary">50/30/20</span>
          <span className="text-xs uppercase tracking-wider text-on-surface-variant">
            Modelo
          </span>
        </div>
      </div>

      <div className="w-full space-y-3">
        {rows.map((row) => {
          const over = row.actualPct > row.idealPct
          return (
            <div
              key={row.grupo}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ backgroundColor: segmentColors[row.grupo] }}
                />
                <span className="font-medium text-on-surface">
                  {grupoLabels[row.grupo]}
                </span>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    'font-bold',
                    over ? 'text-error' : 'text-on-surface',
                  )}
                >
                  {row.actualPct}%
                </span>
                <span className="ml-1 text-xs font-normal text-on-surface-variant">
                  / Ideal {row.idealPct}%
                </span>
              </div>
            </div>
          )
        })}

        {sinCategorizarPct > 0 && (
          <div className="border-t border-outline-variant/40 pt-3 text-xs text-on-surface-variant">
            <span className="font-medium">Sin categorizar:</span>{' '}
            {sinCategorizarPct}% del gasto · categorízalas para mejorar la
            distribución.
          </div>
        )}
      </div>
    </section>
  )
}
