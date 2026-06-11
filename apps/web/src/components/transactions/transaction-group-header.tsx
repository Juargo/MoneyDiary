import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCLPSigned } from '@/lib/format'
import type { GrupoPresupuesto } from '@/api/types'

type TransactionGroupHeaderProps = {
  grupo: GrupoPresupuesto
  label: string
  icon: LucideIcon
  count: number
  total: number
}

const grupoStyles: Record<GrupoPresupuesto, string> = {
  Necesidades: 'text-primary',
  Gustos: 'text-secondary',
  Ahorro: 'text-tertiary',
  SinCategorizar: 'text-on-surface-variant',
}

export function TransactionGroupHeader({
  grupo,
  label,
  icon: Icon,
  count,
  total,
}: TransactionGroupHeaderProps) {
  return (
    <tr className="bg-surface-container-low">
      <td className="whitespace-nowrap px-6 py-3">
        <div className="flex items-center gap-3">
          <Icon
            className={cn('size-4 shrink-0', grupoStyles[grupo])}
            strokeWidth={2}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
            {label}
          </span>
        </div>
      </td>
      <td
        colSpan={2}
        className="px-6 py-3 text-xs font-medium text-on-surface-variant"
      >
        {count} {count === 1 ? 'transacción' : 'transacciones'}
      </td>
      <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-bold text-on-surface">
        {formatCLPSigned(total)}
      </td>
    </tr>
  )
}
