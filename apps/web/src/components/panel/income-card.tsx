import { Calendar } from 'lucide-react'
import { formatCLP } from '@/lib/format'

type IncomeCardProps = {
  periodoLabel: string
  amount: number
  usandoFallback: boolean
}

export function IncomeCard({
  periodoLabel,
  amount,
  usandoFallback,
}: IncomeCardProps) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-2 text-sm font-medium text-on-surface-variant">
        <Calendar className="size-4" strokeWidth={1.75} />
        {periodoLabel}
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        Ingresos Totales
      </p>
      <h3 className="mt-1 text-4xl font-bold text-primary">
        {formatCLP(amount)}
      </h3>
      <p className="mt-3 text-sm text-on-surface-variant">
        {usandoFallback
          ? 'Estimado en base al mes anterior'
          : 'ingresos del período'}
      </p>
    </section>
  )
}
