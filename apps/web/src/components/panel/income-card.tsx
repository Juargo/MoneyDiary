import { Calendar, ChevronDown, Info } from 'lucide-react'
import { formatCLP } from '@/lib/format'

type IncomeCardProps = {
  period: string
  amount: number
}

export function IncomeCard({ period, amount }: IncomeCardProps) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between text-on-surface-variant">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary"
        >
          <Calendar className="size-4" strokeWidth={1.75} />
          {period}
          <ChevronDown className="size-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          aria-label="Más información"
          className="text-on-surface-variant transition-colors hover:text-primary"
        >
          <Info className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        Ingresos Totales
      </p>
      <h3 className="mt-1 text-4xl font-bold text-primary">{formatCLP(amount)}</h3>
      <p className="mt-3 text-sm text-on-surface-variant">ingresos</p>
    </section>
  )
}
