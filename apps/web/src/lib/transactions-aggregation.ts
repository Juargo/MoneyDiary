import type { GrupoPresupuesto, Transaccion } from '@/api/types'
import { formatMesAno, mesAnoKey } from './format'

/**
 * Agregado de un período (mes o año). La forma es la misma para que las
 * tarjetas del panel (income, distribución, buckets, top categorías) sean
 * agnósticas del tipo de período.
 */
export type MesAggregate = {
  key: string
  label: string
  items: Transaccion[]
  totalNeto: number
  ingresoMes: number
  ingresoBase: number
}

// Regla 50/30/20. Ingresos y SinCategorizar no participan del presupuesto.
export const BUDGET_PERCENTAGES: Partial<Record<GrupoPresupuesto, number>> = {
  Necesidades: 0.5,
  Gustos: 0.3,
  Ahorro: 0.2,
}

export function netoTransaccion(t: Transaccion): number {
  return t.abono > 0 ? t.abono : -t.cargo
}

/**
 * Agrupa transacciones por mes/año (desc) y calcula el ingreso base de cada
 * mes con fallback al mes calendario anterior cuando el actual aún no tiene
 * abonos registrados (típico antes que llegue el sueldo).
 */
export function agruparPorMes(transacciones: Transaccion[]): MesAggregate[] {
  const grupos = new Map<string, Transaccion[]>()
  for (const t of transacciones) {
    const key = mesAnoKey(t.fecha)
    const arr = grupos.get(key) ?? []
    arr.push(t)
    grupos.set(key, arr)
  }

  const base = [...grupos.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      )
      const totalNeto = sorted.reduce((sum, t) => sum + netoTransaccion(t), 0)
      const ingresoMes = sorted.reduce((sum, t) => sum + t.abono, 0)
      return {
        key,
        label: formatMesAno(sorted[0].fecha),
        items: sorted,
        totalNeto,
        ingresoMes,
      }
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1))

  return base.map((mes, idx) => {
    const fallback = base[idx + 1]?.ingresoMes ?? 0
    const ingresoBase = mes.ingresoMes > 0 ? mes.ingresoMes : fallback
    return { ...mes, ingresoBase }
  })
}

function anioKey(iso: string): string {
  return new Date(iso).getUTCFullYear().toString()
}

/**
 * Agrupa transacciones por año. No usa fallback — el "ingreso base" es el
 * total de abonos del año (el año es la unidad mínima en esta vista).
 */
export function agruparPorAnio(transacciones: Transaccion[]): MesAggregate[] {
  const grupos = new Map<string, Transaccion[]>()
  for (const t of transacciones) {
    const key = anioKey(t.fecha)
    const arr = grupos.get(key) ?? []
    arr.push(t)
    grupos.set(key, arr)
  }

  return [...grupos.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      )
      const totalNeto = sorted.reduce((sum, t) => sum + netoTransaccion(t), 0)
      const ingresoMes = sorted.reduce((sum, t) => sum + t.abono, 0)
      return {
        key,
        label: key,
        items: sorted,
        totalNeto,
        ingresoMes,
        ingresoBase: ingresoMes,
      }
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1))
}

export type BucketSummary = {
  grupo: GrupoPresupuesto
  gastado: number
  presupuesto: number | null
  porcentajeIdeal: number | null
  porcentajeReal: number | null
}

/**
 * Resume el gasto por bucket del mes. Devuelve uno por bucket de gasto
 * (Necesidades, Gustos, Ahorro) más SinCategorizar si tiene gasto.
 */
export function resumenBuckets(mes: MesAggregate): BucketSummary[] {
  const buckets: GrupoPresupuesto[] = [
    'Necesidades',
    'Gustos',
    'Ahorro',
    'SinCategorizar',
  ]
  const gastoTotal = mes.items.reduce((s, t) => s + t.cargo, 0)

  return buckets
    .map((grupo) => {
      const gastado = mes.items
        .filter((t) => t.categoria.grupo === grupo)
        .reduce((sum, t) => sum + t.cargo, 0)
      const ideal = BUDGET_PERCENTAGES[grupo] ?? null
      const presupuesto =
        ideal !== null && mes.ingresoBase > 0 ? mes.ingresoBase * ideal : null
      const porcentajeReal = gastoTotal > 0 ? gastado / gastoTotal : null
      return {
        grupo,
        gastado,
        presupuesto,
        porcentajeIdeal: ideal,
        porcentajeReal,
      }
    })
    .filter((b) => b.gastado > 0 || b.presupuesto !== null)
}

export type CategoriaSummary = {
  nombre: string
  grupo: GrupoPresupuesto
  gastado: number
  conteo: number
}

/**
 * Top categorías de gasto del mes — el "agujero de dinero".
 * Agrupa por nombre+grupo de categoría (lo que vea el usuario en el chip).
 */
export function topCategoriasGasto(
  mes: MesAggregate,
  limit = 5,
): CategoriaSummary[] {
  const map = new Map<string, CategoriaSummary>()
  for (const t of mes.items) {
    if (t.cargo <= 0) continue
    const key = `${t.categoria.grupo}::${t.categoria.nombre}`
    const existing = map.get(key)
    if (existing) {
      map.set(key, {
        ...existing,
        gastado: existing.gastado + t.cargo,
        conteo: existing.conteo + 1,
      })
    } else {
      map.set(key, {
        nombre: t.categoria.nombre,
        grupo: t.categoria.grupo,
        gastado: t.cargo,
        conteo: 1,
      })
    }
  }
  return [...map.values()]
    .sort((a, b) => b.gastado - a.gastado)
    .slice(0, limit)
}
