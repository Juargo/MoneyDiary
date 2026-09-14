import { BUCKETS_ASIGNABLES, BUCKET_INGRESO } from '@/api/catalogo-constantes';
import { esFilaIngreso } from './clasificacion-preview';
import type { CatalogoEstado, PreviewFilaDto } from '@/api/types';

/**
 * agruparPreviewPorCategoria (cartola-decision-agrupada) — groups the
 * preview `filas` for the READ-ONLY accordion summary shown at the
 * `decidiendo` decision step (WEB-PRV-19). Pure, presentation-only
 * (ADR-024): no reclassification, no amount math, just reading the verdict
 * the backend already computed (`fila.sugerido`) plus the catalog already
 * loaded elsewhere (`CatalogoEstado`, `SubirCartola` D-07).
 *
 * Five group shapes (discriminated by `tipo`):
 * - `categoria`: classified, non-duplicate, `categoriaId` resolvable in the
 *   catalog → keyed by `(bucket, categoriaId)`.
 * - `ingreso`: the backend's immutable Ingreso verdict
 *   (`esFilaIngreso`/`clasificacion-preview.ts` — `sugerido.bucket ===
 *   'Ingreso'`, `categoriaId` always null, `CommitIngestaUseCase` Rule 2).
 *   Its own group with NO "Sin categoría" suffix: these rows need no
 *   categoría at all (same reasoning as `FilaRevision`'s "no necesita
 *   categoría" copy) — folding them into a generic "sin categoría" bucket
 *   would read as unclassified work when it is actually settled.
 * - `categoria-no-disponible`: `categoriaId` present but NOT resolvable
 *   (catalog `cargando`/`error`, or a stale id no longer in a `listo`
 *   catalog — e.g. the categoría was deleted after the row was classified).
 *   Kept as its own group keyed by `(bucket, categoriaId)` rather than
 *   folded into `ingreso`/a generic "sin categoría" bucket, so a temporary
 *   catalog outage never silently misreports real categorías as absent.
 * - `sin-categoria`: `categoriaId === null` for a bucket OTHER than Ingreso
 *   — unreachable through today's classifier (only the Ingreso rule yields a
 *   null categoriaId), but kept as its own shape rather than folded into
 *   `categoria-no-disponible` so a future bucket that can be "classified
 *   without a categoría" the way Ingreso is would list correctly instead of
 *   silently reading as a catalog outage.
 * - `sin-clasificar`: `sugerido === null`. Single group.
 * - `duplicadas`: `esDuplicado`, checked FIRST (wins over every other rule)
 *   — these rows are never committed, so their `sugerido` is irrelevant
 *   here. Single group, always last.
 *
 * Order: `BUCKETS_ASIGNABLES` order (Necesidades, Deseos, Ahorro — the same
 * canonical order `agruparPorBucket` uses), then `ingreso`, then
 * `sin-clasificar`, then `duplicadas`. Within a bucket: `categoria`
 * subgroups sorted by nombre (`localeCompare('es')`), then
 * `categoria-no-disponible` subgroups sorted by id. Rows keep file order
 * within every group (no re-sort of `filas`).
 */

export type GrupoPreviewPorCategoria =
  | {
      readonly tipo: 'categoria';
      readonly clave: string;
      readonly bucket: string;
      readonly categoriaId: string;
      readonly categoriaNombre: string;
      readonly filas: ReadonlyArray<PreviewFilaDto>;
    }
  | {
      readonly tipo: 'categoria-no-disponible';
      readonly clave: string;
      readonly bucket: string;
      readonly categoriaId: string;
      readonly filas: ReadonlyArray<PreviewFilaDto>;
    }
  | {
      readonly tipo: 'ingreso';
      readonly clave: string;
      readonly bucket: string;
      readonly filas: ReadonlyArray<PreviewFilaDto>;
    }
  | {
      readonly tipo: 'sin-categoria';
      readonly clave: string;
      readonly bucket: string;
      readonly filas: ReadonlyArray<PreviewFilaDto>;
    }
  | {
      readonly tipo: 'sin-clasificar';
      readonly clave: string;
      readonly filas: ReadonlyArray<PreviewFilaDto>;
    }
  | {
      readonly tipo: 'duplicadas';
      readonly clave: string;
      readonly filas: ReadonlyArray<PreviewFilaDto>;
    };

/** Resolves a categoría's nombre from a `listo` catalog; `null` when absent or the catalog isn't ready. */
function resolverNombreCategoria(
  catalogo: CatalogoEstado,
  categoriaId: string,
): string | null {
  if (catalogo.tag !== 'listo') return null;
  for (const grupo of catalogo.grupos) {
    const categoria = grupo.categorias.find((c) => c.id === categoriaId);
    if (categoria) return categoria.nombre;
  }
  return null;
}

/** Canonical bucket order index: the three asignables, then Ingreso, then "everything else" last. */
function ordenBucket(bucket: string): number {
  const idx = (BUCKETS_ASIGNABLES as readonly string[]).indexOf(bucket);
  if (idx !== -1) return idx;
  if (bucket === BUCKET_INGRESO) return BUCKETS_ASIGNABLES.length;
  return BUCKETS_ASIGNABLES.length + 1;
}

