import {
  Bike,
  Bus,
  Car,
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
} from 'lucide-react-native';
import type { IconoCategoria } from '../domain/catalogo-constantes';

/**
 * iconos-categoria.ts — render map of the curated category icon allowlist
 * (categoria-iconografia, ADR-045, D-02/D-05). Mirrors
 * `apps/web/src/lib/iconos-categoria.ts`'s structure but is a fresh mobile
 * file, not a port of a web component — named imports from
 * `lucide-react-native` (this repo's jest config CJS-redirects the bare
 * import, `jest.config.js`), keyed by the `icono` WIRE value (CATICO-01/02/
 * 03), never by category name.
 *
 * `MAPA_ICONO_CATEGORIA` is `satisfies Record<IconoCategoria, LucideIcon>`:
 * adding a name to `ICONOS_CATEGORIA` without adding its entry here fails
 * `tsc` directly (compile-time totality, no `switch`/`never` needed).
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
} satisfies Record<IconoCategoria, LucideIcon>;

/**
 * `ETIQUETA_ICONO` — lucide kebab-case name → accessible Spanish label
 * (CATICO-08: "never the raw lucide identifier"). Consumed by the picker
 * (PR6) for each option's `accessibilityLabel`/visible name. Verbatim
 * parity with web's own `ETIQUETA_ICONO` (`lib/iconos-categoria.ts`) — same
 * labels, same allowlist, one product vocabulary across clients.
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
  // bucket option, and both controls share the Configuración screen — a
  // flattened control list (VoiceOver rotor, Voice Control) could not tell them
  // apart. Mirrored in apps/web; the mirror spec pins icon ids, not labels.
  'piggy-bank': 'Alcancía',
  'trending-up': 'Inversiones',
  'credit-card': 'Tarjeta de crédito',
};

/**
 * iconoCategoria — `icono` (wire value of a `Categoria`) → lucide
 * component, with the generic `Tag` fallback for `null`, `undefined`, or
 * any name absent from the allowlist (CATICO-06) — including a name
 * RETIRED from a future allowlist version (D-04: readers must never break
 * on a name that is no longer valid). Never throws and never treats a
 * lookup miss as an error — it is the normal "no icon" case.
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
