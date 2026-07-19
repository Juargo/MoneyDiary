import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { ReclasificarCategoriaControl } from './ReclasificarCategoriaControl'
import { useDetalleBucket } from '@/api/use-detalle-bucket'
import { aDetalleBucketViewModel } from '@/domain/detalle-bucket-view-model'
import { agruparDetallePorCategoria } from '@/domain/agrupar-detalle-por-categoria'
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors'

/**
 * BucketDetailList — a single bucket/period's transactions, GROUPED BY
 * CATEGORÍA (US-013 S6a, WCAT-02; was a flat list under US-017). Owns
 * `useDetalleBucket` directly (wires the query itself, per tasks.md
 * W3.22) — unlike the resumen screen's ResumenPage/ResumenScreen split,
 * this screen has a single query and no interactive selector to decouple
 * from the router, so one component covers fetch +
 * {loading|error|empty|data} + grouped rendering (YAGNI: no extra split
 * until a second consumer needs the state switch alone).
 *
 * Reuses the shared Loading/ErrorState/Empty states (W1), passing
 * detail-appropriate copy (context differs from the resumen screen: a
 * screen reader announcing "Cargando resumen…" on `/buckets/:bucket` would
 * be misleading) — do not reimplement the components themselves (DRY).
 *
 * Grouping (WCAT-02): `agruparDetallePorCategoria` (pure, BigInt-exact
 * subtotal) turns the flat `query.data.transacciones` into ordered groups —
 * each renders as a `<section>` with a heading ("nombre · subtotal ·
 * conteo") followed by its rows.
 *
 * Reclassify control (US-013 S6b, WCAT-04/05): each row renders a
 * `ReclasificarCategoriaControl` — a single `<select>` that covers BOTH the
 * former "Editar categoría" (reclassify) and "Clasificar" (SinCategoria
 * assign) placeholders (design.md §7.3, DRY — one mechanism, `categoriaActual`
 * arrives `null` for SinCategoria/unmatched rows). Every row in a group
 * shares the same `grupo.categoriaId`/`grupo.nombre` (grouping IS by
 * categoría), so the group's own fields are reused per row instead of
 * threading a separate `categoria` field through `DetalleBucketRowViewModel`.
 *

 * cargo/abono render as two separate exact CLP amounts (spec W3-03), never
 * netted/subtracted — inventing a signed "net amount" would be new money
 * business logic this slice doesn't own (see detalle-bucket-view-model.ts).
 * The group subtotal follows the same discipline (BigInt sum of the
 * bucket-relevant side only — see agrupar-detalle-por-categoria.ts).
 *
 * `headingLevel` (US-030 Slice B, task 30.10): defaults to `'h1'` for the
 * standalone `/buckets/:bucket` route, where this IS the page's sole
 * heading. The dashboard reuses this component verbatim for its
 * transactions panel — passing `'h2'` there keeps the dashboard's own page
 * heading the only `<h1>` (ADR-018), avoiding a duplicate. Group headings
 * (WCAT-02) demote ONE level below the bucket heading (`h2`→group `h3`,
 * `h1`→group `h2`) so no heading level is skipped either way — a fixed
 * `<h3>` regardless of context (as design.md §7.3 literally reads) would
 * skip a level on the standalone `h1` route; deriving it from `headingLevel`
 * keeps the outline valid in both places.
 */
export function BucketDetailList({
  bucket,
  periodo,
  headingLevel = 'h1',
}: {
  readonly bucket: string
  readonly periodo: string | undefined
  readonly headingLevel?: 'h1' | 'h2'
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
  const grupos = agruparDetallePorCategoria(query.data.transacciones, viewModel.bucket)
  const Heading = headingLevel
  const HeadingGrupo = headingLevel === 'h1' ? 'h2' : 'h3'

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      <Heading className="text-lg font-semibold text-slate-900">
        {ETIQUETA_BUCKET[viewModel.bucket] ?? viewModel.bucket}
      </Heading>
      {grupos.map((grupo) => (
        <section key={grupo.categoriaId ?? 'sin-categoria'} className="flex flex-col gap-3">
          <HeadingGrupo className="text-sm font-semibold text-slate-700">
            {grupo.nombre} · {grupo.subtotalLabel} · {grupo.conteo} {grupo.conteo === 1 ? 'movimiento' : 'movimientos'}
          </HeadingGrupo>
          <ul className="flex flex-col gap-3">
            {grupo.filas.map((fila) => (
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
                  <ReclasificarCategoriaControl
                    transaccionId={fila.id}
                    descripcion={fila.descripcion}
                    montoLabel={fila.cargoLabel}
                    bucketActual={viewModel.bucket}
                    categoriaActual={grupo.categoriaId === null ? null : grupo.nombre}
                    periodo={periodo}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
