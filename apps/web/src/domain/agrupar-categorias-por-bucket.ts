import { BUCKETS_ASIGNABLES } from '../api/catalogo-constantes';
import type { CategoriaDto } from '../api/types';

/**
 * agruparPorBucket (US-043, design.md §1/Q4c, WCTG-02) — agrupa el catálogo
 * del caller por bucket, en el orden fijo de `BUCKETS_ASIGNABLES`
 * (`Necesidades`, `Deseos`, `Ahorro`; ese array ES el orden de grupo — no
 * existe un `ORDEN_BUCKETS` separado, dos nombres para el mismo array sería
 * drift, `dry`). Pura: sin React, sin fetch.
 *
 * Grupos vacíos se descartan (un usuario sin nada en `Ahorro` no ve ese
 * heading). Un `otros` fallback agrupa cualquier categoría cuyo `bucket` no
 * esté en `BUCKETS_ASIGNABLES` — inalcanzable hoy a través de la API
 * deployada (`CAT038-01` solo asigna los tres buckets), pero existe para que
 * un bucket inesperado LISTE en vez de desaparecer (una categoría que el
 * usuario no puede ver es peor que una en un grupo con nombre raro). Un
 * único `filter`, cero especulación sobre CUÁLES otros buckets podrían
 * aparecer (`yagni`).
 *
 * Vive en `domain/` (no en `components/configuracion/categorias/`) porque
 * `ReclasificarCategoriaControl` (PR #6, §7) la reutiliza y ese componente
 * está fuera de `components/configuracion/` — un import cruzado de
 * directorio de feature falsearía a quién pertenece esta función.
 */
export interface GrupoCategoriaPorBucket {
  readonly bucket: string;
  readonly categorias: ReadonlyArray<CategoriaDto>;
}

const BUCKET_OTROS = 'Otros';

export function agruparPorBucket(
  categorias: ReadonlyArray<CategoriaDto>,
): ReadonlyArray<GrupoCategoriaPorBucket> {
  const conocidos = BUCKETS_ASIGNABLES.map((bucket) => ({
    bucket,
    categorias: categorias.filter((c) => c.bucket === bucket),
  })).filter((grupo) => grupo.categorias.length > 0);

  const otros = categorias.filter(
    (c) => !(BUCKETS_ASIGNABLES as ReadonlyArray<string>).includes(c.bucket),
  );

  return otros.length === 0
    ? conocidos
    : [...conocidos, { bucket: BUCKET_OTROS, categorias: otros }];
}
