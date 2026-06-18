import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Heart,
  Home,
  PiggyBank,
  Store,
} from 'lucide-react'
import type { LucideIcon as LucideIconType } from 'lucide-react'
import type { GrupoPresupuesto } from '@/api/types'
import type {
  BucketDetalle,
  CategoriaDetalle,
  TransaccionDetalle,
} from '@/lib/transactions-aggregation'
import { LucideIcon } from '@/components/patrones/lucide-icon'
import { formatCLP, formatDiaMes } from '@/lib/format'

// ─── Configuración de íconos y colores por bucket ─────────────────────────────

type BucketBadge = {
  icon: LucideIconType
  /** Fondo sólido del bucket. */
  bg: string
  /** Color de texto con buen contraste sobre `bg`. */
  texto: string
  etiqueta: string
}

const BUCKET_BADGE: Record<GrupoPresupuesto, BucketBadge> = {
  Necesidades: {
    icon: Home,
    bg: '#4b5575',
    texto: '#ffffff',
    etiqueta: 'Necesidades',
  },
  Gustos: {
    icon: Heart,
    bg: '#ece3b0',
    texto: '#4b4636',
    etiqueta: 'Gustos',
  },
  Ahorro: {
    icon: PiggyBank,
    bg: '#16a34a',
    texto: '#ffffff',
    etiqueta: 'Ahorro',
  },
  SinCategorizar: {
    icon: CircleHelp,
    bg: '#6b7280',
    texto: '#ffffff',
    etiqueta: 'Sin categoría',
  },
  Ingresos: {
    icon: CircleHelp,
    bg: '#6b7280',
    texto: '#ffffff',
    etiqueta: 'Ingresos',
  },
}

// Fondo translúcido del círculo del ícono, según si el texto es claro u oscuro.
function iconBgFor(texto: string): string {
  return texto === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)'
}

// ─── Mini-gráfico de torta ────────────────────────────────────────────────────

// Punto del círculo (cx,cy,r) para un ángulo en grados (0° arriba, horario).
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const [x1, y1] = polar(cx, cy, r, start)
  const [x2, y2] = polar(cx, cy, r, end)
  const largeArc = end - start > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

type TortaSlice = { color: string; pct: number }

/** Torta compacta de la distribución del gasto por bucket. SVG sin dependencias. */
function MiniTorta({ slices }: { slices: TortaSlice[] }) {
  const total = slices.reduce((s, x) => s + x.pct, 0)
  if (total === 0) return null

  const cx = 50
  const cy = 50
  const r = 48

  let cursor = 0
  const arcs = slices
    .filter((s) => s.pct > 0)
    .map((s) => {
      const start = (cursor / total) * 360
      cursor += s.pct
      const end = (cursor / total) * 360
      return { ...s, start, end }
    })

  const unicaPorcion = arcs.length === 1

  return (
    <svg
      viewBox="0 0 100 100"
      className="size-28 shrink-0"
      role="img"
      aria-label="Distribución del gasto por bucket"
    >
      {unicaPorcion ? (
        <circle cx={cx} cy={cy} r={r} fill={arcs[0].color} />
      ) : (
        arcs.map((a, i) => (
          <path key={i} d={slicePath(cx, cy, r, a.start, a.end)} fill={a.color} />
        ))
      )}
    </svg>
  )
}

// ─── Monto + porcentaje (relativo al gasto total del mes) ──────────────────────

function MontoPct({
  monto,
  totalGeneral,
  montoClassName,
}: {
  monto: number
  totalGeneral: number
  montoClassName: string
}) {
  const pct = totalGeneral > 0 ? Math.round((monto / totalGeneral) * 100) : 0
  return (
    <div className="text-right leading-tight">
      <span className={`block ${montoClassName}`}>{formatCLP(monto)}</span>
      <span className="block text-[10px] opacity-70">{pct}%</span>
    </div>
  )
}

// ─── Fila de transacción (hoja — sin chevron, sin nivel inferior) ──────────────

function TransaccionFila({
  tx,
  totalGeneral,
}: {
  tx: TransaccionDetalle
  totalGeneral: number
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 pl-10 pr-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Store
          className="size-4 shrink-0 text-on-surface-variant"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-xs text-on-surface">{tx.descripcion}</p>
          <p className="mt-0.5 text-[10px] text-on-surface-variant">
            {formatDiaMes(tx.fecha)}
          </p>
        </div>
      </div>
      <MontoPct
        monto={tx.monto}
        totalGeneral={totalGeneral}
        montoClassName="text-xs font-semibold text-on-surface"
      />
    </div>
  )
}

// ─── Fila de categoría (nivel 2) ───────────────────────────────────────────────

