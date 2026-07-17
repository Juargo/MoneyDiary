import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { useDetalleBucket } from '@/api/use-detalle-bucket'
import { aDetalleBucketViewModel } from '@/domain/detalle-bucket-view-model'

const BUCKET_SIN_CATEGORIA = 'SinCategoria'

/**
 * BucketDetailList — flat per-transaction list for a single bucket/period
 * (US-017). Owns `useDetalleBucket` directly (wires the query itself,
 * per tasks.md W3.22) — unlike the resumen screen's
 * ResumenPage/ResumenScreen split, this screen has a single query and no
 * interactive selector to decouple from the router, so one component
 * covers fetch + {loading|error|empty|data} + row rendering (YAGNI: no
 * extra split until a second consumer needs the state switch alone).
 *
 * Reuses the shared Loading/ErrorState/Empty states (W1), passing
 * detail-appropriate copy (context differs from the resumen screen: a
 * screen reader announcing "Cargando resumen…" on `/buckets/:bucket` would
 * be misleading) — do not reimplement the components themselves (DRY).
 *
 * SinCategoria special-case (CA-03): every row on a SinCategoria page shows
 * a "Clasificar" CTA — like the inline category-edit control (CA-02), it is
 * a permanently DISABLED placeholder with an accessible label/title
 * explaining it's not yet wired (classification flow deferred to US-013).
 * An enabled no-op button would be an a11y dead-end (announces as
 * actionable, does nothing on activation).
 *
 * cargo/abono render as two separate exact CLP amounts (spec W3-03), never
 * netted/subtracted — inventing a signed "net amount" would be new money
 * business logic this slice doesn't own (see detalle-bucket-view-model.ts).
 */
export function BucketDetailList({
  bucket,
  periodo,
}: {
  readonly bucket: string
  readonly periodo: string | undefined
}) {
  const query = useDetalleBucket(bucket, periodo)

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
        description="No hay movimientos en este bucket para el período."
      />
    )
  }

  const viewModel = aDetalleBucketViewModel(query.data)
  const esSinCategoria = viewModel.bucket === BUCKET_SIN_CATEGORIA

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-slate-900">{viewModel.bucket}</h1>
      <ul className="flex flex-col gap-3">
        {viewModel.filas.map((fila) => (
          <li key={fila.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between text-sm text-slate-700">
              <span>{fila.fechaLabel}</span>
              <span className="font-medium">{fila.descripcion}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-900">
              <span>Cargo: {fila.cargoLabel}</span>
              <span>Abono: {fila.abonoLabel}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              {esSinCategoria && (
                <button
                  type="button"
                  disabled
                  aria-label="Clasificar movimientos (próximamente)"
                  title="Clasificar movimientos (próximamente)"
                  className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clasificar
                </button>
              )}
              <button
                type="button"
                disabled
                aria-label={`Editar categoría de ${fila.descripcion} (próximamente)`}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-400"
              >
                Editar categoría
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
