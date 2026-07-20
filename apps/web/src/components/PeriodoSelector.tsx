import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'
import { MonthYearPicker } from './MonthYearPicker'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { esMesActual, mesAnterior, mesCompletoLabel, mesSiguiente, periodoActualUTC } from '@/domain/periodo-anual'

const PERIODO_SELECTOR_ROW_CLASS = 'mx-auto flex w-full max-w-6xl items-center justify-center gap-3'

/**
 * Prominent top-of-dashboard period header (period-selector-header,
 * WPER-01..07): prev/next month chevrons flanking the formatted label, plus
 * a "Hoy" shortcut. Backed by the route's `periodo` search param (design.md
 * D2 — TanStack Router search params, not zustand). Pure presentational: the
 * container owns `navigate({ search: (prev) => ({ ...prev, periodo }) })`
 * (W1.12) — this component only reports the new `YYYY-MM` value via
 * `onChange`. Props stay verbatim `{ periodo, onChange }` (design.md
 * decision #2) so the existing wiring (ResumenPage, the bucket-reset effect
 * in ResumenScreen) needs no changes.
 *
 * `periodo` undefined (invalid/absent search param) is treated as the
 * current month for both the label and the next/Hoy clamp (design.md
 * decision #4) — the backend already resolves an absent period to "now", so
 * the header stays truthful to what's actually being shown.
 */
export function PeriodoSelector({
  periodo,
  onChange,
}: {
  readonly periodo: string | undefined
  readonly onChange: (periodo: string) => void
}) {
  const ahora = new Date()
  const efectivo = periodo ?? periodoActualUTC(ahora)
  const enMesActual = esMesActual(efectivo, ahora)
  const periodoActual = periodoActualUTC(ahora)
  const [abierto, setAbierto] = useState(false)

  return (
    <div className={PERIODO_SELECTOR_ROW_CLASS}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Mes anterior"
        onClick={() => onChange(mesAnterior(efectivo))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>

      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Cambiar mes y año, actualmente ${mesCompletoLabel(efectivo)}`}
            className="text-xl font-semibold text-foreground"
          >
            {mesCompletoLabel(efectivo)}
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <MonthYearPicker
            periodo={efectivo}
            periodoActual={periodoActual}
            onSelect={(nuevoPeriodo) => {
              onChange(nuevoPeriodo)
              setAbierto(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Mes siguiente"
        disabled={enMesActual}
        onClick={() => onChange(mesSiguiente(efectivo))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Ir al mes actual"
        disabled={enMesActual}
        onClick={() => onChange(periodoActualUTC(ahora))}
      >
        Hoy
      </Button>
    </div>
  )
}
