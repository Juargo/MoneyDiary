/**
 * catalogo-constantes.ts — wire vocabulary for the classification catalog
 * (US-044, design.md §1.5). Ported verbatim from
 * `apps/web/src/api/catalogo-constantes.ts:11-18`. Write payloads
 * (`src/api/categorias.ts`) use these closed literal unions; read guards
 * keep `bucket`/`matchType` as plain `string` — the server is the
 * authority on validity (ADR-024/ADR-036/ADR-037, design.md D-07), so a
 * category the client doesn't recognise must still list, not be rejected
 * as a parse failure.
 *
 * `BUCKETS_ASIGNABLES` is ALSO the group order for `agruparPorBucket`
 * (PR5a) — no separate `ORDEN_BUCKETS`, one array serves both purposes
 * (`dry`).
 *
 * `ICONOS_CATEGORIA` (categoria-iconografia, ADR-045) is the curated
 * allowlist of category icons, mirrored verbatim from `apps/api/src/domain/
 * value-objects/icono-categoria.ts` and pinned against drift by
 * `catalogo-constantes.mirror.spec.ts` (CATICO-07).
 */

/** The three buckets a category can be assigned to (also the list's group order). */
export const BUCKETS_ASIGNABLES = ['Necesidades', 'Deseos', 'Ahorro'] as const;

export type BucketAsignable = (typeof BUCKETS_ASIGNABLES)[number];

/** The three match types a classification pattern can use. */
export const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type MatchType = (typeof MATCH_TYPES)[number];

/**
 * `ICONOS_CATEGORIA` — the curated allowlist of 25 lucide kebab-case names
 * for a category icon (categoria-iconografia, ADR-045, CATICO-01). Order is
 * the picker order (PR6), so a reorder counts as drift. Unlike
 * `BUCKETS_ASIGNABLES`/`MATCH_TYPES`, this array has no `esIconoCategoria`
 * type guard here — the client never validates membership (design.md
 * "Guards"; the server is the sole authority, ADR-024). It exists to type
 * the totality-checked render map in `components/iconos-categoria.ts`.
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
  'circle-help',
] as const;

/** Lucide kebab-case name belonging to the curated category icon allowlist. */
export type IconoCategoria = (typeof ICONOS_CATEGORIA)[number];
