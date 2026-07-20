import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'
import { anioDePeriodo, mesAbreviado, mesCompletoLabel, periodoDesde } from '@/domain/periodo-anual'

const MESES_1A12 = Array.from({ length: 12 }, (_, indice) => indice + 1)

/**
 * 12-month grid + in-popover year navigation (month-year-picker,
 * WMYP-02..05/07/08). Purely presentational — `periodo` (viewed) and
 * `periodoActual` (today, as `YYYY-MM`) come in as plain strings so this
 * component never touches the real clock (design.md D3). The displayed year
 * (`anioMostrado`) is separate internal state, navigated independently of
 * the selection — picking a month never changes it, only `onSelect` does.
 */
export function MonthYearPicker({
  periodo,
  periodoActual,
  onSelect,
}: {
  readonly periodo: string
  readonly periodoActual: string
  readonly onSelect: (periodo: string) => void
}) {
  const anioActual = anioDePeriodo(periodoActual, anioDePeriodo(periodo, 0))
  const [anioMostrado, setAnioMostrado] = useState(() => anioDePeriodo(periodo, anioActual))

  const proximoAnioDeshabilitado = anioMostrado >= anioActual

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Año anterior"
          onClick={() => setAnioMostrado((anio) => anio - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>

        <span aria-live="polite" className="text-sm font-semibold text-foreground">
          {anioMostrado}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Año siguiente"
          disabled={proximoAnioDeshabilitado}
          onClick={() => setAnioMostrado((anio) => anio + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MESES_1A12.map((mes) => {
          const periodoCelda = periodoDesde(anioMostrado, mes)
          const activo = periodoCelda === periodo
          const deshabilitado = periodoCelda > periodoActual

          return (
            <Button
              key={periodoCelda}
              type="button"
              variant={activo ? 'default' : 'ghost'}
              size="sm"
              aria-label={mesCompletoLabel(periodoCelda)}
              aria-pressed={activo}
              disabled={deshabilitado}
              onClick={() => onSelect(periodoCelda)}
            >
              {mesAbreviado(periodoCelda)}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
