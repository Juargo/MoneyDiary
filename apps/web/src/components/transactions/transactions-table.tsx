import type { LucideIcon } from 'lucide-react'
import {
  TransactionGroupHeader,
} from './transaction-group-header'
import { TransactionRow, type Transaction } from './transaction-row'
import type { CategoryVariant } from './category-chip'

export type TransactionGroup = {
  key: string
  variant: CategoryVariant
  icon: LucideIcon
  label: string
  idealPercent: number
  progressPercent: number
  total: number
  exceeded?: boolean
  exceededLabel?: string
  transactions: Transaction[]
}

type TransactionsTableProps = {
  groups: TransactionGroup[]
}

export function TransactionsTable({ groups }: TransactionsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[42%]" />
          <col className="w-[22%]" />
          <col className="w-[18%]" />
        </colgroup>

        <thead>
          <tr className="bg-surface-container-lowest">
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Fecha
            </th>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Comercio
            </th>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Categoría
            </th>
            <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Monto
            </th>
          </tr>
        </thead>

        <tbody>
          {groups.map((group) => (
            <GroupBlock key={group.key} group={group} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupBlock({ group }: { group: TransactionGroup }) {
  return (
    <>
      <TransactionGroupHeader
        variant={group.variant}
        icon={group.icon}
        label={group.label}
        idealPercent={group.idealPercent}
        progressPercent={group.progressPercent}
        total={group.total}
        exceeded={group.exceeded}
        exceededLabel={group.exceededLabel}
      />
      {group.transactions.map((tx) => (
        <TransactionRow key={tx.id} transaction={tx} />
      ))}
    </>
  )
}
