import { cn } from '@/lib/utils'

export type CategoryVariant = 'needs' | 'wants' | 'savings'

type CategoryChipProps = {
  label: string
  variant: CategoryVariant
}

const variantStyles: Record<CategoryVariant, string> = {
  needs: 'bg-primary-fixed text-on-primary-fixed-variant',
  wants: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  savings: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
}

export function CategoryChip({ label, variant }: CategoryChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
        variantStyles[variant],
      )}
    >
      {label}
    </span>
  )
}
