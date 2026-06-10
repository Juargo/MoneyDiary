export function DashboardFooter() {
  return (
    <footer className="border-t border-outline-variant bg-surface-container-lowest">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 px-6 py-4 md:flex-row">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-primary">MoneyDiary</span>
          <span className="text-xs text-on-surface-variant">
            © 2024 MoneyDiary. Sin registro. Solo analiza.
          </span>
        </div>

        <nav className="flex items-center gap-6">
          <a
            href="#"
            className="text-xs text-on-surface-variant transition-colors hover:text-primary"
          >
            Privacidad
          </a>
          <a
            href="#"
            className="text-xs text-on-surface-variant transition-colors hover:text-primary"
          >
            Términos
          </a>
          <a
            href="#"
            className="text-xs font-bold text-on-surface-variant transition-colors hover:text-primary"
          >
            Metodología 50/30/20
          </a>
        </nav>
      </div>
    </footer>
  )
}
