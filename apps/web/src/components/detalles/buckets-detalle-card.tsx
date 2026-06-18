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

// Etiquetas en mayúsculas para mostrar en la UI.
const ETIQUETA_BUCKET: Record<GrupoPresupuesto, string> = {
  Necesidades: 'NECESIDADES',
  Gustos: 'GUSTOS',
  Ahorro: 'AHORRO',
  SinCategorizar: 'SIN CATEGORÍA',
  Ingresos: 'INGRESOS',
}

type BucketsDetalleCardProps = {
  buckets: Pick<BucketSummary, 'grupo' | 'gastado'>[]
}

/**
 * Card "Vista de buckets" — grid 2×N de subcards, uno por bucket de gasto.
 * Usa una barra de acento lateral izquierda (igual que IngresosCard en resumen)
 * para asociar el color del bucket sin perder legibilidad del monto.
 */
export function BucketsDetalleCard({ buckets }: BucketsDetalleCardProps) {
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
        <ul className="grid grid-cols-2 gap-3">
          {buckets.map((b) => {
            const color = COLOR_BUCKET[b.grupo] ?? '#6b7280'
            const etiqueta = ETIQUETA_BUCKET[b.grupo] ?? b.grupo.toUpperCase()
            return (
              <li
                key={b.grupo}
                className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container px-4 py-4"
              >
                {/* Barra de acento lateral — idéntica al patrón de IngresosCard */}
                <span
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  {etiqueta}
                </p>
                <p className="mt-1.5 text-xl font-bold text-on-surface">
                  {formatCLP(b.gastado)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
