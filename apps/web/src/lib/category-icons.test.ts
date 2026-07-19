import { describe, expect, it } from 'vitest'
import {
  ShoppingCart,
  Fuel,
  Pill,
  HeartPulse,
  Bus,
  PlayCircle,
  Bike,
  PiggyBank,
  Receipt,
} from 'lucide-react'
import { iconoDeCategoria } from './category-icons'
import { ORDEN_CATEGORIAS } from '@/domain/categoria'

// WDS-05: every transaction row shows an icon keyed by its categoría's
// canonical name; an unrecognized/missing name renders the generic Receipt
// fallback and never throws (spec scenario: "An unknown categoría shows the
// generic fallback without crashing").
const ICONO_ESPERADO_POR_CATEGORIA: Record<string, unknown> = {
  Supermercado: ShoppingCart,
  Combustible: Fuel,
  Farmacia: Pill,
  Salud: HeartPulse,
  Transporte: Bus,
  Streaming: PlayCircle,
  Delivery: Bike,
  Ahorro: PiggyBank,
}

describe('iconoDeCategoria', () => {
  it.each(ORDEN_CATEGORIAS)('resolves the mapped icon for canonical categoría "%s"', (nombre) => {
    expect(iconoDeCategoria(nombre)).toBe(ICONO_ESPERADO_POR_CATEGORIA[nombre])
  })

  it('resolves the 8 canonical categorías to 8 distinct icons', () => {
    const iconos = ORDEN_CATEGORIAS.map((nombre) => iconoDeCategoria(nombre))
    expect(new Set(iconos).size).toBe(ORDEN_CATEGORIAS.length)
  })

  it('falls back to the generic Receipt icon for an unrecognized categoría name', () => {
    expect(iconoDeCategoria('CategoriaInventada')).toBe(Receipt)
  })

  it('falls back to Receipt without throwing for null', () => {
    expect(() => iconoDeCategoria(null)).not.toThrow()
    expect(iconoDeCategoria(null)).toBe(Receipt)
  })

  it('falls back to Receipt without throwing for undefined', () => {
    expect(() => iconoDeCategoria(undefined)).not.toThrow()
    expect(iconoDeCategoria(undefined)).toBe(Receipt)
  })

  it('falls back to Receipt without throwing for an empty string (e.g. SinCategoria)', () => {
    expect(iconoDeCategoria('')).toBe(Receipt)
  })
})
