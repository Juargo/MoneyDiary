import { BUCKET_INGRESO } from '@/api/catalogo-constantes';
import { resolverCategoriaMerged } from './resolver-categoria-merged';
import type { PreviewFilaDto } from '@/api/types';

/**
 * clasificacion-preview — the two questions the upload-preview UI asks about
 * a row's classification state, in ONE place. `resolverCategoriaMerged`
 * (sibling module) answers "which categoría wins right now"; these answer
 * "is this row income" and "is this row settled", which are NOT the same
 * question and used to be conflated.
 *
 * Income rows (`sugerido.bucket === 'Ingreso'`): the backend's classifier
 * gives them `{ bucket: Ingreso, categoriaId: null }` and
 * `CommitIngestaUseCase` Rule 2 treats that as IMMUTABLE — a row with
 * `abono > 0 && cargo === 0` always persists `{ Ingreso, null }` and ANY
 * overlay entry on it is silently ignored. The web used to let the user pick
 * a bucket and categoría for those rows anyway, so the UI promised an edit
 * the server was always going to discard, and the progress readout counted
 * a fully-classified income row as pending work forever.
 *
 * ADR-024: the income RULE is not reimplemented here. `abono`/`cargo` are
 * never compared — the only thing read is the bucket the server already
 * computed and sent. Reading a server verdict is presentation; recomputing
 * it would be the violation.
 */

/** True when the server classified this row as income (bucket `Ingreso`). */
export function esFilaIngreso(fila: Pick<PreviewFilaDto, 'sugerido'>): boolean {
  return fila.sugerido?.bucket === BUCKET_INGRESO;
}

/**
 * True when the row needs no further work from the user: either income
 * (settled by the server, not editable) or it has an effective categoría
 * under the D-05 merge rule. Backs the progress readout, the "Solo sin
 * clasificar" filter and `SubirCartola`'s discard-confirm count — one rule
 * for all three, so they cannot drift.
 */
export function estaClasificada(
  fila: Pick<PreviewFilaDto, 'rowIndex' | 'sugerido'>,
  edits: ReadonlyMap<number, string | null>,
): boolean {
  return esFilaIngreso(fila) || resolverCategoriaMerged(fila, edits) !== null;
}

/**
 * True when a row may take part in bulk apply / row selection. Duplicates are
 * never committed at all and income rows never accept an overlay, so offering
 * either for selection offers an edit that cannot land.
 */
export function esFilaSeleccionable(
  fila: Pick<PreviewFilaDto, 'esDuplicado' | 'sugerido'>,
): boolean {
  return !fila.esDuplicado && !esFilaIngreso(fila);
}
