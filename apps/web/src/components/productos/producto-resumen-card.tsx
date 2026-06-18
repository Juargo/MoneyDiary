import { LucideIcon } from '@/components/patrones/lucide-icon'
import type { ProductoTracker } from '@/lib/productos-mock'
import { rangoMeses } from '@/lib/productos-mock'

type Props = {
  producto: ProductoTracker
}

export function ProductoResumenCard({ producto }: Props) {
  const rango = rangoMeses(producto)
  const nCompras = producto.compras.length

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-4 shadow-sm">
      {/* Ícono del producto */}
      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
        <LucideIcon
          name={producto.icon}
          className="size-7 text-primary"
          fallback
        />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-on-surface">{producto.nombre}</h2>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {nCompras} compra{nCompras !== 1 ? 's' : ''} registrada
          {nCompras !== 1 ? 's' : ''} · {rango}
        </p>
      </div>
    </div>
  )
}
