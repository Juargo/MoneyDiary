import type { LucideIcon } from 'lucide-react'
import { ShoppingCart, Drama, PiggyBank, HelpCircle } from 'lucide-react'
import type { GrupoPresupuesto, Transaccion } from '@/api/types'
import { TransactionRow } from './transaction-row'
import { TransactionGroupHeader } from './transaction-group-header'

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

type TransactionsTableProps = {
  transacciones: Transaccion[]
}

export function TransactionsTable({ transacciones }: TransactionsTableProps) {
  const grouped = new Map<GrupoPresupuesto, Transaccion[]>()
  for (const t of transacciones) {
    const arr = grouped.get(t.categoria.grupo) ?? []
    arr.push(t)
    grouped.set(t.categoria.grupo, arr)
  }

  // Mantenemos el orden fijo de grupos; sólo renderizamos los que tienen datos.
  const groups = groupOrder
    .map((cfg) => ({ ...cfg, items: grouped.get(cfg.grupo) ?? [] }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[42%]" />
          <col className="w-[22%]" />
          <col className="w-[18%]" />
        </colgroup>

        <thead>
          <tr>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Fecha
            </th>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Descripción
            </th>
            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Categoría
            </th>
            <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Monto
            </th>
          </tr>
        </thead>

        <tbody>
          {groups.map((group) => {
            const total = group.items.reduce(
              (sum, t) => sum + (t.abono > 0 ? t.abono : -t.cargo),
              0,
            )
            return (
              <GroupBlock
                key={group.grupo}
                config={group}
                total={total}
                items={group.items}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GroupBlock({
  config,
  total,
  items,
}: {
  config: GroupConfig
  total: number
  items: Transaccion[]
}) {
  return (
    <>
      <TransactionGroupHeader
        grupo={config.grupo}
        label={config.label}
        icon={config.icon}
        count={items.length}
        total={total}
      />
      {items.map((t) => (
        <TransactionRow key={t.id} transaccion={t} />
      ))}
    </>
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
