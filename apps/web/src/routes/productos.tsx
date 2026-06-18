import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { MobileNav } from '@/components/layout/mobile-nav'
import { ProductoChips } from '@/components/productos/producto-chips'
import { ProductoResumenCard } from '@/components/productos/producto-resumen-card'
import { EstadisticasPrecios } from '@/components/productos/estadisticas-precios'
import { OrdenarControl, type OrdenProductos } from '@/components/productos/ordenar-control'
import { RankingPrecios } from '@/components/productos/ranking-precios'
import { InsightTiendasBanner } from '@/components/productos/insight-tiendas'
import { NavProductosFooter } from '@/components/productos/nav-productos-footer'
import {
  getProductosTracker,
  estadisticasPrecio,
  rankingPorPrecio,
  insightTiendas,
} from '@/lib/productos-mock'

export const Route = createFileRoute('/productos')({
  component: ProductosPage,
})

// Datos síncronos desde el mock — sin TanStack Query ni isPending.
const productos = getProductosTracker()

function ProductosPage() {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [activoId, setActivoId]   = useState(productos[0]?.id ?? '')
  const [busqueda, setBusqueda]   = useState('')
  const [orden, setOrden]         = useState<OrdenProductos>('precio')

  const activo = productos.find((p) => p.id === activoId) ?? productos[0]

  if (!activo) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-background text-on-background">
        <p className="text-sm text-on-surface-variant">Sin productos disponibles.</p>
      </div>
    )
  }

  const stats   = estadisticasPrecio(activo)
  const ranking = rankingPorPrecio(activo)
  const insight = insightTiendas(activo)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background text-on-background">
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4">
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => setMenuOpen(true)}
          className="flex size-10 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
        >
          <Menu className="size-6" strokeWidth={2} />
        </button>

        <div className="flex flex-col items-center">
          <h1 className="text-xl font-bold tracking-tight">Tracker de productos</h1>
          <p className="text-xs text-on-surface-variant">Historial de precios · 2026</p>
        </div>

        <div className="flex size-10 items-center justify-center rounded-full bg-primary-container text-sm font-bold text-on-primary-container">
          JD
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 px-4 py-2">
        <div className="flex flex-col gap-5">
          {/* Buscador + chips de productos */}
          <ProductoChips
            productos={productos}
            activoId={activoId}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            onSeleccionar={setActivoId}
          />

          {/* Card de producto activo */}
          <ProductoResumenCard producto={activo} />

          {/* 3 cards de estadísticas */}
          <EstadisticasPrecios stats={stats} />

          {/* Control de orden */}
          <OrdenarControl orden={orden} onChange={setOrden} />

          {/* Ranking por precio */}
          <RankingPrecios
            compras={ranking}
            orden={orden}
            precioMin={stats.mejor}
            precioMax={stats.masCaro}
          />

          {/* Banner de insight */}
          <InsightTiendasBanner insight={insight} />

          {/* Footer de navegación entre productos */}
          <NavProductosFooter
            productos={productos}
            activoId={activoId}
            onSeleccionar={setActivoId}
          />
        </div>
      </main>
    </div>
  )
}
