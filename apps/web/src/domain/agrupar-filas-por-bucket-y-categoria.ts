import { BUCKETS_ASIGNABLES, BUCKET_INGRESO } from '@/api/catalogo-constantes';
import type { CatalogoEstado, PreviewFilaDto } from '@/api/types';

/**
 * agruparFilasPorBucketYCategoria (preview-acordeon-bucket T1, extends
 * preview-agrupacion-categoria T2) — groups the EDITABLE review table
 * (`PreviewMuestra`) rows into a TWO-LEVEL structure — bucket, then
 * categoría within that bucket — for the nested accordion the table
 * renders. Pure, presentation-only (ADR-024): no reclassification, no
 * amount math.
 *
 * Grouping key = the SERVER SUGGESTION (`fila.sugerido`) ONLY, never the
 * merged edit (`resolverCategoriaMerged`) — a row the user reclassifies via
 * its own select stays in its ORIGINAL group until the preview is reloaded/
 * re-run (product decision, 2026-09-25, unchanged from T2). That is why this
 * function takes no `edits` parameter at all: there is nothing here for an
 * edit to change.
 *
 * Also reused, since `resumen-acordeon-bucket` (WEB-PRV-19), by the
 * READ-ONLY decision-step summary (`MuestraAgrupada`) for its NON-duplicate
 * rows — the old separate `agrupar-preview-por-categoria.ts` module (five
 * flat group shapes) is gone, and both screens now share this exact
 * bucket→categoría breakdown (DRY). The two screens still differ in ONE way:
 * `MuestraAgrupada` carves duplicate rows OUT before calling this function
 * and renders them as its own trailing "Duplicadas (no se importan)" entry
 * (status quo, WEB-PRV-19 — duplicates are never committed, so they don't
 * belong in a bucket/categoría breakdown of what WILL be imported). Here, in
 * the EDITABLE table, a duplicate row groups by its `sugerido` like any
 * other row instead — the table already renders duplicates inline, greyed
 * with a badge (WEB-PRV-04), so pulling them into a separate group would
 * split one visual "Movimientos" list into two. This function itself stays
 * unaware of `esDuplicado` either way; the caller decides what to do with
 * duplicate rows before or after calling it.
 *
 * Level 1 (bucket): one entry per PRESENT bucket among `BUCKETS_ASIGNABLES`
 * (Necesidades, Deseos, Ahorro) in that order, then `BUCKET_INGRESO` last.
 * A bucket with no rows is simply absent — never rendered empty.
 *
 * Level 2 (categoría, only for the three asignable buckets): one entry per
 * `categoriaId` within that bucket, sorted by `categoriaNombre`
 * (`localeCompare('es')`) with `clave` as the final ordinal tiebreak (T2
 * review S1 fix — several groups can legitimately share the fallback name
 * "Categoría no disponible", or the whole catalog can be in `cargando`/
 * `error`; `clave` is always unique per group, and comparing it ordinally
 * rather than with `localeCompare` avoids ICU treating two distinct keys as
 * equal, e.g. an ignorable soft hyphen, which would leak file order back
 * in). A `categoriaId` not resolvable in the catalog (catalog `cargando`/
 * `error`, or a stale/deleted id) still groups by `(bucket, categoriaId)`,
 * with the "Categoría no disponible" fallback name and no ícono.
 *
 * `BUCKET_INGRESO` never gets a level 2: the backend's immutable Ingreso
 * verdict (`sugerido.bucket === 'Ingreso'`, `categoriaId` always null) has
 * no categoría to drill into, so its rows sit directly on `filasDirectas`
 * and `categorias` is always `[]` for it.
 *
 * No "Sin categoría" group (issue #778, product decision 2026-09-25): the
 * backend has not returned `sugerido: null` since #778 tramo 5b — every
 * non-Ingreso row the user's catalog can categorize gets a real
 * `(bucket, categoriaId)`, defaulting to that bucket's `Desconocido`
 * category when no pattern matched (`preview-ingesta.use-case.ts:104-110`).
 * The wire type keeps `sugerido: {...} | null` for defensive contract
 * discipline, not because a live path still produces `null`. This function
 * still HANDLES both theoretically-reachable-only-by-type shapes without
 * crashing, but T2 (preview-acordeon-bucket review warnings 1-2) replaced
 * the T1 "drop it" behavior for two of them with a visible destination:
 * - `sugerido === null`, or `sugerido.bucket` outside the four recognized
 *   buckets (`BUCKETS_ASIGNABLES` + `BUCKET_INGRESO`) — the row goes to a
 *   TRAILING level-1 "Revisar" entry (`GrupoRevisar`), rendered after
 *   Ingreso, present ONLY when at least one such row exists. It has no level
 *   2 (like Ingreso): opening it shows its rows directly, so the user can
 *   still classify them via `FilaRevision`'s own selects. In the normal flow
 *   (the API always sends a known bucket) this entry never appears — T1's
 *   "dead per #778" analysis still holds for why it is rare, not for
 *   whether the row should vanish when it does happen.
 * - `sugerido` present but `categoriaId === null` on a non-Ingreso bucket
 *   (the bucket contract's own defaults make this unreachable today, same
 *   as before T2) — treated as an unresolvable categoría of that bucket,
 *   same fallback name/clave shape as a stale/deleted id, so it still
 *   surfaces under its real bucket instead of disappearing. Unchanged by T2.
 *
 * Rows inside every categoría, inside `filasDirectas` for Ingreso, and
 * inside `GrupoRevisar.filas`: `fecha` ascending (ISO-8601 strings compare
 * lexicographically in chronological order), `rowIndex` as a stable
 * tiebreak.
 */

