import { cn } from '@/lib/utils'
import { formatCLPSigned } from '@/lib/format'
import { CategoryChip, type CategoryVariant } from './category-chip'

export type Transaction = {
  id: string
  date: string
  merchant: string
  category: { label: string; variant: CategoryVariant }
  amount: number
}

type TransactionRowProps = {
  transaction: Transaction
}

export function TransactionRow({ transaction }: TransactionRowProps) {
  const isPositive = transaction.amount > 0
  return (
    <tr className="border-t border-outline-variant/40">
      <td className="whitespace-nowrap px-6 py-4 text-sm text-on-surface-variant">
        {transaction.date}
      </td>
      <td className="px-6 py-4 text-sm font-semibold text-on-surface">
        {transaction.merchant}
      </td>
      <td className="px-6 py-4">
        <CategoryChip
          label={transaction.category.label}
          variant={transaction.category.variant}
        />
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-6 py-4 text-right text-sm font-bold',
          isPositive ? 'text-tertiary' : 'text-error',
        )}
      >
        {formatCLPSigned(transaction.amount)}
      </td>
    </tr>
  )
}
