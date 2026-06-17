import {
  Annoyed,
  BanknoteArrowUp,
  Laugh,
  OctagonAlert,
  type LucideIcon,
} from 'lucide-react'
import type { BucketGrupo, BucketSlice } from '@/lib/transactions-aggregation'

export type { BucketSlice }

type DistribucionCardProps = {
  slices: BucketSlice[]
  /** Porcentaje real destinado a Ahorro (0–100). */
  ahorroPct: number
  /** Cantidad de transacciones de gasto sin categorizar en el mes. */
  sinCategorizarCount: number
}

// Paleta del modelo 50/30/20 (consistente con el panel).
export const BUCKET_COLOR: Record<BucketGrupo, string> = {
  Necesidades: '#4b5575',
  Gustos: '#ece3b0',
  Ahorro: '#16a34a',
}

// Color del texto del % dentro de cada porción (contraste sobre el color).
const BUCKET_LABEL_COLOR: Record<BucketGrupo, string> = {
  Necesidades: '#ffffff',
  Gustos: '#4b4636',
  Ahorro: '#ffffff',
}

// Modelo ideal por bucket — referencia para evaluar la distribución.
const IDEAL: Record<BucketGrupo, number> = {
  Necesidades: 50,
  Gustos: 30,
  Ahorro: 20,
}

// Desviación máxima tolerada (en puntos porcentuales) para considerar
// la distribución "bien repartida".
const TOLERANCIA_PP = 10

export type Estado = {
  icon: LucideIcon
  color: string
  label: string
}

/**
 * Elige el ícono de estado según la distribución.
 * Prioridad: datos sin categorizar → ahorro sobre meta → bien repartido →
 * demasiado dispar.
 */
export function evaluarEstado(
  slices: BucketSlice[],
  ahorroPct: number,
  sinCategorizarCount: number,
): Estado {
  if (sinCategorizarCount > 0) {
    return {
      icon: Annoyed,
      color: '#b58900',
      label: `${sinCategorizarCount} transacción(es) sin categorizar`,
    }
  }

  if (ahorroPct > IDEAL.Ahorro) {
    return {
      icon: BanknoteArrowUp,
      color: '#2e7d32',
      label: 'Ahorro por encima de la meta del 20%',
    }
  }

  const maxDesviacion = Math.max(
    ...slices.map((s) => Math.abs(s.pct - IDEAL[s.grupo])),
  )

  if (maxDesviacion <= TOLERANCIA_PP) {
    return {
      icon: Laugh,
      color: '#2e7d32',
      label: 'Distribución bien repartida según el modelo 50/30/20',
    }
  }

  return {
    icon: OctagonAlert,
    color: '#c62828',
    label: 'Las proporciones están muy lejos del modelo 50/30/20',
  }
}

// Punto del círculo (cx,cy,r) para un ángulo en grados (0° arriba, horario).
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start)
  const [x2, y2] = polar(cx, cy, r, end)
  const largeArc = end - start > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

type PieTortaProps = {
  slices: BucketSlice[]
  /** Muestra el % dentro de cada porción. */
  withLabels?: boolean
  className?: string
}

/** Gráfico de torta de la distribución del gasto. SVG sin dependencias. */
export function PieTorta({ slices, withLabels = false, className }: PieTortaProps) {
  const total = slices.reduce((s, x) => s + x.pct, 0)
  if (total === 0) return null

  const cx = 50
  const cy = 50
  const r = 48
  const labelR = 26

  let cursor = 0
  const arcs = slices
    .filter((s) => s.pct > 0)
    .map((s) => {
      const start = (cursor / total) * 360
      cursor += s.pct
      const end = (cursor / total) * 360
      const mid = (start + end) / 2
      const [lx, ly] = polar(cx, cy, labelR, mid)
      return { ...s, start, end, lx, ly }
    })

  const unicaPorcion = arcs.length === 1

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Distribución del gasto por bucket"
    >
      {unicaPorcion ? (
        <circle cx={cx} cy={cy} r={r} fill={BUCKET_COLOR[arcs[0].grupo]} />
      ) : (
        arcs.map((a) => (
          <path
            key={a.grupo}
            d={slicePath(cx, cy, r, a.start, a.end)}
            fill={BUCKET_COLOR[a.grupo]}
          />
        ))
      )}
      {withLabels &&
        arcs.map((a) => (
          <text
            key={`${a.grupo}-label`}
            x={a.lx}
            y={a.ly}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="7"
            fontWeight="700"
            fill={BUCKET_LABEL_COLOR[a.grupo]}
          >
            {Math.round(a.pct)}%
          </text>
        ))}
    </svg>
  )
}

export function DistribucionCard({
  slices,
  ahorroPct,
  sinCategorizarCount,
}: DistribucionCardProps) {
  const total = slices.reduce((s, x) => s + x.pct, 0)
  const estado = evaluarEstado(slices, ahorroPct, sinCategorizarCount)
  const EstadoIcon = estado.icon

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
          Distribución del gasto
        </h3>
        <EstadoIcon
          className="size-7 shrink-0"
          color={estado.color}
          strokeWidth={2}
          aria-label={estado.label}
        >
          <title>{estado.label}</title>
        </EstadoIcon>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">
          Aún no hay gastos categorizados este mes.
        </p>
      ) : (
        <>
          <PieTorta
            slices={slices}
            withLabels
            className="mx-auto block size-56"
          />

          <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            {slices.map((s) => (
              <li key={s.grupo} className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ backgroundColor: BUCKET_COLOR[s.grupo] }}
                />
                <span className="font-medium text-on-surface">{s.grupo}</span>
                <span className="text-on-surface-variant">
                  {Math.round(s.pct)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
