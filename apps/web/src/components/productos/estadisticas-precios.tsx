import { formatCLP } from '@/lib/format'
import type { EstadisticasPrecio } from '@/lib/productos-mock'

type Props = {
  stats: EstadisticasPrecio
}

type StatCardProps = {
  label: string
  value: number
  colorClass: string
}

function StatCard({ label, value, colorClass }: StatCardProps) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-3 text-center shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <span className={`text-base font-bold ${colorClass}`}>
        {formatCLP(value)}
      </span>
    </div>
  )
}

export function EstadisticasPrecios({ stats }: Props) {
  return (
    <div className="flex gap-2">
      <StatCard label="Mejor precio" value={stats.mejor}    colorClass="text-[#16a34a]" />
      <StatCard label="Promedio"     value={stats.promedio} colorClass="text-on-surface" />
      <StatCard label="Más caro"     value={stats.masCaro}  colorClass="text-error"     />
    </div>
  )
}
