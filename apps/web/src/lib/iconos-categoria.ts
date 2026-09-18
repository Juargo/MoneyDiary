import {
  Bike,
  Bus,
  Car,
  CircleHelp,
  CreditCard,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  Pill,
  PiggyBank,
  Plane,
  Shield,
  Shirt,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Tv,
  Utensils,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { IconoCategoria } from '@/api/catalogo-constantes';

/**
 * iconos-categoria.ts — render map de la allowlist curada de íconos de
 * categoría (categoria-iconografia, ADR-045, D-02/D-05). Reemplaza en
 * alcance a `lib/category-icons.ts` (name-keyed, retirado en PR5) — este
 * mapa es keyed por VALOR de `icono` (el wire value de CATICO-01/02/03), no
 * por nombre de categoría.
 *
 * `MAPA_ICONO_CATEGORIA` está tipado `satisfies Record<IconoCategoria,
 * LucideIcon>`: agregar un nombre a `ICONOS_CATEGORIA` sin agregar su
 * entrada aquí falla `tsc` directamente (totalidad en compilación, sin
 * `switch`/`never`). Imports NOMBRADOS de `lucide-react` (no un lookup
 * dinámico por string) — tree-shakeable, y cada nombre PascalCase ya fue
 * verificado contra los exports reales de la librería instalada
 * (design.md "Allowlist").
 */
const MAPA_ICONO_CATEGORIA = {
  'shopping-cart': ShoppingCart,
  fuel: Fuel,
  pill: Pill,
  'heart-pulse': HeartPulse,
  bus: Bus,
  house: House,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  'graduation-cap': GraduationCap,
  shield: Shield,
  car: Car,
  'paw-print': PawPrint,
  tv: Tv,
  bike: Bike,
  utensils: Utensils,
  shirt: Shirt,
  plane: Plane,
  'gamepad-2': Gamepad2,
  gift: Gift,
  dumbbell: Dumbbell,
  'piggy-bank': PiggyBank,
  'trending-up': TrendingUp,
  'credit-card': CreditCard,
  'circle-help': CircleHelp,
} satisfies Record<IconoCategoria, LucideIcon>;

/**
 * `ETIQUETA_ICONO` — nombre lucide kebab-case → etiqueta accesible en
 * español (CATICO-08: "nunca el identificador crudo de lucide"). Consumida
 * por el picker (PR4) para el `aria-label`/nombre visible de cada opción.
 */
export const ETIQUETA_ICONO: Record<IconoCategoria, string> = {
  'shopping-cart': 'Carrito de compras',
  fuel: 'Combustible',
  pill: 'Medicamento',
  'heart-pulse': 'Salud',
  bus: 'Bus',
  house: 'Hogar',
  zap: 'Electricidad',
  wifi: 'Wifi',
  smartphone: 'Celular',
  'graduation-cap': 'Educación',
  shield: 'Seguro',
  car: 'Auto',
  'paw-print': 'Mascotas',
  tv: 'Streaming',
  bike: 'Bicicleta',
  utensils: 'Comida',
  shirt: 'Ropa',
  plane: 'Viajes',
  'gamepad-2': 'Videojuegos',
  gift: 'Regalos',
  dumbbell: 'Gimnasio',
  // "Alcancía", not "Ahorro": that was the exact accessible name of the Ahorro
  // bucket option, and both controls share a screen in Configuración — a
  // flattened control list (VoiceOver rotor, Voice Control) could not tell them
  // apart. Mirrored in apps/mobile; the mirror spec pins icon ids, not labels.
  'piggy-bank': 'Alcancía',
  'trending-up': 'Inversiones',
  'credit-card': 'Tarjeta de crédito',
  'circle-help': 'Desconocido',
};

/**
 * iconoCategoria — `icono` (wire value de una `Categoria`) → componente
 * lucide, con el fallback genérico `Tag` para `null`, `undefined`, o
 * cualquier nombre ausente de la allowlist (CATICO-06) — incluye un nombre
 * RETIRADO de una versión futura de la allowlist (D-04: los lectores nunca
 * deben romper ante un nombre que ya no es válido). Nunca lanza y nunca
 * valida membresía como error — un lookup miss es el caso normal
 * "sin ícono", no un estado de error.
 */
export function iconoCategoria(icono: string | null | undefined): LucideIcon {
  if (icono === null || icono === undefined) {
    return Tag;
  }
  return (
    (MAPA_ICONO_CATEGORIA as Record<string, LucideIcon | undefined>)[icono] ??
    Tag
  );
}
