import { BUCKETS_ASIGNABLES } from './catalogo-constantes';
import { BUCKET_INGRESO } from './preview-cartola';
import type { PreviewFilaDto } from '@moneydiary/api-client';

/**
 * agruparPreviewPorCategoria (cartola-decision-agrupada, MOB-PRV-03) —
 * groups the preview `filas` for the READ-ONLY accordion summary shown at
 * the `decidiendo` decision step. Pure, presentation-only (ADR-024): no
 * reclassification, no amount math. Ported from
 * `apps/web/src/domain/agrupar-preview-por-categoria.ts` (ADR-008: no
 * cross-app sharing — this is a parallel port, same shape as
 * `agrupar-categorias-por-bucket.ts`/`formatear-monto.ts`), with ONE
 * adaptation: `decidiendo` never has the full grouped-by-bucket catalog
 * loaded (`app/subir.tsx`'s `cargarCatalogo` only runs once "Revisar y
 * editar" is tapped — "+catalog fetch once" in that file's docblock), so
 * `CatalogoNombresEstado` below is the simpler shape mobile already builds
 * for `ListaRevision` (a flat id→nombre map), not `EstadoCatalogo`'s full
 * `listo.grupos`.
 *
 * Five group shapes (discriminated by `tipo`) — see the web module's
 * docblock for the full per-shape rationale, identical here:
 * - `categoria`: classified, non-duplicate, `categoriaId` resolvable →
 *   keyed by `(bucket, categoriaId)`.
 * - `ingreso`: the backend's immutable Ingreso verdict (`sugerido.bucket
 *   === BUCKET_INGRESO`, `categoriaId` always null). No "Sin categoría"
 *   suffix — these rows need no categoría (mirrors `FilaRevisionMobile`'s
 *   own "Ingreso" marker instead of a categoría name).
 * - `categoria-no-disponible`: `categoriaId` present but NOT resolvable —
 *   either the catalog is still loading/inactive/failed, or a stale id
 *   missing from a loaded catalog. Kept separate from `sin-clasificar` so
 *   "catalog not available yet" never reads as "no categoría assigned".
 * - `sin-clasificar`: `sugerido === null`, OR `sugerido` present with a null
 *   `categoriaId` on a bucket OTHER than Ingreso (unreachable through
 *   today's classifier — YAGNI, no speculative group shape for it). Single
 *   group.
 * - `duplicadas`: `esDuplicado`, checked first. Single group, always last.
 *
 * Order: `BUCKETS_ASIGNABLES` (Necesidades, Deseos, Ahorro), then `ingreso`,
 * then `sin-clasificar`, then `duplicadas`. Within a bucket: `categoria`
 * subgroups sorted by nombre (`localeCompare('es')`), then
 * `categoria-no-disponible` sorted by id. Rows keep file order.
 */

/**
 * The catalog lookup this module needs — never the fuller
 * `EstadoCatalogo`/`GrupoCategoriaPorBucket` shape `app/subir.tsx` uses for
 * `HojaClasificacion`. `no-listo` covers `inactivo`/`cargando`/`error`
 * alike: none of the three can resolve a categoría nombre, and this module
 * has no use for telling them apart.
 */
export type CatalogoNombresEstado =
  | { readonly tag: 'listo'; readonly nombrePorId: ReadonlyMap<string, string> }
  | { readonly tag: 'no-listo' };

export type GrupoPreviewPorCategoria =
  | {
      readonly tipo: 'categoria';
      readonly clave: string;
      readonly bucket: string;
      readonly categoriaId: string;
      readonly categoriaNombre: string;
      readonly filas: readonly PreviewFilaDto[];
    }
  | {
      readonly tipo: 'categoria-no-disponible';
      readonly clave: string;
      readonly bucket: string;
      readonly categoriaId: string;
      readonly filas: readonly PreviewFilaDto[];
    }
  | {
      readonly tipo: 'ingreso';
      readonly clave: string;
      readonly bucket: string;
      readonly filas: readonly PreviewFilaDto[];
    }
  | {
      readonly tipo: 'sin-clasificar';
      readonly clave: string;
      readonly filas: readonly PreviewFilaDto[];
    }
  | {
      readonly tipo: 'duplicadas';
      readonly clave: string;
      readonly filas: readonly PreviewFilaDto[];
    };

function resolverNombreCategoria(
  catalogo: CatalogoNombresEstado,
  categoriaId: string,
): string | null {
  if (catalogo.tag !== 'listo') return null;
  return catalogo.nombrePorId.get(categoriaId) ?? null;
}

/** Canonical bucket order index: the three asignables, then Ingreso, then "everything else" last. */
function ordenBucket(bucket: string): number {
  const idx = (BUCKETS_ASIGNABLES as readonly string[]).indexOf(bucket);
  if (idx !== -1) return idx;
  if (bucket === BUCKET_INGRESO) return BUCKETS_ASIGNABLES.length;
  return BUCKETS_ASIGNABLES.length + 1;
}

export function agruparPreviewPorCategoria(
  filas: readonly PreviewFilaDto[],
  catalogo: CatalogoNombresEstado,
): readonly GrupoPreviewPorCategoria[] {
  const porClave = new Map<string, PreviewFilaDto[]>();
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
    if (fila.sugerido.bucket === BUCKET_INGRESO) {
      agregar('ingreso', fila);
      continue;
    }
    const { bucket, categoriaId } = fila.sugerido;
    if (categoriaId === null) {
      // Unreachable through today's classifier for a non-Ingreso bucket —
      // falls into "Sin clasificar" rather than a speculative shape of its
      // own (YAGNI, see the docblock's `sin-clasificar` entry).
      agregar('sin-clasificar', fila);
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
      // Safe: only reached for keys built as
      // `categoria::${bucket}::${categoriaId}` above, with a nombre already
      // resolved for that exact categoriaId.
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
    const ordenA =
      bucketA === null ? Number.MAX_SAFE_INTEGER : ordenBucket(bucketA);
    const ordenB =
      bucketB === null ? Number.MAX_SAFE_INTEGER : ordenBucket(bucketB);
    if (ordenA !== ordenB) return ordenA - ordenB;
    if (bucketA === null && bucketB === null) {
      return a.tipo === 'sin-clasificar' ? -1 : 1;
    }
    if (a.tipo === 'categoria' && b.tipo === 'categoria') {
      return a.categoriaNombre.localeCompare(b.categoriaNombre, 'es');
    }
    if (
      a.tipo === 'categoria-no-disponible' &&
      b.tipo === 'categoria-no-disponible'
    ) {
      return a.categoriaId.localeCompare(b.categoriaId, 'es');
    }
    return a.tipo === 'categoria' ? -1 : 1;
  });
}
