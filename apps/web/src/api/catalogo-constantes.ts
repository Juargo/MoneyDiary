/**
 * catalogo-constantes.ts — vocabulario de "wire" del catálogo de
 * clasificación (US-043, design.md §1/Q4a). `BUCKETS_ASIGNABLES` es también
 * el orden de agrupación de la lista (`agruparPorBucket`, PR #2) — no existe
 * un `ORDEN_BUCKETS` separado: dos nombres para el mismo array sería drift
 * (`dry`). Ambos arrays están espejados contra el backend por
 * `catalogo-constantes.mirror.spec.ts` (misma carpeta).
 */

/** Los tres buckets a los que una categoría puede asignarse (orden de grupo en CA-01). */
export const BUCKETS_ASIGNABLES = ['Necesidades', 'Deseos', 'Ahorro'] as const;

export type BucketAsignable = (typeof BUCKETS_ASIGNABLES)[number];

/** Los tres tipos de coincidencia de un patrón de clasificación. */
export const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type MatchType = (typeof MATCH_TYPES)[number];
