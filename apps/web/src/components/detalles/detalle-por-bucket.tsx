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
  bg: string
  fg: string
  etiqueta: string
}

const BUCKET_BADGE: Record<GrupoPresupuesto, BucketBadge> = {
  Necesidades: {
    icon: Home,
    bg: '#afc7f3',
    fg: '#1c3a66',
    etiqueta: 'Necesidades',
  },
  Gustos: {
    icon: Heart,
    bg: '#cbc1ec',
    fg: '#3a2d66',
    etiqueta: 'Gustos',
  },
  Ahorro: {
    icon: PiggyBank,
    bg: '#dac589',
    fg: '#4a3d12',
    etiqueta: 'Ahorro',
  },
  SinCategorizar: {
    icon: CircleHelp,
    bg: '#e0e0e0',
    fg: '#404040',
    etiqueta: 'Sin categoría',
  },
  Ingresos: {
    icon: CircleHelp,
    bg: '#e0e0e0',
    fg: '#404040',
    etiqueta: 'Ingresos',
  },
}

// ─── Fila de transacción (hoja — sin chevron, sin nivel inferior) ──────────────

function TransaccionFila({ tx }: { tx: TransaccionDetalle }) {
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
      <span className="shrink-0 text-xs font-semibold text-on-surface">
        {formatCLP(tx.monto)}
      </span>
    </div>
  )
}

// ─── Fila de categoría (nivel 2) ───────────────────────────────────────────────

function CategoriaFila({ cat }: { cat: CategoriaDetalle }) {
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
          <span className="text-sm font-bold text-on-surface">
            {formatCLP(cat.total)}
          </span>
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
            <TransaccionFila key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fila de bucket SinCategorizar (aplana: muestra transacciones directamente) ─

function BucketSinCategorizarFila({
  bucket,
}: {
  bucket: BucketDetalle
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
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-container"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: badge.bg, color: badge.fg }}
          >
            <BucketIcon className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface">
              {badge.etiqueta}
            </p>
            <p className="text-[10px] text-on-surface-variant">{subtitulo}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-base font-bold text-on-surface">
            {formatCLP(bucket.total)}
          </span>
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
        <div className="divide-y divide-outline-variant/40 border-t border-outline-variant bg-surface-container-lowest/60">
          {transacciones.map((tx) => (
            <TransaccionFila key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fila de bucket con categorías (niveles 1 y 2) ────────────────────────────

function BucketFila({ bucket }: { bucket: BucketDetalle }) {
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
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-container"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: badge.bg, color: badge.fg }}
          >
            <BucketIcon className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface">
              {badge.etiqueta}
            </p>
            <p className="text-[10px] text-on-surface-variant">{subtitulo}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-base font-bold text-on-surface">
            {formatCLP(bucket.total)}
          </span>
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
        <div className="divide-y divide-outline-variant/40 border-t border-outline-variant bg-surface-container/40">
          {bucket.categorias.map((cat) => (
            <CategoriaFila key={cat.nombre} cat={cat} />
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
        <div className="flex flex-col gap-2 px-4 pb-5">
          {buckets.map((bucket) =>
            bucket.grupo === 'SinCategorizar' ? (
              <BucketSinCategorizarFila key={bucket.grupo} bucket={bucket} />
            ) : (
              <BucketFila key={bucket.grupo} bucket={bucket} />
            ),
          )}
        </div>
      )}
    </section>
  )
}
