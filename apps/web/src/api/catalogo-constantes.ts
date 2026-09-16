/**
 * catalogo-constantes.ts — vocabulario de "wire" del catálogo de
 * clasificación (US-043, design.md §1/Q4a). `BUCKETS_ASIGNABLES` es también
 * el orden de agrupación de la lista (`agruparPorBucket`, PR #2) — no existe
 * un `ORDEN_BUCKETS` separado: dos nombres para el mismo array sería drift
 * (`dry`). `ICONOS_CATEGORIA` (categoria-iconografia, ADR-045) es la
 * allowlist curada de íconos de categoría. Los tres arrays están espejados
 * contra el backend por `catalogo-constantes.mirror.spec.ts` (misma
 * carpeta).
 */

/** Los tres buckets a los que una categoría puede asignarse (orden de grupo en CA-01). */
export const BUCKETS_ASIGNABLES = ['Necesidades', 'Deseos', 'Ahorro'] as const;

export type BucketAsignable = (typeof BUCKETS_ASIGNABLES)[number];

/**
 * `Ingreso` — el bucket que el BACKEND computa por regla (`abono > 0 &&
 * cargo === 0`, `CategorizarTransaccionUseCase`), NO uno asignable: no puede
 * elegirse en el catálogo y por eso queda deliberadamente fuera de
 * `BUCKETS_ASIGNABLES`. El web solo LEE este veredicto (nunca reimplementa
 * la regla, ADR-024) para no ofrecer ediciones que `CommitIngestaUseCase`
 * Rule 2 descarta en silencio. Espejado contra `Bucket.Ingreso` del backend
 * por `catalogo-constantes.mirror.spec.ts`.
 */
export const BUCKET_INGRESO = 'Ingreso';

/** Los tres tipos de coincidencia de un patrón de clasificación. */
export const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type MatchType = (typeof MATCH_TYPES)[number];

/**
 * `ICONOS_CATEGORIA` — la allowlist curada de 24 nombres lucide kebab-case
 * para el ícono de una categoría (categoria-iconografia, ADR-045, CATICO-01).
 * Fuente única de verdad: `apps/api/src/domain/value-objects/
 * icono-categoria.ts`'s `ICONOS_CATEGORIA` — este array es un MIRROR
 * verbatim, espejado contra esa fuente por
 * `catalogo-constantes.mirror.spec.ts` (CATICO-07). El orden es el orden del
 * picker (PR4), así que un reordenamiento cuenta como drift.
 *
 * A diferencia de `BUCKETS_ASIGNABLES`/`MATCH_TYPES`, este array no lleva un
 * type guard `esIconoCategoria` propio: el cliente nunca valida membresía
 * (design.md "Guards" — el servidor es la única autoridad, ADR-024), solo
 * necesita el union type para tipar el mapa `Record<IconoCategoria,
 * LucideIcon>` de `lib/iconos-categoria.ts` con totalidad en compilación.
 */
export const ICONOS_CATEGORIA = [
  'shopping-cart',
  'fuel',
  'pill',
  'heart-pulse',
  'bus',
  'house',
  'zap',
  'wifi',
  'smartphone',
  'graduation-cap',
  'shield',
  'car',
  'paw-print',
  'tv',
  'bike',
  'utensils',
  'shirt',
  'plane',
  'gamepad-2',
  'gift',
  'dumbbell',
  'piggy-bank',
  'trending-up',
  'credit-card',
] as const;

/** Nombre lucide kebab-case perteneciente a la allowlist curada del ícono de categoría. */
export type IconoCategoria = (typeof ICONOS_CATEGORIA)[number];
