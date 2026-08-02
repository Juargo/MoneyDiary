import { useRef, useState } from 'react'
import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { EliminarIngestaControl } from './EliminarIngestaControl'
import { useIngestas } from '@/api/use-ingestas'
import type { EstadoIngestaResumen } from '@/api/types'

/**
 * Presentación del estado de una ingesta (US-004, CA-02) — etiqueta en
 * lenguaje de UI + estilos del badge. `estado` ya viene traducido desde el
 * backend ('exitoso'|'fallido'|'pendiente'); acá solo se decide cómo se ve.
 * Femenino porque etiqueta a "la cartola/ingesta".
 */
const PRESENTACION_ESTADO: Record<
  EstadoIngestaResumen,
  { label: string; badgeClassName: string }
> = {
  exitoso: {
    label: 'Exitosa',
    badgeClassName: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  fallido: {
    label: 'Fallida',
    badgeClassName: 'bg-destructive/10 text-destructive',
  },
  pendiente: {
    label: 'Pendiente',
    badgeClassName: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
}

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
 *
 * Success announcement + focus (review finding, a11y): a successful delete
 * unmounts the `<li>` that held BOTH the focused trigger button AND
 * `EliminarIngestaControl`'s own `aria-live` span — that drops focus to
 * `document.body` and races the announcement against its own removal. This
 * component owns a SINGLE, STABLE `role="status"` live region + the `<h1>`
 * as an explicit focus target (`tabIndex={-1}`), both OUTSIDE the row
 * `<ul>`, so they survive any individual row unmounting.
 * `EliminarIngestaControl` calls the `onEliminado` callback it receives
 * instead of announcing/closing anything itself.
 */
export function ListaIngestas() {
  const query = useIngestas()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [anuncio, setAnuncio] = useState('')

  function alEliminar() {
    setAnuncio('Cartola eliminada.')
    headingRef.current?.focus()
  }

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
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Gestionar cartolas
      </h1>
      <span role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </span>
      <ul className="flex flex-col gap-3">
        {query.data.map((ingesta) => {
          const fechaLabel = ingesta.fecha.slice(0, 10)
          // CA-02: fecha Y hora de carga. Slice ISO a minutos (UTC del
          // timestamp guardado) — determinista y misma convención "slice ISO"
          // que aFechaLabel; localizar a hora chilena queda como mejora.
          const fechaHoraLabel = ingesta.fecha.slice(0, 16).replace('T', ' ')
          const estado = PRESENTACION_ESTADO[ingesta.estado]
          return (
            <li
              key={ingesta.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{fechaHoraLabel}</span>
                <span className="font-medium text-foreground">{ingesta.banco}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground" title={ingesta.nombreArchivo}>
                  {ingesta.nombreArchivo}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${estado.badgeClassName}`}
                >
                  {estado.label}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-foreground">
                {/* CA-03: el conteo solo tiene sentido en las exitosas; en fallidas se muestra el motivo (CA-04) */}
                {ingesta.estado === 'exitoso' ? (
                  <span>
                    {ingesta.totalTransacciones} {ingesta.totalTransacciones === 1 ? 'movimiento' : 'movimientos'}
                  </span>
                ) : ingesta.estado === 'fallido' ? (
                  <span className="text-destructive">
                    {ingesta.motivoFallo ?? 'Sin detalle del error'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Procesamiento pendiente</span>
                )}
                <EliminarIngestaControl
                  id={ingesta.id}
                  banco={ingesta.banco}
                  fechaLabel={fechaLabel}
                  totalTransacciones={ingesta.totalTransacciones}
                  onEliminado={alEliminar}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
