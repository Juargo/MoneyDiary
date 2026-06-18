import { ArrowRight } from 'lucide-react'
import type { ProductoTracker } from '@/lib/productos-mock'

type Props = {
  productos: ProductoTracker[]
  activoId: string
  onSeleccionar: (id: string) => void
}

export function NavProductosFooter({ productos, activoId, onSeleccionar }: Props) {
  // Otros productos (no el activo), máximo 2
  const otros = productos.filter((p) => p.id !== activoId).slice(0, 2)

  if (otros.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {otros.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSeleccionar(p.id)}
          className="flex items-center gap-1.5 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
        >
          Ver {p.nombre}
          <ArrowRight className="size-4 text-on-surface-variant" strokeWidth={2} aria-hidden />
        </button>
      ))}
    </div>
  )
}
