import {
  Banknote,
  Beef,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Coffee,
  CookingPot,
  CreditCard,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  Heart,
  HeartPulse,
  Home,
  Hospital,
  Leaf,
  Lightbulb,
  Music,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Store,
  Tag,
  Ticket,
  Train,
  TrendingUp,
  Tv,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Wheat,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export type IconGroup = {
  label: string
  icons: ReadonlyArray<string>
}

export const ICON_CATALOG: ReadonlyArray<IconGroup> = [
  {
    label: 'Transporte',
    icons: ['Car', 'Bus', 'Train', 'Plane', 'Bike', 'Fuel'],
  },
  {
    label: 'Comida',
    icons: ['Utensils', 'UtensilsCrossed', 'Coffee', 'Pizza', 'Beef', 'ShoppingBasket'],
  },
  {
    label: 'Hogar y servicios',
    icons: ['Home', 'Lightbulb', 'Wifi', 'Wrench', 'Tv', 'Smartphone'],
  },
  {
    label: 'Compras',
    icons: ['ShoppingCart', 'ShoppingBag', 'Shirt', 'Gift'],
  },
  {
    label: 'Salud',
    icons: ['HeartPulse', 'Pill', 'Stethoscope', 'Hospital'],
  },
  {
    label: 'Entretenimiento',
    icons: ['Music', 'Film', 'Gamepad2', 'BookOpen', 'Ticket'],
  },
  {
    label: 'Dinero',
    icons: ['Wallet', 'CreditCard', 'Banknote', 'PiggyBank', 'TrendingUp', 'Briefcase'],
  },
  {
    label: 'Otros',
    icons: ['Sparkles', 'Heart', 'Tag'],
  },
]

const ICON_MAP: Record<string, LucideIcon> = {
  Banknote, Beef, Bike, BookOpen, Briefcase, Bus, Car, Coffee, CookingPot,
  CreditCard, Film, Fuel, Gamepad2, Gift, Heart, HeartPulse, Home, Hospital,
  Leaf, Lightbulb, Music, PiggyBank, Pill, Pizza, Plane, Shirt, ShoppingBag,
  ShoppingBasket, ShoppingCart, Smartphone, Sparkles, Stethoscope, Store,
  Tag, Ticket, Train, TrendingUp, Tv, Utensils, UtensilsCrossed, Wallet,
  Wheat, Wifi, Wrench,
}

export function getIconComponent(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  return ICON_MAP[name] ?? null
}
