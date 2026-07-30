import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { EliminarIngestaControl } from './EliminarIngestaControl'
import { useIngestas } from '@/api/use-ingestas'

/**
 * ListaIngestas (`us-018-eliminar-ingesta` Slice 2, design.md §7.3) — owns
 * `useIngestas` directly (single query, no interactive selector to decouple
 * from the router — same reasoning as `BucketDetailList`: one component
 * covers fetch + {loading|error|empty|data} + rendering).
 *
 * Reuses the shared Loading/ErrorState/Empty states (W1), passing
 * list-appropriate copy — do not reimplement the components themselves
 * (DRY).
 *
 * Each row shows banco, a formatted `fecha` (`YYYY-MM-DD` slice of the ISO
 * string — same convention as `detalle-bucket-view-model.ts#aFechaLabel`,
 * kept local here since it's a single-line slice, not worth a shared
 * cross-feature import), the movement count singular/plural, and its own
 * `EliminarIngestaControl` (ING-05/ING-06). `fechaLabel` is precomputed here
 * and passed down — `EliminarIngestaControl` never touches the raw ISO
 * string (mirrors `montoLabel` on `ReclasificarCategoriaControl`).
 */
export function ListaIngestas() {
  const query = useIngestas()

  if (query.isPending) {
    return <Loading message="Cargando cartolas…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }
  if (query.data.length === 0) {
    return (
      <Empty
        title="No hay cartolas cargadas"
        description="Sube una cartola para poder gestionarla aquí."
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-foreground">Gestionar cartolas</h1>
      <ul className="flex flex-col gap-3">
        {query.data.map((ingesta) => {
          const fechaLabel = ingesta.fecha.slice(0, 10)
          return (
            <li
              key={ingesta.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{fechaLabel}</span>
                <span className="font-medium text-foreground">{ingesta.banco}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-foreground">
                <span>
                  {ingesta.totalTransacciones} {ingesta.totalTransacciones === 1 ? 'movimiento' : 'movimientos'}
                </span>
                <EliminarIngestaControl
                  id={ingesta.id}
                  banco={ingesta.banco}
                  fechaLabel={fechaLabel}
                  totalTransacciones={ingesta.totalTransacciones}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
