/**
 * agrupar-categorias-por-bucket.ts (US-044 PR5a, T5a.2)
 *
 * Ported verbatim from
 * `apps/web/src/domain/agrupar-categorias-por-bucket.ts:32-47`.
 *
 * Groups the caller's catalog by bucket, in the fixed order of
 * `BUCKETS_ASIGNABLES` (`Necesidades`, `Deseos`, `Ahorro`). That array IS
 * the group order — no separate `ORDEN_BUCKETS` exists (`dry`: one array
 * serves both the write-payload union and the list's group order).
 *
 * Empty groups are dropped (a user with nothing in `Ahorro` does not see
 * that heading). An `Otros` fallback collects any category whose `bucket`
 * is not in `BUCKETS_ASIGNABLES` — unreachable today via the deployed API
 * (D-07), but exists so an unexpected bucket LISTS rather than disappears
 * (MCFG-MCTG-08 "server-unknown bucket still lists" scenario).
 *
 * Pure: no React, no fetch, no env.
 */

import { BUCKETS_ASIGNABLES } from './catalogo-constantes';
import type { CategoriaDto } from './catalogo.types';

export interface GrupoCategoriaPorBucket {
  readonly bucket: string;
  readonly categorias: readonly CategoriaDto[];
}

const BUCKET_OTROS = 'Otros';

export function agruparPorBucket(
  categorias: readonly CategoriaDto[],
): readonly GrupoCategoriaPorBucket[] {
  const conocidos = BUCKETS_ASIGNABLES.map((bucket) => ({
    bucket,
    categorias: categorias.filter((c) => c.bucket === bucket),
  })).filter((grupo) => grupo.categorias.length > 0);

  const otros = categorias.filter(
    (c) => !(BUCKETS_ASIGNABLES as readonly string[]).includes(c.bucket),
  );

  return otros.length === 0
    ? conocidos
    : [...conocidos, { bucket: BUCKET_OTROS, categorias: otros }];
}
