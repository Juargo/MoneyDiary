// Tipos y datos de ejemplo para el Tracker de productos.
// Detrás de `getProductosTracker()` para poder reemplazar por API en el futuro
// sin tocar los componentes.

export type CompraProducto = {
  id: string
  tienda: string
  fecha: string // ISO 8601
  precio: number
}

export type ProductoTracker = {
  id: string
  nombre: string
  icon: string // nombre de ícono lucide válido (ej. 'Leaf', 'Wheat', 'CookingPot')
  compras: CompraProducto[]
}

const PRODUCTOS: ProductoTracker[] = [
  {
    id: 'lechuga',
    nombre: 'Lechuga',
    icon: 'Leaf',
    compras: [
      { id: 'l1', tienda: 'Feria libre',          fecha: '2026-03-12', precio: 490  },
      { id: 'l2', tienda: 'Feria libre',          fecha: '2026-01-08', precio: 550  },
      { id: 'l3', tienda: 'Santa Isabel',         fecha: '2026-02-02', precio: 790  },
      { id: 'l4', tienda: 'Tottus',               fecha: '2026-04-20', precio: 890  },
      { id: 'l5', tienda: 'Tottus',               fecha: '2026-06-15', precio: 990  },
      { id: 'l6', tienda: 'Minimarket esquina',   fecha: '2026-05-29', precio: 1200 },
      { id: 'l7', tienda: 'Minimarket esquina',   fecha: '2026-06-03', precio: 1400 },
    ],
  },
  {
    id: 'cereal',
    nombre: 'Cereal',
    icon: 'Wheat',
    compras: [
      { id: 'c1', tienda: 'Lider',        fecha: '2026-01-15', precio: 2490 },
      { id: 'c2', tienda: 'Tottus',       fecha: '2026-02-20', precio: 2690 },
      { id: 'c3', tienda: 'Jumbo',        fecha: '2026-03-08', precio: 2990 },
      { id: 'c4', tienda: 'Santa Isabel', fecha: '2026-04-11', precio: 3190 },
      { id: 'c5', tienda: 'Lider',        fecha: '2026-05-22', precio: 2590 },
      { id: 'c6', tienda: 'Jumbo',        fecha: '2026-06-10', precio: 2890 },
    ],
  },
  {
    id: 'tallarines',
    nombre: 'Tallarines',
    icon: 'CookingPot',
    compras: [
      { id: 't1', tienda: 'Lider',              fecha: '2026-01-22', precio: 890  },
      { id: 't2', tienda: 'Santa Isabel',       fecha: '2026-02-14', precio: 990  },
      { id: 't3', tienda: 'Tottus',             fecha: '2026-03-30', precio: 850  },
      { id: 't4', tienda: 'Minimarket esquina', fecha: '2026-04-05', precio: 1200 },
      { id: 't5', tienda: 'Tottus',             fecha: '2026-05-18', precio: 870  },
    ],
  },
]

/** Función de acceso al mock — reemplazar por llamada a API cuando exista el endpoint. */
export function getProductosTracker(): ProductoTracker[] {
  return PRODUCTOS
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

export type EstadisticasPrecio = {
  mejor: number
  promedio: number
  masCaro: number
}

export function estadisticasPrecio(p: ProductoTracker): EstadisticasPrecio {
  const precios = p.compras.map((c) => c.precio)
  const mejor = Math.min(...precios)
  const masCaro = Math.max(...precios)
  const promedio = Math.round(precios.reduce((s, v) => s + v, 0) / precios.length)
  return { mejor, promedio, masCaro }
}

export type CompraConRanking = CompraProducto & { rankingPrecio: number }

/** Compras con su posición en el ranking por precio ascendente (1 = más barato). */
export function rankingPorPrecio(p: ProductoTracker): CompraConRanking[] {
  // Ordenar por precio asc para asignar posición
  const ordenadas = [...p.compras].sort((a, b) => a.precio - b.precio)
  const posicionPorId = new Map(ordenadas.map((c, i) => [c.id, i + 1]))
  return p.compras.map((c) => ({ ...c, rankingPrecio: posicionPorId.get(c.id)! }))
}

export type InsightTiendas = {
  tiendaBarata: string
  tiendaCara: string
  pct: number
} | null

/**
 * Calcula el insight de tiendas más barata vs más cara por promedio de precios.
 * Devuelve `null` si hay una sola tienda o los datos no permiten el cálculo.
 */
export function insightTiendas(p: ProductoTracker): InsightTiendas {
  // Agrupar precios por tienda
  const mapa = new Map<string, number[]>()
  for (const c of p.compras) {
    const lista = mapa.get(c.tienda) ?? []
    lista.push(c.precio)
    mapa.set(c.tienda, lista)
  }

  if (mapa.size < 2) return null

  let tiendaBarata = ''
  let promBarato = Infinity
  let tiendaCara = ''
  let promCaro = -Infinity

  for (const [tienda, precios] of mapa) {
    const prom = precios.reduce((s, v) => s + v, 0) / precios.length
    if (prom < promBarato) { promBarato = prom; tiendaBarata = tienda }
    if (prom > promCaro)   { promCaro   = prom; tiendaCara  = tienda }
  }

  if (tiendaBarata === tiendaCara) return null

  const pct = Math.round(((promCaro - promBarato) / promCaro) * 100)
  return { tiendaBarata, tiendaCara, pct }
}

/** Rango de meses de las compras. Ej: "ene–jun 2026". */
export function rangoMeses(p: ProductoTracker): string {
  const MESES_CORTOS = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]

  const fechas = p.compras.map((c) => new Date(c.fecha))
  const min = new Date(Math.min(...fechas.map((d) => d.getTime())))
  const max = new Date(Math.max(...fechas.map((d) => d.getTime())))

  const mesMin = MESES_CORTOS[min.getUTCMonth()]!
  const mesMax = MESES_CORTOS[max.getUTCMonth()]!
  const anioMin = min.getUTCFullYear()
  const anioMax = max.getUTCFullYear()

  if (anioMin === anioMax) {
    if (mesMin === mesMax) return `${mesMin} ${anioMin}`
    return `${mesMin}–${mesMax} ${anioMax}`
  }
  return `${mesMin} ${anioMin}–${mesMax} ${anioMax}`
}
