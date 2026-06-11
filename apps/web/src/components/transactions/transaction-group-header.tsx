import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCLPSigned } from '@/lib/format'
import type { CategoryVariant } from './category-chip'

type TransactionGroupHeaderProps = {
  variant: CategoryVariant
  icon: LucideIcon
  label: string
  idealPercent: number
  progressPercent: number
  total: number
  exceeded?: boolean
  exceededLabel?: string
}

const variantStyles: Record<
  CategoryVariant,
  { iconColor: string; bar: string; barBg: string }
> = {
  needs: {
    iconColor: 'text-primary',
    bar: 'bg-primary',
    barBg: 'bg-primary/15',
  },
  wants: {
    iconColor: 'text-secondary',
    bar: 'bg-secondary',
    barBg: 'bg-secondary/15',
  },
  savings: {
    iconColor: 'text-tertiary',
    bar: 'bg-tertiary',
    barBg: 'bg-tertiary/15',
  },
}

export function TransactionGroupHeader({
  variant,
  icon: Icon,
  label,
  idealPercent,
  progressPercent,
  total,
  exceeded = false,
  exceededLabel,
}: TransactionGroupHeaderProps) {
  const styles = variantStyles[variant]
  const barWidth = Math.min(progressPercent, 100)
  const barColor = exceeded ? 'bg-error' : styles.bar
  const barTrack = exceeded ? 'bg-error/15' : styles.barBg

  return (
    <tr className="bg-surface-container-low">
      <td className="whitespace-nowrap px-6 py-3">
        <div className="flex items-center gap-3">
          <Icon
            className={cn('size-4 shrink-0', exceeded ? 'text-error' : styles.iconColor)}
            strokeWidth={2}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
            {label} ({idealPercent}%)
          </span>
        </div>
      </td>
      <td colSpan={2} className="px-6 py-3">
        <div className={cn('relative h-2.5 w-full overflow-hidden rounded-full', barTrack)}>
          <div
            className={cn('h-full rounded-full', barColor)}
            style={{ width: `${barWidth}%` }}
          />
          {exceeded && exceededLabel && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-error/70 px-2 py-0.5 text-[10px] font-semibold text-on-error">
              {exceededLabel}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-bold text-on-surface">
        {formatCLPSigned(total)}
      </td>
    </tr>
  )
}
