import { calcularAngulos, arcoPath } from '@/domain/pie-geometry'
import { COLOR_BUCKET, ETIQUETA_BUCKET } from '@/lib/bucket-colors'
import { BUCKETS_GASTO } from '@/domain/distribucion-gasto'
import type { TajadaGasto } from '@/domain/distribucion-gasto'
import type { ResumenViewModel } from '@/domain/resumen-view-model'

interface Slice {
  readonly bucket: string
  readonly color: string
  readonly fraccion: number
  readonly porcentaje: number
}

function centroidLabel(cx: number, cy: number, r: number, inicio: number, fin: number) {
  const medio = ((inicio + fin) / 2) * (Math.PI / 180)
  return {
    x: cx + r * 0.62 * Math.sin(medio),
    y: cy - r * 0.62 * Math.cos(medio),
  }
}

/**
 * Renders one pie's wedges (and optionally their percent labels) as SVG
 * `<path>`/`<text>` children — a bare fragment, meant to sit inside a parent
 * `<svg>`. When `slices` is empty, renders a muted placeholder ring instead
 * of dividing by zero (mirrors `apps/mobile/src/components/DistribucionPie.tsx`).
 *
 * When `onSelectSlice` is provided (main pie only — task 30.10), each wedge
 * becomes an accessible, selectable control: `role="button"`, keyboard
 * support (Enter/Space), an `aria-label` (the UI bucket label), and
 * `aria-pressed` reflecting `bucketSeleccionado`. A native `<button>` can't
 * nest inside `<path>`'s SVG coordinate space, so the interactive semantics
 * are applied directly to the `<path>` — the standard accessible-SVG pattern.
 * The IDEAL reference inset never passes `onSelectSlice` and stays a static,
 * non-interactive chart.
 */
function Pie({
  slices,
  size,
  showLabels = false,
  sliceTestId,
  bucketSeleccionado,
  onSelectSlice,
}: {
  readonly slices: ReadonlyArray<Slice>
  readonly size: number
  readonly showLabels?: boolean
  readonly sliceTestId: string
  readonly bucketSeleccionado?: string | null
  readonly onSelectSlice?: (bucket: string) => void
}) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2

  if (slices.length === 0) {
    return (
      <circle data-testid="pie-placeholder" cx={cx} cy={cy} r={r} className="fill-slate-200" />
    )
  }

  const tramos = calcularAngulos(slices.map((s) => s.fraccion))

  return (
    <>
      {slices.map((slice, i) => {
        const d = arcoPath(cx, cy, r, tramos[i].inicio, tramos[i].fin)

        if (!onSelectSlice) {
          return <path key={slice.bucket} data-testid={sliceTestId} d={d} fill={slice.color} />
        }

        const seleccionado = slice.bucket === bucketSeleccionado
        return (
          <path
            key={slice.bucket}
            data-testid={sliceTestId}
            d={d}
            fill={slice.color}
            role="button"
            tabIndex={0}
            aria-label={ETIQUETA_BUCKET[slice.bucket] ?? slice.bucket}
            aria-pressed={seleccionado}
            className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800"
            onClick={() => onSelectSlice(slice.bucket)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectSlice(slice.bucket)
              }
            }}
          />
        )
      })}
      {showLabels &&
        slices.map((slice, i) => {
          if (slice.porcentaje < 5) {
            return null
          }
          const { x, y } = centroidLabel(cx, cy, r, tramos[i].inicio, tramos[i].fin)
          return (
            <text
              key={`label-${slice.bucket}`}
              x={x}
              y={y}
              fill="#FFFFFF"
              fontSize={size * 0.09}
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
              // Purely decorative overlay on top of the (already accessible)
              // wedge below it — hidden from the a11y tree to avoid a
              // redundant announcement.
              aria-hidden="true"
              pointerEvents="none"
            >
              {`${slice.porcentaje}%`}
            </text>
          )
        })}
    </>
  )
}

