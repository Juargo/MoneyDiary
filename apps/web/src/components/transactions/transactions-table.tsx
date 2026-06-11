import type { Transaccion } from '@/api/types'
import { TransactionRow } from './transaction-row'

type TransactionsTableProps = {
  transacciones: Transaccion[]
}

export function TransactionsTable({ transacciones }: TransactionsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[44%]" />
          <col className="w-[20%]" />
          <col className="w-[18%]" />
        </colgroup>

        <thead>
          <tr>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Fecha
            </th>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Descripción
            </th>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Banco
            </th>
            <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Monto
            </th>
          </tr>
        </thead>

        <tbody>
          {transacciones.map((t) => (
            <TransactionRow key={t.id} transaccion={t} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TransactionsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="border-b border-outline-variant/40 px-6 py-4">
        <div className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-outline-variant/40 px-6 py-4 last:border-b-0"
        >
          <div className="h-3 w-20 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 flex-1 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 w-20 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
        </div>
      ))}
    </div>
  )
}
