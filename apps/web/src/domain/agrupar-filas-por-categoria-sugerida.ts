import { BUCKETS_ASIGNABLES, BUCKET_INGRESO } from '@/api/catalogo-constantes';
import type { CatalogoEstado, PreviewFilaDto } from '@/api/types';

/**
 * agruparFilasPorCategoriaSugerida (preview-agrupacion-categoria T2) —
 * groups the EDITABLE review table (`PreviewMuestra`) rows by bucket ·
 * categoría, for the per-group accordion the table renders. Pure,
 * presentation-only (ADR-024): no reclassification, no amount math.
 *
 * Grouping key = the SERVER SUGGESTION (`fila.sugerido`) ONLY, never the
 * merged edit (`resolverCategoriaMerged`) — a row the user reclassifies via
 * its own select stays in its ORIGINAL group until the preview is reloaded/
 * re-run (product decision, 2026-09-25). That is why this function takes no
 * `edits` parameter at all: there is nothing here for an edit to change.
 *
 * Distinct from the READ-ONLY decision-step summary
 * (`agrupar-preview-por-categoria.ts`, `agruparPreviewPorCategoria`,
 * WEB-PRV-19, out of scope for this change): that one groups the SAME kind
 * of data for a different screen (post-decision, five group shapes incl. a
 * dedicated "Duplicadas" bucket). Here, a duplicate row groups by its
 * `sugerido` like any other row — the editable table already renders
 * duplicates inline, greyed with a badge (WEB-PRV-04), so pulling them into
 * a separate group would split one visual "Movimientos" list into two. The
 * bucket-order helper below is intentionally a small standalone copy of
 * that sibling module's `ordenBucket` rather than a shared extraction: the
 * decision-step summary is explicitly out of scope for this change and its
 * own five-shape grouping doesn't map 1:1 onto this simpler one.
 *
 * Three group shapes, keyed by `clave`:
 * - `categoria::${bucket}::${categoriaId}` — a resolvable OR unresolvable
 *   categoriaId (catalog `cargando`/`error`, or a stale/deleted id) both
 *   group by `(bucket, categoriaId)`; only `categoriaNombre`/`icono`
 *   resolution differs (unresolvable → "Categoría no disponible", no
 *   ícono). Unlike the decision-step summary, this is NOT split into two
 *   group shapes — the editable table has no need for that distinction.
 * - `ingreso` — the backend's immutable Ingreso verdict (`sugerido.bucket
 *   === 'Ingreso'`, `categoriaId` always null). Single group, no
 *   categoriaId, `categoriaNombre: 'Ingreso'`.
 * - `sin-categoria` — `sugerido === null`, OR (unreachable today)
 *   `sugerido` present with a null `categoriaId` on a non-Ingreso bucket.
 *   Single group, always LAST regardless of file order (product decision).
 *
 * Order: `BUCKETS_ASIGNABLES` order (Necesidades, Deseos, Ahorro), then
 * Ingreso, then "Sin categoría" last. Within the same bucket tier, groups
 * sort by `categoriaNombre` (`localeCompare('es')`) — this covers both
 * resolved names and the "Categoría no disponible" fallback uniformly, a
 * deliberate simplification versus the decision-step summary's two-tier
 * sort (named categorías before "no disponible" ones): T2's product
 * decisions never asked for that finer split.
 *
 * Rows inside every group: `fecha` ascending (ISO-8601 strings compare
 * lexicographically in chronological order), `rowIndex` as a stable
 * tiebreak.
 */

export interface GrupoFilaPorCategoria {
  readonly clave: string;
  /** `null` only for the `sin-categoria` group — every other group has a real bucket. */
  readonly bucket: string | null;
  readonly categoriaId: string | null;
  readonly categoriaNombre: string;
  /** `CategoriaDto.icono` resolved from the catalog, or `null` (badge falls back to `Tag`). */
  readonly icono: string | null;
  readonly filas: ReadonlyArray<PreviewFilaDto>;
}