function slicesDesdeTajadas(tajadas: ReadonlyArray<TajadaGasto>): Slice[] {
  return tajadas.map((t) => ({
    bucket: t.bucket,
    color: COLOR_BUCKET[t.bucket] ?? '#CCCCCC',
    fraccion: t.fraccion,
    porcentaje: t.porcentaje,
  }))
}

function slicesIdeales(targets: ResumenViewModel['targets']): Slice[] {
  const total = targets.Necesidades + targets.Deseos + targets.Ahorro
  if (total <= 0) {
    return []
  }
  const valores: Record<(typeof BUCKETS_GASTO)[number], number> = {
    Necesidades: targets.Necesidades,
    Deseos: targets.Deseos,
    Ahorro: targets.Ahorro,
  }
  return BUCKETS_GASTO.map((bucket) => ({
    bucket,
    color: COLOR_BUCKET[bucket],
    fraccion: valores[bucket] / total,
    porcentaje: Math.round((valores[bucket] / total) * 100),
  }))
}

/**
 * "Distribución del gasto" chart: a full pie of the three spending buckets
 * (share-of-spending, with on-slice percent labels) plus a small "IDEAL"
 * reference pie of the 50/30/20 targets. DOM SVG port of
 * `apps/mobile/src/components/DistribucionPie.tsx` (react-native-svg →
 * native `<svg>`). Pure presentation — all math (fractions, percents, color,
 * label) is resolved upstream in `pie-geometry` (math) and here (color, via
 * `lib/bucket-colors` — mirrors mobile's `theme/colors.ts`); the domain
 * view-model stays pure (`TajadaGasto`: bucket/porcentaje/fraccion only). When
 * there is no spending, the main pie renders a muted placeholder ring instead
 * of dividing by zero; the IDEAL inset is independent of spending data and
 * always renders from `targets`.
 *
 * US-030 Slice B (task 30.10): the main pie's slices double as the dashboard's
 * bucket selector — see `Pie`'s docstring for the interaction contract.
 */
export function DistribucionPie({
  tajadas,
  targets,
  bucketSeleccionado,
  onSelectBucket,
  size = 240,
}: {
  readonly tajadas: ReadonlyArray<TajadaGasto>
  readonly targets: ResumenViewModel['targets']
  readonly bucketSeleccionado: string | null
  readonly onSelectBucket: (bucket: string) => void
  readonly size?: number
}) {
  const idealSize = size * 0.34
  // FIX 2 (WCAG 4.1.2): role="img" flattens the whole subtree for assistive
  // tech, which would prune the slice `<path role="button">` semantics
  // below. Only the interactive main pie needs "group" — the non-interactive
  // placeholder ring (no spending) has nothing to flatten, so it keeps
  // role="img".
  const esInteractivo = tajadas.length > 0

  return (
    <div className="relative flex items-center justify-center" style={{ height: size }}>
      <svg
        width={size}
        height={size}
        role={esInteractivo ? 'group' : 'img'}
        aria-label="Distribución del gasto"
      >
        <Pie
          slices={slicesDesdeTajadas(tajadas)}
          size={size}
          showLabels
          sliceTestId="pie-slice"
          bucketSeleccionado={bucketSeleccionado}
          onSelectSlice={onSelectBucket}
        />
      </svg>

      {/* IDEAL reference inset — bottom-right, matching the mockup. */}
      <div className="absolute right-1 bottom-0 flex flex-col items-center">
        <div className="flex items-center justify-center rounded-full border-2 border-white bg-white p-[3px]">
          <svg
            width={idealSize}
            height={idealSize}
            role="img"
            aria-label="Distribución ideal 50/30/20"
          >
            <Pie slices={slicesIdeales(targets)} size={idealSize} sliceTestId="pie-ideal-slice" />
          </svg>
        </div>
        <span className="mt-0.5 text-[10px] font-semibold tracking-wider text-slate-500">
          IDEAL
        </span>
      </div>
    </div>
  )
}
