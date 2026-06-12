import { cn } from '@/lib/utils'
import { formatCLPSigned, formatFechaCorta } from '@/lib/format'
import type { Transaccion } from '@/api/types'
import { EditableCategoryChip } from './category-chip'

type TransactionRowProps = {
  transaccion: Transaccion
}

export function TransactionRow({ transaccion }: TransactionRowProps) {
  const amount = transaccion.abono > 0 ? transaccion.abono : -transaccion.cargo
  const isPositive = amount > 0

  return (
    <div className="grid grid-cols-[18%_42%_22%_18%] items-center border-t border-outline-variant/40 px-6 py-4">
      <div className="whitespace-nowrap text-sm text-on-surface-variant">
        {formatFechaCorta(transaccion.fecha)}
      </div>
      <div className="pr-4 text-sm font-semibold text-on-surface">
        <span className="line-clamp-1">{transaccion.descripcion}</span>
      </div>
      <div>
        <EditableCategoryChip
          transactionId={transaccion.id}
          label={transaccion.categoria.nombre}
          grupo={transaccion.categoria.grupo}
          icon={transaccion.categoria.icon}
        />
      </div>
      <div
        className={cn(
          'whitespace-nowrap text-right text-sm font-bold',
          isPositive ? 'text-tertiary' : 'text-error',
        )}
      >
        {formatCLPSigned(amount)}
      </div>
    </div>
  )
}