function CategoriaFila({
  cat,
  totalGeneral,
}: {
  cat: CategoriaDetalle
  totalGeneral: number
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 py-2.5 pl-6 pr-4 text-left transition-colors hover:bg-surface-container"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <LucideIcon
            name={cat.icon}
            className="size-4 shrink-0 text-on-surface-variant"
            fallback
          />
          <span className="truncate text-sm text-on-surface">{cat.nombre}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <MontoPct
            monto={cat.total}
            totalGeneral={totalGeneral}
            montoClassName="text-sm font-bold text-on-surface"
          />
          {abierto ? (
            <ChevronDown
              className="size-4 text-on-surface-variant"
              strokeWidth={2}
              aria-hidden
            />
          ) : (
            <ChevronRight
              className="size-4 text-on-surface-variant"
              strokeWidth={2}
              aria-hidden
            />
          )}
        </div>
      </button>

      {abierto && (
        <div className="divide-y divide-outline-variant/40 bg-surface-container-lowest/60">
          {cat.transacciones.map((tx) => (
            <TransaccionFila key={tx.id} tx={tx} totalGeneral={totalGeneral} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fila de bucket SinCategorizar (aplana: muestra transacciones directamente) ─

function BucketSinCategorizarFila({
  bucket,
  totalGeneral,
}: {
  bucket: BucketDetalle
  totalGeneral: number
}) {
  const [abierto, setAbierto] = useState(false)
  const badge = BUCKET_BADGE[bucket.grupo]!
  const BucketIcon = badge.icon
  const subtitulo = `${bucket.conteoTransacciones} ${bucket.conteoTransacciones === 1 ? 'transacción' : 'transacciones'}`

  // Aplanar todas las transacciones de todas las categorías (ya ordenadas)
  const transacciones = bucket.categorias.flatMap((c) => c.transacciones)

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:brightness-95"
        style={{ backgroundColor: badge.bg, color: badge.texto }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: iconBgFor(badge.texto) }}
          >
            <BucketIcon className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{badge.etiqueta}</p>
            <p className="text-[10px] opacity-80">{subtitulo}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <MontoPct
            monto={bucket.total}
            totalGeneral={totalGeneral}
            montoClassName="text-base font-bold"
          />
          {abierto ? (
            <ChevronDown className="size-4 opacity-80" strokeWidth={2} aria-hidden />
          ) : (
            <ChevronRight className="size-4 opacity-80" strokeWidth={2} aria-hidden />
          )}
        </div>
      </button>

      {abierto && (
        <div className="divide-y divide-outline-variant/40 border-t border-outline-variant bg-surface-container-lowest/60">
          {transacciones.map((tx) => (
            <TransaccionFila key={tx.id} tx={tx} totalGeneral={totalGeneral} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fila de bucket con categorías (niveles 1 y 2) ────────────────────────────

function BucketFila({
  bucket,
  totalGeneral,
}: {
  bucket: BucketDetalle
  totalGeneral: number
}) {
  const [abierto, setAbierto] = useState(false)
  const badge = BUCKET_BADGE[bucket.grupo]!
  const BucketIcon = badge.icon
  const n = bucket.categorias.length
  const subtitulo = `${n} ${n === 1 ? 'categoría' : 'categorías'}`

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:brightness-95"
        style={{ backgroundColor: badge.bg, color: badge.texto }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: iconBgFor(badge.texto) }}
          >
            <BucketIcon className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{badge.etiqueta}</p>
            <p className="text-[10px] opacity-80">{subtitulo}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <MontoPct
            monto={bucket.total}
            totalGeneral={totalGeneral}
            montoClassName="text-base font-bold"
          />
          {abierto ? (
            <ChevronDown className="size-4 opacity-80" strokeWidth={2} aria-hidden />
          ) : (
            <ChevronRight className="size-4 opacity-80" strokeWidth={2} aria-hidden />
          )}
        </div>
      </button>

      {abierto && (
        <div className="divide-y divide-outline-variant/40 border-t border-outline-variant bg-surface-container/40">
          {bucket.categorias.map((cat) => (
            <CategoriaFila key={cat.nombre} cat={cat} totalGeneral={totalGeneral} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Componente raíz ──────────────────────────────────────────────────────────

type DetallePorBucketProps = {
  buckets: BucketDetalle[]
}

export function DetallePorBucket({ buckets }: DetallePorBucketProps) {
  const totalGeneral = buckets.reduce((s, b) => s + b.total, 0)
  const slices: TortaSlice[] = buckets.map((b) => ({
    color: BUCKET_BADGE[b.grupo].bg,
    pct: totalGeneral > 0 ? (b.total / totalGeneral) * 100 : 0,
  }))

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="px-5 pb-3 pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
          Detalle por bucket
        </h3>
      </div>

      {buckets.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-on-surface-variant">
          Aún no hay gastos categorizados este mes.
        </p>
      ) : (
        <>
          {totalGeneral > 0 && (
            <div className="mb-2 flex justify-center pb-2">
              <MiniTorta slices={slices} />
            </div>
          )}

          <div className="flex flex-col gap-2 px-4 pb-5">
            {buckets.map((bucket) =>
              bucket.grupo === 'SinCategorizar' ? (
                <BucketSinCategorizarFila
                  key={bucket.grupo}
                  bucket={bucket}
                  totalGeneral={totalGeneral}
                />
              ) : (
                <BucketFila
                  key={bucket.grupo}
                  bucket={bucket}
                  totalGeneral={totalGeneral}
                />
              ),
            )}
          </div>
        </>
      )}
    </section>
  )
}
