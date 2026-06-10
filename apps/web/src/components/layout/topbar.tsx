import { Bell } from 'lucide-react'

type TopbarProps = {
  title: string
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-outline-variant bg-surface/80 px-6 backdrop-blur-md">
      <h2 className="text-2xl font-semibold text-on-surface">{title}</h2>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 md:flex">
          <span className="size-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs font-medium text-on-surface-variant">
            Datos locales seguros
          </span>
        </div>

        <button
          type="button"
          aria-label="Notificaciones"
          className="flex size-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <Bell className="size-5" strokeWidth={1.75} />
        </button>

        <div className="flex size-8 items-center justify-center rounded-full bg-primary-fixed text-xs font-bold text-on-primary-fixed">
          JD
        </div>
      </div>
    </header>
  )
}
