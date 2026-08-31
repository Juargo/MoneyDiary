import {
  CircleDashed,
  House,
  PiggyBank,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * Bucket (domain key) → decorative icon for the 50/30/20 buckets, sibling of
 * `category-icons.ts` (same idiom: lucide, ADR-027; decoration only, never a
 * validity check). Keys are the DOMAIN keys (`Deseos`, not the "Gustos" UI
 * label) so the map never drifts when `ETIQUETA_BUCKET` relabels. The
 * fallback covers "Sin categoría" (empty string) and any unknown bucket.
 */
const ICONO_POR_BUCKET: Record<string, LucideIcon> = {
  Necesidades: House,
  Deseos: Sparkles,
  Ahorro: PiggyBank,
};

export function iconoDeBucket(bucket: string | null | undefined): LucideIcon {
  return (bucket && ICONO_POR_BUCKET[bucket]) || CircleDashed;
}
