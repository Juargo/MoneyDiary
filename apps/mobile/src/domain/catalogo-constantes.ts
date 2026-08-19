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
 */

/** The three buckets a category can be assigned to (also the list's group order). */
export const BUCKETS_ASIGNABLES = ['Necesidades', 'Deseos', 'Ahorro'] as const;

export type BucketAsignable = (typeof BUCKETS_ASIGNABLES)[number];

/** The three match types a classification pattern can use. */
export const MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const;

export type MatchType = (typeof MATCH_TYPES)[number];