const CLAVE_INGRESO = 'ingreso';
const CLAVE_SIN_CATEGORIA = 'sin-categoria';
const NOMBRE_CATEGORIA_NO_DISPONIBLE = 'Categoría no disponible';

/** Resolves a categoría's `{ nombre, icono }` from a `listo` catalog; `null` when absent or the catalog isn't ready. */
function resolverCategoria(
  catalogo: CatalogoEstado,
  categoriaId: string,
): { readonly nombre: string; readonly icono: string | null } | null {
  if (catalogo.tag !== 'listo') return null;
  for (const grupo of catalogo.grupos) {
    const categoria = grupo.categorias.find((c) => c.id === categoriaId);
    if (categoria)
      return { nombre: categoria.nombre, icono: categoria.icono ?? null };
  }
  return null;
}

function claveDe(fila: PreviewFilaDto): string {
  if (fila.sugerido === null) return CLAVE_SIN_CATEGORIA;
  const { bucket, categoriaId } = fila.sugerido;
  if (bucket === BUCKET_INGRESO) return CLAVE_INGRESO;
  if (categoriaId === null) return CLAVE_SIN_CATEGORIA;
  return `categoria::${bucket}::${categoriaId}`;
}

/** Canonical bucket order index: the three asignables, then Ingreso, then "everything else". */
function ordenBucket(bucket: string): number {
  const idx = (BUCKETS_ASIGNABLES as readonly string[]).indexOf(bucket);
  if (idx !== -1) return idx;
  if (bucket === BUCKET_INGRESO) return BUCKETS_ASIGNABLES.length;
  return BUCKETS_ASIGNABLES.length + 1;
}

function compararFilas(a: PreviewFilaDto, b: PreviewFilaDto): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  return a.rowIndex - b.rowIndex;
}

export function agruparFilasPorCategoriaSugerida(
  filas: ReadonlyArray<PreviewFilaDto>,
  catalogo: CatalogoEstado,
): ReadonlyArray<GrupoFilaPorCategoria> {
  const porClave = new Map<string, PreviewFilaDto[]>();
  for (const fila of filas) {
    const clave = claveDe(fila);
    const filasExistentes = porClave.get(clave);
    if (filasExistentes) {
      filasExistentes.push(fila);
    } else {
      porClave.set(clave, [fila]);
    }
  }

  const grupos: GrupoFilaPorCategoria[] = [];
  for (const [clave, filasGrupo] of porClave) {
    const filasOrdenadas = [...filasGrupo].sort(compararFilas);

    if (clave === CLAVE_SIN_CATEGORIA) {
      grupos.push({
        clave,
        bucket: null,
        categoriaId: null,
        categoriaNombre: 'Sin categoría',
        icono: null,
        filas: filasOrdenadas,
      });
      continue;
    }

    if (clave === CLAVE_INGRESO) {
      grupos.push({
        clave,
        bucket: BUCKET_INGRESO,
        categoriaId: null,
        categoriaNombre: 'Ingreso',
        icono: null,
        filas: filasOrdenadas,
      });
      continue;
    }

    const [, bucket, categoriaId] = clave.split('::');
    const categoria = resolverCategoria(catalogo, categoriaId ?? '');
    grupos.push({
      clave,
      bucket: bucket ?? '',
      categoriaId: categoriaId ?? '',
      categoriaNombre: categoria?.nombre ?? NOMBRE_CATEGORIA_NO_DISPONIBLE,
      icono: categoria?.icono ?? null,
      filas: filasOrdenadas,
    });
  }

  return grupos.sort((a, b) => {
    const ordenA =
      a.bucket === null ? Number.MAX_SAFE_INTEGER : ordenBucket(a.bucket);
    const ordenB =
      b.bucket === null ? Number.MAX_SAFE_INTEGER : ordenBucket(b.bucket);
    if (ordenA !== ordenB) return ordenA - ordenB;
    return a.categoriaNombre.localeCompare(b.categoriaNombre, 'es');
  });
}
