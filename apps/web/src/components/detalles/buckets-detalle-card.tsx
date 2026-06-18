import type { BucketSummary } from '@/lib/transactions-aggregation'
import { BUCKET_COLOR } from '@/components/resumen/distribucion-card'
import { formatCLP } from '@/lib/format'
import type { GrupoPresupuesto } from '@/api/types'

// Mapa extendido de colores que incluye SinCategorizar además de los 3 buckets del modelo.
const COLOR_BUCKET: Record<GrupoPresupuesto, string> = {
  ...BUCKET_COLOR,
  SinCategorizar: '#6b7280',
  Ingresos: '#6b7280', // fallback defensivo; no aparece en esta vista
}

// Color de texto con buen contraste sobre el fondo de cada bucket.
const TEXTO_BUCKET: Record<GrupoPresupuesto, string> = {
  Necesidades: '#ffffff', // sobre slate oscuro
  Gustos: '#4b4636', // sobre amarillo pálido
  Ahorro: '#ffffff', // sobre verde
  SinCategorizar: '#ffffff', // sobre gris
  Ingresos: '#ffffff',
}

// Etiquetas en mayúsculas para mostrar en la UI.
const ETIQUETA_BUCKET: Record<GrupoPresupuesto, string> = {
  Necesidades: 'NECESIDADES',
  Gustos: 'GUSTOS',
  Ahorro: 'AHORRO',
  SinCategorizar: 'SIN CATEGORÍA',
  Ingresos: 'INGRESOS',
}

// ─── Mini-gráfico de torta ────────────────────────────────────────────────────

// Punto del círculo (cx,cy,r) para un ángulo en grados (0° arriba, horario).
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const [x1, y1] = polar(cx, cy, r, start)
  const [x2, y2] = polar(cx, cy, r, end)
  const largeArc = end - start > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

type TortaSlice = { color: string; pct: number }

/** Torta compacta de la distribución del gasto por bucket. SVG sin dependencias. */
function MiniTorta({ slices }: { slices: TortaSlice[] }) {
  const total = slices.reduce((s, x) => s + x.pct, 0)
  if (total === 0) return null

  const cx = 50
  const cy = 50
  const r = 48

  let cursor = 0
  const arcs = slices
    .filter((s) => s.pct > 0)
    .map((s) => {
      const start = (cursor / total) * 360
      cursor += s.pct
      const end = (cursor / total) * 360
      return { ...s, start, end }
    })

  const unicaPorcion = arcs.length === 1

  return (
    <svg
      viewBox="0 0 100 100"
      className="size-24 shrink-0"
      role="img"
      aria-label="Distribución del gasto por bucket"
    >
      {unicaPorcion ? (
        <circle cx={cx} cy={cy} r={r} fill={arcs[0].color} />
      ) : (
        arcs.map((a, i) => (
          <path key={i} d={slicePath(cx, cy, r, a.start, a.end)} fill={a.color} />
        ))
      )}
    </svg>
  )
}

type BucketsDetalleCardProps = {
  buckets: Pick<BucketSummary, 'grupo' | 'gastado'>[]
}

/**
 * Card "Vista de buckets" — mini-torta de la distribución + grid de subcards,
 * cada una con fondo del color de su bucket, su monto y su porcentaje.
 */
export function BucketsDetalleCard({ buckets }: BucketsDetalleCardProps) {
  const total = buckets.reduce((s, b) => s + b.gastado, 0)
  const slices: TortaSlice[] = buckets.map((b) => ({
    color: COLOR_BUCKET[b.grupo],
    pct: total > 0 ? (b.gastado / total) * 100 : 0,
  }))

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-5 shadow-sm">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
        Vista de buckets
      </h3>

      {buckets.length === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">
          Aún no hay gastos categorizados este mes.
        </p>
      ) : (
        <>
          {total > 0 && (
            <div className="mb-5 flex justify-center">
              <MiniTorta slices={slices} />
            </div>
          )}

          <ul className="grid grid-cols-2 gap-3">
            {buckets.map((b) => {
              const color = COLOR_BUCKET[b.grupo] ?? '#6b7280'
              const texto = TEXTO_BUCKET[b.grupo] ?? '#ffffff'
              const etiqueta = ETIQUETA_BUCKET[b.grupo] ?? b.grupo.toUpperCase()
              const pct = total > 0 ? Math.round((b.gastado / total) * 100) : 0
              return (
                <li
                  key={b.grupo}
                  className="rounded-md px-4 py-3.5"
                  style={{ backgroundColor: color, color: texto }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
                    {etiqueta}
                  </p>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <p className="text-xl font-bold">{formatCLP(b.gastado)}</p>
                    <p className="text-sm font-semibold opacity-90">{pct}%</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
