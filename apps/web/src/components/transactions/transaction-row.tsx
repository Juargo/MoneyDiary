import { cn } from '@/lib/utils'
import { formatCLPSigned, formatFechaCorta } from '@/lib/format'
import type { Transaccion } from '@/api/types'

type TransactionRowProps = {
  transaccion: Transaccion
}

export function TransactionRow({ transaccion }: TransactionRowProps) {
  const amount = transaccion.abono > 0 ? transaccion.abono : -transaccion.cargo
  const isPositive = amount > 0

  return (
    <tr className="border-t border-outline-variant/40">
      <td className="whitespace-nowrap px-6 py-4 text-sm text-on-surface-variant">
        {formatFechaCorta(transaccion.fecha)}
      </td>
      <td className="px-6 py-4 text-sm font-semibold text-on-surface">
        <span className="line-clamp-1">{transaccion.descripcion}</span>
      </td>
      <td className="px-6 py-4">
        <span className="inline-flex items-center rounded-full bg-surface-container-high px-3 py-1 text-xs font-medium text-on-surface-variant">
          {transaccion.banco}
        </span>
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-6 py-4 text-right text-sm font-bold',
          isPositive ? 'text-tertiary' : 'text-error',
        )}
      >
        {formatCLPSigned(amount)}
      </td>
    </tr>
  )
}
