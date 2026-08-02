import { useRef, useState } from 'react'
import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { EliminarIngestaControl } from './EliminarIngestaControl'
import { Badge } from './ui/badge'
import { useIngestas } from '@/api/use-ingestas'
import type { IngestaListItemDto } from '@/api/types'

/**
 * ListaIngestas (`us-018-eliminar-ingesta` Slice 2, design.md §7.3; widened
 * by `us-004-historial-ingestas` Slice 3, design.md §9) — owns `useIngestas`
 * directly (single query, no interactive selector to decouple from the
 * router — same reasoning as `BucketDetailList`: one component covers fetch
 * + {loading|error|empty|data} + rendering).
 *
 * Reuses the shared Loading/ErrorState/Empty states (W1), passing
 * list-appropriate copy — do not reimplement the components themselves
 * (DRY).
 *
 * Each row's rendering is delegated to `IngestaItem` (below), which branches
 * on `estado` (US-004, ING-03/ING-05): a `PROCESADA` row keeps the original
 * US-018 shape (banco, count, `EliminarIngestaControl`); a `FALLIDA` row
 * renders `motivoFallo` instead and offers **no** delete control — deleting
 * a failed attempt is out of scope this sprint (design §8/D8, ING-05
 * regression guard). `nombreArchivo` and a visible "Exitoso"/"Fallido" badge
 * (never color alone, ADR-018) render for every row regardless of estado.
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
        {query.data.map((ingesta) => (
          <IngestaItem key={ingesta.id} ingesta={ingesta} onEliminado={alEliminar} />
        ))}
      </ul>
    </div>
  )
}

/**
 * IngestaItem — a single historial row (US-004, design.md §9). Branches on
 * `estado`:
 * - `PROCESADA`: banco, movement count, and the (unchanged, US-018) delete
 *   control. `banco` is coalesced to `''` only for the prop hand-off to
 *   `EliminarIngestaControl` (design §8 type-level note) — the invariant
 *   `PROCESADA ⟹ accountId/banco NOT NULL` (design §3.1) makes it always a
 *   real value at runtime; TS can't see that invariant across the `estado`
 *   field, so the coalesce is required to satisfy strict null-checking, not
 *   a behavioral fallback.
 * - `FALLIDA`: `motivoFallo` instead of a count, and **no** delete control
 *   (ING-05 — the delete affordance is gated to PROCESADA rows only).
 *   `banco` renders as "—" when null (early failures have no resolved bank,
 *   design §3.3).
 *
 * `nombreArchivo` is rendered as plain JSX text (React auto-escapes) — it is
 * a client-controlled, uploaded file name, never trusted as markup.
 */
function IngestaItem({
  ingesta,
  onEliminado,
}: {
  readonly ingesta: IngestaListItemDto
  readonly onEliminado: () => void
}) {
  const fechaLabel = ingesta.fecha.slice(0, 10)
  const esFallida = ingesta.estado === 'FALLIDA'

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{fechaLabel}</span>
        <Badge variant={esFallida ? 'destructive' : 'secondary'}>{esFallida ? 'Fallido' : 'Exitoso'}</Badge>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{ingesta.nombreArchivo}</span>
        <span className="text-muted-foreground">{ingesta.banco ?? '—'}</span>
      </div>
      {esFallida ? (
        <p className="text-sm text-destructive">{ingesta.motivoFallo}</p>
      ) : (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>
            {ingesta.totalTransacciones} {ingesta.totalTransacciones === 1 ? 'movimiento' : 'movimientos'}
          </span>
          {/* `estado="exitoso"` is hardcoded (not derived from `ingesta.estado`):
              this branch only renders for PROCESADA rows (US-004 gating
              above), which is always the "exitoso" case in
              `EliminarIngestaControl`'s own (pre-US-004) `EstadoIngestaResumen`
              vocabulary — the two components intentionally speak different
              estado vocabularies at this boundary. */}
          <EliminarIngestaControl
            id={ingesta.id}
            banco={ingesta.banco ?? ''}
            fechaLabel={fechaLabel}
            estado="exitoso"
            totalTransacciones={ingesta.totalTransacciones}
            onEliminado={onEliminado}
          />
        </div>
      )}
    </li>
  )
}
