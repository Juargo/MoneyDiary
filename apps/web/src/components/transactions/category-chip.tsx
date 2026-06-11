import { cn } from '@/lib/utils'
import type { GrupoPresupuesto } from '@/api/types'

type CategoryChipProps = {
  label: string
  grupo: GrupoPresupuesto
}

const grupoStyles: Record<GrupoPresupuesto, string> = {
  Necesidades: 'bg-primary-fixed text-on-primary-fixed-variant',
  Gustos: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  Ahorro: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  SinCategorizar: 'bg-surface-container-high text-on-surface-variant',
}

export function CategoryChip({ label, grupo }: CategoryChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
        grupoStyles[grupo],
      )}
    >
      {label}
    </span>
  )
}
