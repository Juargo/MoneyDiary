import { calcularAngulos, arcoPath } from '@/domain/pie-geometry'
import { COLOR_BUCKET } from '@/lib/bucket-colors'
import { PIE_WEDGE_STROKE } from '@/lib/pie-colors'
import type { TajadaGasto } from '@/domain/distribucion-gasto'

/**
 * MiniDistribucionPie — compact, non-interactive, decorative pie for the
 * annual grid (US-030 Slice C, task 30.12). Reuses `pie-geometry`
 * (`calcularAngulos`/`arcoPath`) directly instead of `DistribucionPie`'s
 * internal `Pie` renderer — no arc math is duplicated, only the geometry
 * functions are shared.
 *
 * Deliberately a separate thin component rather than a `compact` flag on
 * `DistribucionPie`: that component's contract (IDEAL reference inset,
 * on-slice `%` labels, interactive slice selection wired to
 * `bucketSeleccionado`/`onSelectBucket`) doesn't apply here, and threading
 * extra optional props through an already-tested interactive component for a
 * genuinely different, simpler use would cost more than the ~15 lines this
 * duplicates (kiss.md: "a veces duplicar 3 líneas es más simple que la
 * abstracción").
 *
 * `aria-hidden="true"` on the `<svg>`: purely decorative — the parent month
 * `<button>` (in `ResumenAnual`) carries the accessible name, and the
 * semáforo badge next to it has its own label. Renders a muted placeholder
 * ring when `tajadas` is empty (no spending that month), mirroring
 * `DistribucionPie`'s own empty-state ring instead of dividing by zero.
 */
export function MiniDistribucionPie({
  tajadas,
  size = 56,
}: {
  readonly tajadas: ReadonlyArray<TajadaGasto>
  readonly size?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2

  if (tajadas.length === 0) {
    return (
      <svg width={size} height={size} aria-hidden="true">
        <circle data-testid="mini-pie-placeholder" cx={cx} cy={cy} r={r} className="fill-muted" />
      </svg>
    )
  }

  const tramos = calcularAngulos(tajadas.map((t) => t.fraccion))

  return (
    <svg width={size} height={size} aria-hidden="true">
      {tajadas.map((tajada, i) => (
        <path
          key={tajada.bucket}
          data-testid="mini-pie-slice"
          d={arcoPath(cx, cy, r, tramos[i].inicio, tramos[i].fin)}
          fill={COLOR_BUCKET[tajada.bucket] ?? '#CCCCCC'}
          // WDS-07 (WCAG 1.4.11): same pastel-adjacency separator as the
          // main DistribucionPie, scaled to a thinner 1px stroke — this pie
          // is 56px (r=28) vs the main pie's 240px (r=120), so the main
          // pie's 2px stroke would visually dominate a wedge this small.
          // Theme-immune literal — see `lib/pie-colors.ts`.
          stroke={PIE_WEDGE_STROKE}
          strokeWidth={1}
        />
      ))}
    </svg>
  )
}
