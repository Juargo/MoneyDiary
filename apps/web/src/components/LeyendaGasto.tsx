import { cn } from '@/lib/utils'
import { COLOR_BUCKET, ETIQUETA_BUCKET } from '@/lib/bucket-colors'

/**
 * One legend/selector row. `porcentaje` is the share-of-spending percent from
 * the pie (`TajadaGasto`) — optional because a bucket outside the pie
 * (SinCategoria, task 30.10) is still selectable via this legend even though
 * it has no pie slice/share to show.
 */
export interface LeyendaTajada {
  readonly bucket: string
  readonly porcentaje?: number
}

/**
 * Pie legend + bucket selector: one row per spending bucket with its color
 * dot, user-facing label ("Gustos" for the domain's "Deseos"), and
 * share-of-spending percent — the SAME numbers as the pie slices. DOM port of
 * `apps/mobile/src/components/LeyendaGasto.tsx`, extended for US-030 Slice B
 * (task 30.10): every row is a real, selectable `<button>` reporting its
 * bucket via `onSelectBucket`, with `aria-pressed` reflecting
 * `bucketSeleccionado` — this is how the dashboard's transactions panel
 * switches buckets. Purely presentational; color and label are resolved here
 * via `lib/bucket-colors` (mirrors mobile's `theme/colors.ts`).
 */
export function LeyendaGasto({
  tajadas,
  bucketSeleccionado,
  onSelectBucket,
}: {
  readonly tajadas: ReadonlyArray<LeyendaTajada>
  readonly bucketSeleccionado: string | null
  readonly onSelectBucket: (bucket: string) => void
}) {
  if (tajadas.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
      {tajadas.map((tajada) => {
        const seleccionado = tajada.bucket === bucketSeleccionado
        return (
          <li key={tajada.bucket} data-testid="leyenda-item" className="flex items-center gap-2">
            <button
              type="button"
              aria-label={ETIQUETA_BUCKET[tajada.bucket] ?? tajada.bucket}
              aria-pressed={seleccionado}
              onClick={() => onSelectBucket(tajada.bucket)}
              className={cn(
                // LOCKED (WCAG 1.4.11): unified with the pie slices'
                // `outline-slate-800` (>3:1 on white) — `outline-slate-400`
                // (~2.6:1) failed non-text contrast. Do NOT re-tint.
                'flex items-center gap-2 rounded-lg px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800',
                seleccionado && 'bg-muted',
              )}
            >
              <span
                data-testid="leyenda-dot"
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: COLOR_BUCKET[tajada.bucket] ?? '#CCCCCC' }}
              />
              <span className="text-sm text-foreground">
                {ETIQUETA_BUCKET[tajada.bucket] ?? tajada.bucket}
              </span>
              {tajada.porcentaje !== undefined && (
                <span className="text-sm font-semibold text-foreground">{tajada.porcentaje}%</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
