import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PeriodMode = 'mes' | 'anio'

type PeriodOption = {
  key: string
  label: string
}

type PeriodFilterProps = {
  mode: PeriodMode
  onModeChange: (mode: PeriodMode) => void
  periodos: PeriodOption[]
  periodoActual: PeriodOption
  onPeriodoChange: (key: string) => void
}

export function PeriodFilter({
  mode,
  onModeChange,
  periodos,
  periodoActual,
  onPeriodoChange,
}: PeriodFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-lowest p-1">
        <ModeButton
          active={mode === 'mes'}
          onClick={() => onModeChange('mes')}
          label="Mes"
        />
        <ModeButton
          active={mode === 'anio'}
          onClick={() => onModeChange('anio')}
          label="Año"
        />
      </div>

      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:border-primary"
        >
          <Calendar className="size-4" strokeWidth={1.75} />
          {periodoActual.label}
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              open && 'rotate-180',
            )}
            strokeWidth={1.75}
          />
        </button>

        {open && periodos.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-48 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-low shadow-lg">
            {periodos.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onPeriodoChange(p.key)
                  setOpen(false)
                }}
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container',
                  p.key === periodoActual.key && 'font-semibold text-primary',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-on-primary shadow-sm'
          : 'text-on-surface-variant hover:text-on-surface',
      )}
    >
      {label}
    </button>
  )
}
