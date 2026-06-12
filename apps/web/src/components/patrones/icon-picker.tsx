import { X } from 'lucide-react'
import { ICON_CATALOG } from './icon-catalog'
import { LucideIcon } from './lucide-icon'
import { cn } from '@/lib/utils'

type Props = {
  value: string | null
  onChange: (name: string | null) => void
}

export function IconPicker({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-md border border-on-surface/20 bg-background px-3 py-2">
        <div className="flex size-10 items-center justify-center rounded bg-on-surface/5">
          {value ? (
            <LucideIcon name={value} className="size-6" />
          ) : (
            <span className="text-xs text-on-surface-variant">—</span>
          )}
        </div>
        <span className="flex-1 text-sm">
          {value ?? 'Sin icono'}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md p-1 text-on-surface-variant hover:bg-on-surface/10"
            aria-label="Quitar icono"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border border-on-surface/20 p-2">
        {ICON_CATALOG.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-1 text-xs font-medium uppercase text-on-surface-variant">
              {group.label}
            </p>
            <div className="grid grid-cols-8 gap-1">
              {group.icons.map((name) => {
                const selected = value === name
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onChange(name)}
                    title={name}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded transition-colors',
                      selected
                        ? 'bg-primary text-on-primary'
                        : 'hover:bg-on-surface/10',
                    )}
                  >
                    <LucideIcon name={name} className="size-5" />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
