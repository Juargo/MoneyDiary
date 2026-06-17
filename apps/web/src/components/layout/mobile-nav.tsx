import { Link } from '@tanstack/react-router'
import {
  Upload,
  PieChart,
  LayoutGrid,
  Receipt,
  Tag,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  to: string
  icon: typeof Upload
}

const navItems: NavItem[] = [
  { label: 'Inicio / Subir', to: '/', icon: Upload },
  { label: 'Resumen', to: '/resumen', icon: PieChart },
  { label: 'Panel', to: '/panel', icon: LayoutGrid },
  { label: 'Transacciones', to: '/transacciones', icon: Receipt },
  { label: 'Patrones', to: '/patrones', icon: Tag },
]

type MobileNavProps = {
  open: boolean
  onClose: () => void
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 transition-opacity duration-200',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={cn(
          'absolute inset-y-0 left-0 flex w-[280px] max-w-[80%] flex-col bg-primary-container py-6 text-on-primary-container shadow-xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navegación"
      >
        <div className="mb-6 flex items-start justify-between px-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">MoneyDiary</h2>
            <p className="mt-0.5 text-xs text-on-primary-container/80">
              Sin registro. Solo analiza.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-on-primary-container transition-colors hover:bg-white/10"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const baseClass =
              'flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-all duration-200 ease-in-out'
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={cn(
                  baseClass,
                  'text-on-primary-container opacity-70 hover:bg-white/10 hover:opacity-100',
                )}
                activeProps={{
                  className: cn(
                    baseClass,
                    'bg-white/20 font-bold text-on-primary-container opacity-100',
                  ),
                }}
                activeOptions={{ exact: true }}
              >
                <Icon className="size-5" strokeWidth={2} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
    </div>
  )
}
