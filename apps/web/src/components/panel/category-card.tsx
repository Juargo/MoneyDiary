import { cn } from '@/lib/utils'
import { formatCLP } from '@/lib/format'

export type CategoryVariant = 'needs' | 'wants' | 'savings'

type CategoryCardProps = {
  variant: CategoryVariant
  label: string
  spent: number
  budget: number
  exceeded?: boolean
}

const variantStyles: Record<
  CategoryVariant,
  { card: string; bar: string; barBg: string }
> = {
  needs: {
    card: 'bg-primary text-on-primary',
    bar: 'bg-white',
    barBg: 'bg-black/10',
  },
  wants: {
    card: 'bg-secondary-fixed-dim text-on-secondary-container',
    bar: 'bg-secondary',
    barBg: 'bg-black/10',
  },
  savings: {
    card: 'bg-tertiary-container text-on-tertiary-container',
    bar: 'bg-tertiary',
    barBg: 'bg-black/10',
  },
}

export function CategoryCard({
  variant,
  label,
  spent,
  budget,
  exceeded = false,
}: CategoryCardProps) {
  const styles = variantStyles[variant]
  const rawPercent = budget > 0 ? Math.round((spent / budget) * 100) : 0
  const barWidth = Math.min(rawPercent, 100)
  const heading = exceeded ? `${label} (Excedido)` : label

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl p-6 shadow-sm',
        styles.card,
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{formatCLP(spent)}</span>
        <span className="text-xl opacity-40">/ {formatCLP(budget)}</span>
      </div>

      <div className="text-base opacity-70">{heading}</div>

      <div className="mt-2">
        <div className="mb-2 text-xs">{rawPercent}% Completed</div>
        <div
          className={cn('h-2 w-full overflow-hidden rounded-full', styles.barBg)}
        >
          <div
            className={cn('h-full rounded-full transition-all', styles.bar)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  )
}