export function agruparPreviewPorCategoria(
  filas: ReadonlyArray<PreviewFilaDto>,
  catalogo: CatalogoEstado,
): ReadonlyArray<GrupoPreviewPorCategoria> {
  const porClave = new Map<string, PreviewFilaDto[]>();
  // Insertion order of first-seen keys drives the pre-sort grouping below;
  // `Map` preserves it, so no separate ordering array is needed.
  function agregar(clave: string, fila: PreviewFilaDto) {
    const filasExistentes = porClave.get(clave);
    if (filasExistentes) {
      filasExistentes.push(fila);
    } else {
      porClave.set(clave, [fila]);
    }
  }

  for (const fila of filas) {
    if (fila.esDuplicado) {
      agregar('duplicadas', fila);
      continue;
    }
    if (fila.sugerido === null) {
      agregar('sin-clasificar', fila);
      continue;
    }
    if (esFilaIngreso(fila)) {
      agregar('ingreso', fila);
      continue;
    }
    const { bucket, categoriaId } = fila.sugerido;
    if (categoriaId === null) {
      // Reachable only by a future bucket whose rows can be classified
      // without a categoría the way Ingreso is (see `sin-categoria` in the
      // docblock above) — never silently dropped.
      agregar(`sin-categoria::${bucket}`, fila);
      continue;
    }
    const nombre = resolverNombreCategoria(catalogo, categoriaId);
    if (nombre === null) {
      agregar(`categoria-no-disponible::${bucket}::${categoriaId}`, fila);
    } else {
      agregar(`categoria::${bucket}::${categoriaId}`, fila);
    }
  }

  const grupos: GrupoPreviewPorCategoria[] = [];
  for (const [clave, filasGrupo] of porClave) {
    if (clave === 'duplicadas') {
      grupos.push({ tipo: 'duplicadas', clave, filas: filasGrupo });
    } else if (clave === 'sin-clasificar') {
      grupos.push({ tipo: 'sin-clasificar', clave, filas: filasGrupo });
    } else if (clave === 'ingreso') {
      grupos.push({
        tipo: 'ingreso',
        clave,
        bucket: BUCKET_INGRESO,
        filas: filasGrupo,
      });
    } else if (clave.startsWith('sin-categoria::')) {
      const [, bucket] = clave.split('::');
      grupos.push({
        tipo: 'sin-categoria',
        clave,
        bucket: bucket ?? '',
        filas: filasGrupo,
      });
    } else if (clave.startsWith('categoria-no-disponible::')) {
      const [, bucket, categoriaId] = clave.split('::');
      grupos.push({
        tipo: 'categoria-no-disponible',
        clave,
        bucket: bucket ?? '',
        categoriaId: categoriaId ?? '',
        filas: filasGrupo,
      });
    } else {
      const [, bucket, categoriaId] = clave.split('::');
      // Safe: this branch is only reached for keys built as
      // `categoria::${bucket}::${categoriaId}` right above, with a nombre
      // already resolved for that exact categoriaId.
      const categoriaNombre = resolverNombreCategoria(
        catalogo,
        categoriaId ?? '',
      )!;
      grupos.push({
        tipo: 'categoria',
        clave,
        bucket: bucket ?? '',
        categoriaId: categoriaId ?? '',
        categoriaNombre,
        filas: filasGrupo,
      });
    }
  }

  return grupos.sort((a, b) => {
    const bucketA = 'bucket' in a ? a.bucket : null;
    const bucketB = 'bucket' in b ? b.bucket : null;
    // "Sin clasificar"/"Duplicadas" have no bucket — they always sort after
    // every bucket-based group (ordenBucket's own +1 fallback only covers
    // unknown buckets, not the bucket-less special groups).
    const ordenA =
      bucketA === null ? Number.MAX_SAFE_INTEGER : ordenBucket(bucketA);
    const ordenB =
      bucketB === null ? Number.MAX_SAFE_INTEGER : ordenBucket(bucketB);
    if (ordenA !== ordenB) return ordenA - ordenB;
    if (bucketA === null && bucketB === null) {
      // Both special groups within the bucket-less tier: Sin clasificar
      // before Duplicadas (rule 6).
      return a.tipo === 'sin-clasificar' ? -1 : 1;
    }
    // Same bucket, different subgroup types: named categorías (sorted by
    // nombre) first, then `sin-categoria`, then `categoria-no-disponible`
    // (sorted by categoriaId) — `ingreso` never shares a bucket-order slot
    // with another tipo.
    if (a.tipo === 'categoria' && b.tipo === 'categoria') {
      return a.categoriaNombre.localeCompare(b.categoriaNombre, 'es');
    }
    if (
      a.tipo === 'categoria-no-disponible' &&
      b.tipo === 'categoria-no-disponible'
    ) {
      return a.categoriaId.localeCompare(b.categoriaId, 'es');
    }
    const rangoSubtipo: Record<string, number> = {
      categoria: 0,
      'sin-categoria': 1,
      'categoria-no-disponible': 2,
    };
    return (rangoSubtipo[a.tipo] ?? 3) - (rangoSubtipo[b.tipo] ?? 3);
  });
}
