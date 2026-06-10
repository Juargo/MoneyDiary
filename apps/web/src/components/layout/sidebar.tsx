import { Link } from '@tanstack/react-router'
import {
  Upload,
  LayoutGrid,
  Receipt,
  Settings,
  HelpCircle,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  to: string
  icon: typeof Upload
}

const navItems: NavItem[] = [
  { label: 'Inicio / Subir', to: '/', icon: Upload },
  { label: 'Panel', to: '/panel', icon: LayoutGrid },
  { label: 'Transacciones', to: '/transacciones', icon: Receipt },
]

const secondaryItems: NavItem[] = [
  { label: 'Configuración', to: '/configuracion', icon: Settings },
  { label: 'Ayuda', to: '/ayuda', icon: HelpCircle },
]

export function Sidebar() {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col bg-primary-container py-8 text-on-primary-container shadow-md">
      <div className="mb-8 px-6">
        <h1 className="text-2xl font-bold tracking-tight">MoneyDiary</h1>
        <p className="mt-0.5 text-xs text-on-primary-container/80">
          Sin registro. Solo analiza.
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-4">
        {navItems.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-auto px-6">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary shadow-lg transition-transform active:scale-95"
        >
          <Plus className="size-4" strokeWidth={2.5} />
          Subir nuevo archivo
        </button>
      </div>

      <div className="mt-4 space-y-1 border-t border-white/10 px-4 pt-4">
        {secondaryItems.map((item) => (
          <SidebarLink key={item.to} item={item} compact />
        ))}
      </div>
    </aside>
  )
}

function SidebarLink({
  item,
  compact = false,
}: {
  item: NavItem
  compact?: boolean
}) {
  const Icon = item.icon
  const baseClass = cn(
    'flex items-center gap-3 rounded-lg transition-all duration-200 ease-in-out',
    compact ? 'px-4 py-2 text-xs font-medium' : 'px-4 py-3 text-sm',
  )
  return (
    <Link
      to={item.to}
      className={cn(
        baseClass,
        'text-on-primary-container opacity-70 hover:bg-white/10 hover:opacity-100',
      )}
      activeProps={{
        className: cn(
          baseClass,
          'border-r-4 border-on-primary-container bg-white/20 font-bold text-on-primary-container opacity-100',
        ),
      }}
      activeOptions={{ exact: true }}
    >
      <Icon className="size-5" strokeWidth={2} />
      {item.label}
    </Link>
  )
}