export interface GrupoCategoriaEnBucket {
  readonly clave: string;
  readonly categoriaId: string | null;
  readonly categoriaNombre: string;
  /** `CategoriaDto.icono` resolved from the catalog, or `null` (badge falls back to `Tag`). */
  readonly icono: string | null;
  readonly filas: ReadonlyArray<PreviewFilaDto>;
}

export interface GrupoBucket {
  readonly kind: 'bucket';
  readonly bucket: string;
  /** One entry per categoría in this bucket, sorted; always `[]` for `BUCKET_INGRESO`. */
  readonly categorias: ReadonlyArray<GrupoCategoriaEnBucket>;
  /** Rows to render DIRECTLY, no categoría level — only ever non-empty for `BUCKET_INGRESO`. */
  readonly filasDirectas: ReadonlyArray<PreviewFilaDto>;
}

/**
 * Trailing level-1 entry (T2) for rows the accordion cannot place under a
 * real bucket — `sugerido: null`, or a `sugerido.bucket` outside the four
 * recognized buckets. A distinct `kind` (rather than a fake bucket string
 * like `'Revisar'` that could collide with real backend data) keeps this
 * shape impossible to confuse with a real `GrupoBucket`. No level 2, like
 * Ingreso — `filas` renders directly.
 */
export interface GrupoRevisar {
  readonly kind: 'revisar';
  readonly filas: ReadonlyArray<PreviewFilaDto>;
}

/** One level-1 accordion entry: a real bucket, or the trailing Revisar entry. */
export type GrupoNivel1 = GrupoBucket | GrupoRevisar;

const NOMBRE_CATEGORIA_NO_DISPONIBLE = 'Categoría no disponible';
/** Sentinel clave suffix for a non-Ingreso row whose `categoriaId` is `null` — see docblock. */
const SIN_CATEGORIA_ID = '__sin-categoria-id__';

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
 * Exported so callers that add their own trailing group (`MuestraAgrupada`'s
 * "Duplicadas" entry) can sort its rows the SAME way this module sorts every
 * other group's rows, instead of re-implementing the fecha/rowIndex
 * tiebreak rule.
 */
export function compararFilas(a: PreviewFilaDto, b: PreviewFilaDto): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  return a.rowIndex - b.rowIndex;
}

