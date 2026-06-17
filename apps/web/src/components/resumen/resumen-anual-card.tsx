import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import {
  distribucionMensual,
  type MesAggregate,
} from '@/lib/transactions-aggregation'
import { cn } from '@/lib/utils'
import { PieTorta, evaluarEstado } from './distribucion-card'

const MESES_ABREV = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
]

type ResumenAnualCardProps = {
  year: number
  /** Índice de mes en curso (0–11), solo aplica al año en curso. */
  mesActualIndex: number
  meses: MesAggregate[]
}

export function ResumenAnualCard({
  year,
  mesActualIndex,
  meses,
}: ResumenAnualCardProps) {
  const porKey = new Map(meses.map((m) => [m.key, m]))

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-bold tracking-tight text-on-surface">
          Resumen Anual {year}
        </h3>
        <Link
          to="/panel"
          className="text-xs font-bold uppercase tracking-wider text-primary hover:underline"
        >
          Ver detalles
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {MESES_ABREV.map((abrev, index) => {
          const key = `${year}-${String(index + 1).padStart(2, '0')}`
          const mes = porKey.get(key)
          const esFuturo = index > mesActualIndex
          const esActual = index === mesActualIndex

          const dist = mes ? distribucionMensual(mes) : null
          const tieneDatos = !esFuturo && dist !== null && dist.totalMetodo > 0

          return (
            <div
              key={abrev}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-between rounded-xl border p-2',
                esActual
                  ? 'border-2 border-primary bg-surface-container-lowest shadow-sm'
                  : tieneDatos
                    ? 'border-outline-variant/60 bg-surface-container-lowest shadow-sm'
                    : 'border-transparent bg-surface-container/40',
              )}
            >
              {esActual && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[#22c55e] text-white shadow"
                  aria-label="Mes en curso"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}

              <span
                className={cn(
                  'text-xs font-bold tracking-wide',
                  tieneDatos || esActual
                    ? 'text-on-surface'
                    : 'text-on-surface-variant/50',
                )}
              >
                {abrev}
              </span>

              {tieneDatos && dist ? (
                <MesPie dist={dist} />
              ) : (
                <span className="mb-1 block size-11 rounded-full bg-surface-container-high/60" />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MesPie({ dist }: { dist: ReturnType<typeof distribucionMensual> }) {
  const estado = evaluarEstado(
    dist.slices,
    dist.ahorroPct,
    dist.sinCategorizarCount,
  )
  const EstadoIcon = estado.icon

  return (
    <div className="relative mb-1">
      <PieTorta slices={dist.slices} className="block size-12" />
      <EstadoIcon
        className="absolute -right-2 -top-1.5 size-4"
        color={estado.color}
        strokeWidth={2.5}
        aria-label={estado.label}
      >
        <title>{estado.label}</title>
      </EstadoIcon>
    </div>
  )
}
