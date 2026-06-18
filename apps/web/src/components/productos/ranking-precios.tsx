import { Store } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCLP, formatFechaMes } from '@/lib/format'
import type { CompraConRanking } from '@/lib/productos-mock'
import type { OrdenProductos } from './ordenar-control'

type Props = {
  compras: CompraConRanking[]
  orden: OrdenProductos
  precioMin: number
  precioMax: number
}

/** Ordena visualmente las filas según el control seleccionado. */
function ordenarFilas(
  compras: CompraConRanking[],
  orden: OrdenProductos,
): CompraConRanking[] {
  const copia = [...compras]
  switch (orden) {
    case 'precio':
      return copia.sort((a, b) => a.precio - b.precio)
    case 'fecha':
      return copia.sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      )
    case 'tienda':
      return copia.sort((a, b) => a.tienda.localeCompare(b.tienda, 'es'))
  }
}

/** Color de fondo del círculo de ranking según posición. */
function circleClass(pos: number): string {
  if (pos === 1) return 'bg-green-100  text-green-800'
  if (pos === 2) return 'bg-blue-100   text-blue-800'
  if (pos === 3) return 'bg-amber-100  text-amber-800'
  return 'bg-surface-container text-on-surface-variant'
}

export function RankingPrecios({ compras, orden, precioMin, precioMax }: Props) {
  const filas = ordenarFilas(compras, orden)

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <h3 className="border-b border-outline-variant px-5 py-3 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
        Ranking por precio
      </h3>

      <ul className="divide-y divide-outline-variant/50">
        {filas.map((c) => {
          const esMasBarato = c.precio === precioMin
          const esMasCaro   = c.precio === precioMax

          return (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3">
              {/* Número de ranking (posición por precio asc) */}
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  circleClass(c.rankingPrecio),
                )}
              >
                {c.rankingPrecio}
              </span>

              {/* Tienda y fecha */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-on-surface">
                  <Store className="size-3.5 shrink-0 text-on-surface-variant" strokeWidth={2} aria-hidden />
                  <span className="truncate">{c.tienda}</span>
                </div>
                <span className="text-xs text-on-surface-variant">
                  {formatFechaMes(c.fecha)}
                </span>
              </div>

              {/* Precio y badge */}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-bold text-on-surface">
                  {formatCLP(c.precio)}
                </span>
                {esMasBarato ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                    más barato
                  </span>
                ) : esMasCaro ? (
                  <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
                    más caro
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                    –
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
