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
  type LucideIcon,
} from 'lucide-react'

/**
 * The 8 canonical categorías (`ORDEN_CATEGORIAS` in `@/domain/categoria`,
 * itself a deliberate web-side mirror of the backend's `Categoria` enum —
 * ADR-008) → decorative icon. lucide-react is already a dependency
 * (`^0.469.0`), tree-shakeable and self-hosted — no external icon font/CDN.
 */
const ICONO_POR_CATEGORIA: Record<string, LucideIcon> = {
  Supermercado: ShoppingCart,
  Combustible: Fuel,
  Farmacia: Pill,
  Salud: HeartPulse,
  Transporte: Bus,
  Streaming: PlayCircle,
  Delivery: Bike,
  Ahorro: PiggyBank,
}

/**
 * iconoDeCategoria — categoría name → icon, with a generic `Receipt`
 * fallback for `SinCategoria`, an unrecognized name, or a missing value
 * (WDS-05). Never throws — a lookup miss is a normal case (SinCategoria),
 * not an error.
 */
export function iconoDeCategoria(nombre: string | null | undefined): LucideIcon {
  return (nombre && ICONO_POR_CATEGORIA[nombre]) || Receipt
}
