import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle, Menu } from 'lucide-react'
import { MobileNav } from '@/components/layout/mobile-nav'
import { useTransacciones } from '@/api/use-transacciones'
import { agruparPorMes } from '@/lib/transactions-aggregation'
import { formatCLP, formatMesAno, mesAnoKey } from '@/lib/format'

export const Route = createFileRoute('/resumen')({
  component: ResumenPage,
})

function ResumenPage() {
  const query = useTransacciones()
  const [menuOpen, setMenuOpen] = useState(false)

  const ahora = new Date()
  const mesActualKey = mesAnoKey(ahora.toISOString())
  const mesActualLabel = formatMesAno(ahora.toISOString())

  const ingresosMes = useMemo(() => {
    const transacciones = query.data?.transacciones ?? []
    const meses = agruparPorMes(transacciones)
    const mesActual = meses.find((m) => m.key === mesActualKey)
    return mesActual?.ingresoBase ?? 0
  }, [query.data, mesActualKey])

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background text-on-background">
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />

      <header className="flex items-center justify-between px-4 py-4">
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => setMenuOpen(true)}
          className="flex size-10 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
        >
          <Menu className="size-6" strokeWidth={2} />
        </button>

        <h1 className="text-xl font-bold tracking-tight">{mesActualLabel}</h1>

        <div className="flex size-10 items-center justify-center rounded-full bg-primary-container text-sm font-bold text-on-primary-container">
          JD
        </div>
      </header>

      <main className="flex-1 px-4 py-2">
        {query.isPending ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-container" />
        ) : query.isError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container">
            <AlertCircle className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
            <div>
              <p className="font-semibold">
                No se pudieron cargar las transacciones
              </p>
              <p className="mt-1 opacity-90">{query.error.message}</p>
            </div>
          </div>
        ) : (
          <IngresosCard amount={ingresosMes} />
        )}
      </main>
    </div>
  )
}

function IngresosCard({ amount }: { amount: number }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-7 text-center shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1.5 bg-primary" aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
        Ingresos
      </p>
      <h2 className="mt-2 text-4xl font-bold text-primary">
        {formatCLP(amount)}
      </h2>
    </section>
  )
}