/** Groups the rows ALREADY known to belong to one non-Ingreso `bucket` into sorted categoría entries. */
function agruparPorCategoriaDentroDeBucket(
  bucket: string,
  filasDelBucket: ReadonlyArray<PreviewFilaDto>,
  catalogo: CatalogoEstado,
): ReadonlyArray<GrupoCategoriaEnBucket> {
  const porCategoriaId = new Map<string, PreviewFilaDto[]>();
  for (const fila of filasDelBucket) {
    const categoriaId = fila.sugerido?.categoriaId ?? null;
    const clave =
      categoriaId === null
        ? `categoria::${bucket}::${SIN_CATEGORIA_ID}`
        : `categoria::${bucket}::${categoriaId}`;
    const entrada = porCategoriaId.get(clave);
    if (entrada) {
      entrada.push(fila);
    } else {
      porCategoriaId.set(clave, [fila]);
    }
  }

  const categorias: GrupoCategoriaEnBucket[] = [];
  for (const [clave, filasCategoria] of porCategoriaId) {
    const categoriaId = filasCategoria[0]?.sugerido?.categoriaId ?? null;
    const categoria =
      categoriaId === null ? null : resolverCategoria(catalogo, categoriaId);
    categorias.push({
      clave,
      categoriaId,
      categoriaNombre: categoria?.nombre ?? NOMBRE_CATEGORIA_NO_DISPONIBLE,
      icono: categoria?.icono ?? null,
      filas: [...filasCategoria].sort(compararFilas),
    });
  }

  return categorias.sort((a, b) => {
    const ordenNombre = a.categoriaNombre.localeCompare(
      b.categoriaNombre,
      'es',
    );
    if (ordenNombre !== 0) return ordenNombre;
    // S1 fix (T2): `categoriaNombre` alone leaves ties (several unresolvable
    // categoriaIds sharing the "Categoría no disponible" fallback) to fall
    // back to Map insertion order — i.e. file order, not a deterministic
    // contract. `clave` is always unique per group, so it is a safe final
    // tiebreak, compared ORDINALLY (not `localeCompare`, which can report
    // two distinct keys as equal for an ignorable code point).
    if (a.clave === b.clave) return 0;
    return a.clave < b.clave ? -1 : 1;
  });
}

export function agruparFilasPorBucketYCategoria(
  filas: ReadonlyArray<PreviewFilaDto>,
  catalogo: CatalogoEstado,
): ReadonlyArray<GrupoNivel1> {
  const ordenBuckets: readonly string[] = [
    ...BUCKETS_ASIGNABLES,
    BUCKET_INGRESO,
  ];
  const bucketsConocidos = new Set<string>(ordenBuckets);

  const porBucket = new Map<string, PreviewFilaDto[]>();
  const filasParaRevisar: PreviewFilaDto[] = [];
  for (const fila of filas) {
    const sugerido = fila.sugerido;
    // T2: a row with no sugerido, or with a bucket the web doesn't
    // recognize, goes to the trailing "Revisar" entry — see docblock.
    if (sugerido === null || !bucketsConocidos.has(sugerido.bucket)) {
      filasParaRevisar.push(fila);
      continue;
    }
    const entrada = porBucket.get(sugerido.bucket);
    if (entrada) {
      entrada.push(fila);
    } else {
      porBucket.set(sugerido.bucket, [fila]);
    }
  }

  const grupos: GrupoNivel1[] = [];
  for (const bucket of ordenBuckets) {
    const filasBucket = porBucket.get(bucket);
    if (!filasBucket || filasBucket.length === 0) continue; // empty buckets absent

    if (bucket === BUCKET_INGRESO) {
      grupos.push({
        kind: 'bucket',
        bucket,
        categorias: [],
        filasDirectas: [...filasBucket].sort(compararFilas),
      });
      continue;
    }

    grupos.push({
      kind: 'bucket',
      bucket,
      categorias: agruparPorCategoriaDentroDeBucket(
        bucket,
        filasBucket,
        catalogo,
      ),
      filasDirectas: [],
    });
  }

  if (filasParaRevisar.length > 0) {
    grupos.push({
      kind: 'revisar',
      filas: [...filasParaRevisar].sort(compararFilas),
    });
  }

  return grupos;
}
