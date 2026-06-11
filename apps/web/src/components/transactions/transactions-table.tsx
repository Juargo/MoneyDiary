import type { LucideIcon } from 'lucide-react'
import {
  ChevronRight,
  ShoppingCart,
  Drama,
  PiggyBank,
  HelpCircle,
} from 'lucide-react'
import type { GrupoPresupuesto, Transaccion } from '@/api/types'
import { cn } from '@/lib/utils'
import { formatCLPSigned, formatMesAno, mesAnoKey } from '@/lib/format'
import { TransactionRow } from './transaction-row'

type GroupConfig = {
  grupo: GrupoPresupuesto
  label: string
  icon: LucideIcon
}

const groupOrder: GroupConfig[] = [
  { grupo: 'Necesidades', label: 'Necesidades', icon: ShoppingCart },
  { grupo: 'Gustos', label: 'Gustos', icon: Drama },
  { grupo: 'Ahorro', label: 'Ahorro e Ingresos', icon: PiggyBank },
  { grupo: 'SinCategorizar', label: 'Sin categorizar', icon: HelpCircle },
]

const grupoStyles: Record<GrupoPresupuesto, string> = {
  Necesidades: 'text-primary',
  Gustos: 'text-secondary',
  Ahorro: 'text-tertiary',
  SinCategorizar: 'text-on-surface-variant',
}

type MesGroup = {
  key: string
  label: string
  items: Transaccion[]
  total: number
}

function netoTransaccion(t: Transaccion): number {
  return t.abono > 0 ? t.abono : -t.cargo
}

function agruparPorMes(transacciones: Transaccion[]): MesGroup[] {
  const grupos = new Map<string, Transaccion[]>()
  for (const t of transacciones) {
    const key = mesAnoKey(t.fecha)
    const arr = grupos.get(key) ?? []
    arr.push(t)
    grupos.set(key, arr)
  }

  return [...grupos.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      )
      const total = sorted.reduce((sum, t) => sum + netoTransaccion(t), 0)
      return { key, label: formatMesAno(sorted[0].fecha), items: sorted, total }
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1))
}

type TransactionsTableProps = {
  transacciones: Transaccion[]
}

export function TransactionsTable({ transacciones }: TransactionsTableProps) {
  const meses = agruparPorMes(transacciones)

  return (
    <div className="flex flex-col gap-3">
      {meses.map((mes, idx) => (
        <MesAccordion key={mes.key} mes={mes} defaultOpen={idx === 0} />
      ))}
    </div>
  )
}

function MesAccordion({
  mes,
  defaultOpen,
}: {
  mes: MesGroup
  defaultOpen: boolean
}) {
  return (
    <details
      open={defaultOpen}
      className="group/mes overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 hover:bg-surface-container-low">
        <div className="flex items-center gap-3">
          <ChevronRight
            className="size-4 shrink-0 text-on-surface-variant transition-transform group-open/mes:rotate-90"
            strokeWidth={2.5}
          />
          <span className="text-sm font-bold uppercase tracking-wider text-on-surface">
            {mes.label}
          </span>
          <span className="text-xs font-medium text-on-surface-variant">
            {mes.items.length}{' '}
            {mes.items.length === 1 ? 'transacción' : 'transacciones'}
          </span>
        </div>
        <span className="whitespace-nowrap text-sm font-bold text-on-surface">
          {formatCLPSigned(mes.total)}
        </span>
      </summary>

      <CategoryAccordions items={mes.items} />
    </details>
  )
}

function CategoryAccordions({ items }: { items: Transaccion[] }) {
  const grouped = new Map<GrupoPresupuesto, Transaccion[]>()
  for (const t of items) {
    const arr = grouped.get(t.categoria.grupo) ?? []
    arr.push(t)
    grouped.set(t.categoria.grupo, arr)
  }

  const groups = groupOrder
    .map((cfg) => ({ ...cfg, items: grouped.get(cfg.grupo) ?? [] }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="border-t border-outline-variant/60">
      {groups.map((group) => {
        const total = group.items.reduce(
          (sum, t) => sum + netoTransaccion(t),
          0,
        )
        return (
          <CategoryAccordion
            key={group.grupo}
            config={group}
            total={total}
            items={group.items}
          />
        )
      })}
    </div>
  )
}

function CategoryAccordion({
  config,
  total,
  items,
}: {
  config: GroupConfig
  total: number
  items: Transaccion[]
}) {
  const Icon = config.icon
  return (
    <details className="group/cat border-b border-outline-variant/40 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-surface-container-low px-6 py-3 hover:bg-surface-container">
        <div className="flex items-center gap-3">
          <ChevronRight
            className="size-3.5 shrink-0 text-on-surface-variant transition-transform group-open/cat:rotate-90"
            strokeWidth={2.5}
          />
          <Icon
            className={cn('size-4 shrink-0', grupoStyles[config.grupo])}
            strokeWidth={2}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
            {config.label}
          </span>
          <span className="text-xs font-medium text-on-surface-variant">
            {items.length} {items.length === 1 ? 'transacción' : 'transacciones'}
          </span>
        </div>
        <span className="whitespace-nowrap text-sm font-bold text-on-surface">
          {formatCLPSigned(total)}
        </span>
      </summary>

      <div>
        <div className="grid grid-cols-[18%_42%_22%_18%] border-t border-outline-variant/40 px-6 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Fecha
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Descripción
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Categoría
          </div>
          <div className="text-right text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Monto
          </div>
        </div>
        {items.map((t) => (
          <TransactionRow key={t.id} transaccion={t} />
        ))}
      </div>
    </details>
  )
}

export function TransactionsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="border-b border-outline-variant/40 px-6 py-4">
        <div className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-outline-variant/40 px-6 py-4 last:border-b-0"
        >
          <div className="h-3 w-20 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 flex-1 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 w-20 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
        </div>
      ))}
    </div>
  )
}
