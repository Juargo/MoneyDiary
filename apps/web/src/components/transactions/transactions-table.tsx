import type { LucideIcon } from 'lucide-react'
import {
  ChevronRight,
  ShoppingCart,
  Drama,
  PiggyBank,
  HelpCircle,
  TrendingUp,
} from 'lucide-react'
import type { GrupoPresupuesto, Transaccion } from '@/api/types'
import { cn } from '@/lib/utils'
import { formatCLP, formatCLPSigned, formatMesAno, mesAnoKey } from '@/lib/format'
import { TransactionRow } from './transaction-row'

type GroupConfig = {
  grupo: GrupoPresupuesto
  label: string
  icon: LucideIcon
}

const groupOrder: GroupConfig[] = [
  { grupo: 'Ingresos', label: 'Ingresos', icon: TrendingUp },
  { grupo: 'Necesidades', label: 'Necesidades', icon: ShoppingCart },
  { grupo: 'Gustos', label: 'Gustos', icon: Drama },
  { grupo: 'Ahorro', label: 'Ahorro', icon: PiggyBank },
  { grupo: 'SinCategorizar', label: 'Sin categorizar', icon: HelpCircle },
]

const grupoStyles: Record<GrupoPresupuesto, string> = {
  Ingresos: 'text-tertiary',
  Necesidades: 'text-primary',
  Gustos: 'text-secondary',
  Ahorro: 'text-on-surface',
  SinCategorizar: 'text-on-surface-variant',
}

// Regla 50/30/20. Ingresos y SinCategorizar no participan del presupuesto.
const BUDGET_PERCENTAGES: Partial<Record<GrupoPresupuesto, number>> = {
  Necesidades: 0.5,
  Gustos: 0.3,
  Ahorro: 0.2,
}

type MesGroup = {
  key: string
  label: string
  items: Transaccion[]
  totalNeto: number
  ingresoMes: number
  ingresoBase: number
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

  const baseMeses = [...grupos.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      )
      const totalNeto = sorted.reduce((sum, t) => sum + netoTransaccion(t), 0)
      const ingresoMes = sorted.reduce((sum, t) => sum + t.abono, 0)
      return {
        key,
        label: formatMesAno(sorted[0].fecha),
        items: sorted,
        totalNeto,
        ingresoMes,
      }
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1))

  // Si un mes no tiene ingresos, usa los del mes calendario anterior
  // (siguiente en el array, porque está ordenado desc) como fallback.
  return baseMeses.map((mes, idx) => {
    const fallback = baseMeses[idx + 1]?.ingresoMes ?? 0
    const ingresoBase = mes.ingresoMes > 0 ? mes.ingresoMes : fallback
    return { ...mes, ingresoBase }
  })
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
          {formatCLPSigned(mes.totalNeto)}
        </span>
      </summary>

      <CategoryAccordions items={mes.items} ingresoBase={mes.ingresoBase} />
    </details>
  )
}

function CategoryAccordions({
  items,
  ingresoBase,
}: {
  items: Transaccion[]
  ingresoBase: number
}) {
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
      {groups.map((group) => (
        <CategoryAccordion
          key={group.grupo}
          config={group}
          items={group.items}
          ingresoBase={ingresoBase}
        />
      ))}
    </div>
  )
}

function CategoryAccordion({
  config,
  items,
  ingresoBase,
}: {
  config: GroupConfig
  items: Transaccion[]
  ingresoBase: number
}) {
  const Icon = config.icon
  const isIngresos = config.grupo === 'Ingresos'
  const totalCargos = items.reduce((sum, t) => sum + t.cargo, 0)
  const totalAbonos = items.reduce((sum, t) => sum + t.abono, 0)
  const totalDisplay = isIngresos ? totalAbonos : -totalCargos
  const percentage = BUDGET_PERCENTAGES[config.grupo]
  const presupuesto =
    percentage !== undefined && ingresoBase > 0
      ? ingresoBase * percentage
      : null

  return (
    <details className="group/cat border-b border-outline-variant/40 last:border-b-0">
      <summary className="flex cursor-pointer list-none flex-col gap-2 bg-surface-container-low px-6 py-3 hover:bg-surface-container">
        <div className="flex items-center justify-between gap-4">
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
            {formatCLPSigned(totalDisplay)}
          </span>
        </div>

        {presupuesto !== null && (
          <BudgetBar gastado={totalCargos} presupuesto={presupuesto} />
        )}
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

function BudgetBar({
  gastado,
  presupuesto,
}: {
  gastado: number
  presupuesto: number
}) {
  const ratio = gastado / presupuesto
  const pct = Math.round(ratio * 100)
  const widthPct = Math.min(ratio, 1) * 100
  const barColor =
    ratio > 1
      ? 'bg-error'
      : ratio >= 0.8
        ? 'bg-amber-500'
        : 'bg-tertiary'

  return (
    <div className="ml-7 flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-[11px] font-medium text-on-surface-variant">
        {formatCLP(gastado)} de {formatCLP(presupuesto)} · {pct}%
      </span>
    </div>
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
