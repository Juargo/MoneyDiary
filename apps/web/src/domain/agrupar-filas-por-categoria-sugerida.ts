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
 * decisions never asked for that finer split. `clave` is the FINAL tiebreak
 * (T2 review S1 fix) — several groups can legitimately share the same
 * `categoriaNombre` (two unresolvable categoriaIds both falling back to
 * "Categoría no disponible", or the whole catalog in `cargando`/`error`),
 * and without a further tiebreak that left the sort's stability exposing
 * Map insertion order — i.e. file order — as an accidental, non-contractual
 * ordering.
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

/**
 * Resolves one fila's grouping key AND its original `bucket`/`categoriaId`
 * in a single pass (T2 review S2 fix). Previously the `bucket`/`categoriaId`
 * used to build a `categoria::...` group were re-derived by splitting
 * `clave` on `'::'` — that truncated any bucket or categoriaId that itself
 * contained `'::'` (`clave.split('::')` has no way to tell a literal `'::'`
 * inside an id apart from the separator). Carrying them alongside the clave
 * from the one place that already knows them avoids that ambiguity entirely.
 */
function resolverGrupoDeFila(fila: PreviewFilaDto): {
  readonly clave: string;
  readonly bucket: string | null;
  readonly categoriaId: string | null;
} {
  if (fila.sugerido === null) {
    return { clave: CLAVE_SIN_CATEGORIA, bucket: null, categoriaId: null };
  }
  const { bucket, categoriaId } = fila.sugerido;
  if (bucket === BUCKET_INGRESO) {
    return { clave: CLAVE_INGRESO, bucket: BUCKET_INGRESO, categoriaId: null };
  }
  if (categoriaId === null) {
    return { clave: CLAVE_SIN_CATEGORIA, bucket: null, categoriaId: null };
  }
  return {
    clave: `categoria::${bucket}::${categoriaId}`,
    bucket,
    categoriaId,
  };
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
  const porClave = new Map<
    string,
    {
      readonly bucket: string | null;
      readonly categoriaId: string | null;
      readonly filas: PreviewFilaDto[];
    }
  >();
  for (const fila of filas) {
    const { clave, bucket, categoriaId } = resolverGrupoDeFila(fila);
    const entrada = porClave.get(clave);
    if (entrada) {
      entrada.filas.push(fila);
    } else {
      porClave.set(clave, { bucket, categoriaId, filas: [fila] });
    }
  }

  const grupos: GrupoFilaPorCategoria[] = [];
  for (const [clave, { bucket, categoriaId, filas: filasGrupo }] of porClave) {
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
    const ordenNombre = a.categoriaNombre.localeCompare(
      b.categoriaNombre,
      'es',
    );
    // S1 fix: `categoriaNombre` alone leaves ties (several unresolvable
    // categoriaIds sharing the "Categoría no disponible" fallback, or a
    // catalog in `cargando`/`error`) to fall back to Map insertion order —
    // i.e. file order, which is not a deterministic contract. `clave` is
    // always unique per group, so it is a safe final tiebreak. Compared
    // ordinally, not with `localeCompare`: ICU collation can report two
    // distinct keys as equal (ignorable code points such as a soft hyphen),
    // which would leak file order back in.
    if (ordenNombre !== 0) return ordenNombre;
    if (a.clave === b.clave) return 0;
    return a.clave < b.clave ? -1 : 1;
  });
}
