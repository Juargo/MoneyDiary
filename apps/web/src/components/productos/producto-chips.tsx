import { cn } from '@/lib/utils'
import type { ProductoTracker } from '@/lib/productos-mock'

type Props = {
  productos: ProductoTracker[]
  activoId: string
  busqueda: string
  onBusqueda: (v: string) => void
  onSeleccionar: (id: string) => void
}

export function ProductoChips({
  productos,
  activoId,
  busqueda,
  onBusqueda,
  onSeleccionar,
}: Props) {
  const filtrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Buscador */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="search"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          className="w-full rounded-xl border border-outline-variant bg-surface-container py-2 pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-2">
        {filtrados.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSeleccionar(p.id)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              p.id === activoId
                ? 'bg-primary text-on-primary'
                : 'border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high',
            )}
          >
            {p.nombre}
          </button>
        ))}

        {/* Chip "+" — placeholder, sin persistencia */}
        <button
          type="button"
          title="Próximamente"
          disabled
          className="rounded-full border border-outline-variant bg-surface-container px-4 py-1.5 text-sm font-medium text-on-surface-variant opacity-50 cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  )
}
