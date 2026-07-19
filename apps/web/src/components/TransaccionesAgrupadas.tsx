import { useEffect, useMemo, useRef } from 'react'
import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { useMovimientos } from '@/api/use-movimientos'
import { aMovimientosAgrupadosViewModel } from '@/domain/agrupar-movimientos-por-bucket'
import { cn } from '@/lib/utils'

/**
 * TransaccionesAgrupadas — the dashboard's right-hand transactions panel
 * (Slice 2 of `group-transactions-by-category`, design.md D4). Replaces the
 * old single-bucket-at-a-time `BucketDetailList` panel: it owns its own
 * `useMovimientos(periodo)` query (same one-component-covers-fetch-and-render
 * pattern `BucketDetailList` already documents — YAGNI, no premature
 * container/presentational split until a second consumer needs the grouped
 * view without the query), maps the DTO through the pure
 * `aMovimientosAgrupadosViewModel`, and renders one section per non-empty
 * category group (WG-01).
 *
 * Does NOT reuse `BucketDetailList` per group — that would fire the exact
 * N+1 request pattern (one `useDetalleBucket` per bucket) the proposal
 * rejected. `BucketDetailList` stays untouched for the `/buckets/:bucket`
 * deep link (design.md D4).
 *
 * `bucketResaltado` (design.md D5) is the scroll+highlight TARGET, set by
 * `ResumenScreen` when the user clicks a pie slice/legend entry — clicking
 * no longer swaps the panel (WG-05). When it changes to a bucket with a
 * rendered group, the panel scrolls that group into view and moves keyboard
 * focus to its heading (WCAG 2.4.3); when it targets a bucket with no
 * transactions this period (no rendered group), the effect is a no-op —
 * there is nothing to jump to (WG-05 "no-op target" scenario).
 *
 * A11y (ADR-018/WG-06): the highlight is never color-only (WCAG 1.4.1) —
 * `aria-current="true"` on the targeted `<section>` plus a visible ring/
 * left-border are BOTH applied. `prefers-reduced-motion` is honored by
 * reading `window.matchMedia('(prefers-reduced-motion: reduce)')` and
 * scrolling with `behavior: 'auto'` instead of `'smooth'` when set.
 */
export function TransaccionesAgrupadas({
  periodo,
  bucketResaltado,
}: {
  readonly periodo: string | undefined
  readonly bucketResaltado: string | null
}) {
  const query = useMovimientos(periodo)
  const refsPorGrupo = useRef(new Map<string, HTMLElement>())
  // Last bucketResaltado this effect actually acted on (scrolled+focused).
  // Guards against an unrelated re-render (e.g. a background refetch)
  // re-firing the effect with the SAME target and yanking focus back —
  // WCAG 2.4.3 predictable focus (the user never re-interacted).
  const bucketResaltadoAnteriorRef = useRef<string | null>(null)

  const grupos = useMemo(
    () => (query.data ? aMovimientosAgrupadosViewModel(query.data).grupos : []),
    [query.data],
  )

  useEffect(() => {
    if (bucketResaltado === null) {
      bucketResaltadoAnteriorRef.current = null
      return
    }
    if (bucketResaltado === bucketResaltadoAnteriorRef.current) {
      return
    }
    const el = refsPorGrupo.current.get(bucketResaltado)
    if (!el) {
      // WG-05 no-op scenario: the targeted category has zero rows this
      // period (no rendered group/ref) — degrade gracefully, no error.
      return
    }
    bucketResaltadoAnteriorRef.current = bucketResaltado
    const prefiereMovimientoReducido =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'nearest', behavior: prefiereMovimientoReducido ? 'auto' : 'smooth' })
    el.focus()
  }, [bucketResaltado, grupos])

  if (query.isPending) {
    return <Loading message="Cargando movimientos…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }
  if (query.data.transacciones.length === 0) {
    return (
      <Empty
        title="No hay movimientos este período"
        description="No se registraron movimientos en ninguna categoría este período."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo) => {
        const resaltado = grupo.bucket === bucketResaltado
        return (
          <section
            key={grupo.bucket}
            aria-current={resaltado ? 'true' : undefined}
            className={cn(
              'flex flex-col gap-3 rounded-xl border border-slate-200 p-3',
              resaltado && 'border-l-4 border-l-slate-800 ring-2 ring-slate-800',
            )}
          >
            <h3
              ref={(el) => {
                if (el) {
                  refsPorGrupo.current.set(grupo.bucket, el)
                } else {
                  refsPorGrupo.current.delete(grupo.bucket)
                }
              }}
              tabIndex={-1}
              className="text-sm font-semibold text-slate-900 focus:outline-none"
            >
              {grupo.etiqueta} · {grupo.subtotalLabel} · {grupo.cantidad} mov
            </h3>
            <ul className="flex flex-col gap-2">
              {grupo.filas.map((fila) => (
                <li key={fila.id} className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-white p-2">
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span>{fila.fechaLabel}</span>
                    <span className="font-medium">{fila.descripcion}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-900">
                    <span>Cargo: {fila.cargoLabel}</span>
                    <span>Abono: {fila.abonoLabel}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
