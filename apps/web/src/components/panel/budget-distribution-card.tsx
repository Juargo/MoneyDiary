import { cn } from '@/lib/utils'

const CIRCUMFERENCE = 2 * Math.PI * 40 // r=40

const segmentColors = {
  needs: '#afc7f3',
  wants: '#cbc1ec',
  savings: '#dac589',
} as const

type DistributionRow = {
  key: 'needs' | 'wants' | 'savings'
  label: string
  actual: number
  ideal: number
}

type BudgetDistributionCardProps = {
  rows: DistributionRow[]
}

export function BudgetDistributionCard({ rows }: BudgetDistributionCardProps) {
  let cumulative = 0
  const segments = rows.map((row) => {
    const length = (row.actual / 100) * CIRCUMFERENCE
    const offset = -cumulative
    cumulative += length
    return { ...row, length, offset }
  })

  return (
    <section className="flex flex-col items-center rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <h4 className="mb-6 self-start text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        Distribución del Presupuesto
      </h4>

      <div className="relative mb-8 size-56">
        <svg
          className="size-full -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          {segments.map((segment) => (
            <circle
              key={segment.key}
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              strokeWidth="12"
              stroke={segmentColors[segment.key]}
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
          const over = row.actual > row.ideal
          return (
            <div
              key={row.key}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ backgroundColor: segmentColors[row.key] }}
                />
                <span className="font-medium text-on-surface">{row.label}</span>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    'font-bold',
                    over ? 'text-error' : 'text-on-surface',
                  )}
                >
                  {row.actual}%
                </span>
                <span className="ml-1 text-xs font-normal text-on-surface-variant">
                  / Ideal {row.ideal}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
