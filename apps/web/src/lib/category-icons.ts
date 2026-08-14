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
} from 'lucide-react';

/**
 * The 8 seed-template categoría names (ADR-036's `CATEGORIA_TEMPLATE`) →
 * decorative icon. Any other name — a user-created categoría, or an
 * unrecognized/missing value — falls back to the generic `Receipt` icon
 * below; this map is decoration only, never a validity check (US-043 §7:
 * the catalog is a per-user row set, no closed enum to mirror). lucide-react
 * is already a dependency (`^0.469.0`), tree-shakeable and self-hosted — no
 * external icon font/CDN.
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
};

/**
 * iconoDeCategoria — categoría name → icon, with a generic `Receipt`
 * fallback for `SinCategoria`, an unrecognized name, or a missing value
 * (WDS-05). Never throws — a lookup miss is a normal case (SinCategoria),
 * not an error.
 */
export function iconoDeCategoria(
  nombre: string | null | undefined,
): LucideIcon {
  return (nombre && ICONO_POR_CATEGORIA[nombre]) || Receipt;
}
