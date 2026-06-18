import { cn } from '@/lib/utils'

export type OrdenProductos = 'precio' | 'fecha' | 'tienda'

const OPCIONES: { value: OrdenProductos; label: string }[] = [
  { value: 'precio', label: 'Precio ↑' },
  { value: 'fecha',  label: 'Fecha'    },
  { value: 'tienda', label: 'Tienda'   },
]

type Props = {
  orden: OrdenProductos
  onChange: (orden: OrdenProductos) => void
}

export function OrdenarControl({ orden, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-sm font-medium text-on-surface-variant">
        Ordenar:
      </span>
      <div className="flex flex-1 rounded-xl bg-surface-container-high p-1">
        {OPCIONES.map((op) => (
          <button
            key={op.value}
            type="button"
            onClick={() => onChange(op.value)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all duration-150',
              orden === op.value
                ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  )
}
