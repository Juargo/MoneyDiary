import type { PreviewFilaDto } from '@moneydiary/api-client';
import type { EdicionFila } from '../api/commit-ingesta';
import { formatearMontoCLP } from './formatear-monto';

/**
 * preview-cartola — pure view-model + classification helpers for the mobile
 * review flow (design.md D-04/D-05). No RN import, no ports: mirrors the
 * SOLID skill's note that mobile domain logic is pure functions, same shape
 * as the web sibling (`resolverCategoriaMerged`/`clasificacion-preview.ts`).
 */

/**
 * The bucket the backend uses to mark an income row (`sugerido.bucket`).
 * ADR-024: read-only — the client never re-derives this from `abono`/`cargo`,
 * it only compares against the value the backend already computed. Exported
 * (cartola-decision-agrupada) so `agrupar-preview-por-categoria.ts` reads the
 * exact same constant instead of a second `'Ingreso'` literal (`dry`).
 */
export const BUCKET_INGRESO = 'Ingreso';

export interface FilaPreviewFormateada {
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
}

/**
 * formatearFilaPreview — formats a single preview row for display: `cargo`/
 * `abono` via the existing `formatearMontoCLP` (BigInt-safe, never
 * `parseFloat`/`Number`) and `fecha` sliced down to its date-only ISO
 * portion (`YYYY-MM-DD`, mirroring the web `PreviewMuestra.tsx` convention).
 */
export function formatearFilaPreview(
  fila: Pick<PreviewFilaDto, 'fecha' | 'descripcion' | 'cargo' | 'abono'>,
): FilaPreviewFormateada {
  return {
    fecha: fila.fecha.slice(0, 10),
    descripcion: fila.descripcion,
    cargo: formatearMontoCLP(fila.cargo),
    abono: formatearMontoCLP(fila.abono),
  };
}

/**
 * esFilaEditable (MOB-PRV-06) — a row may be tapped to open the
 * classification sheet only when it is neither a duplicate nor income. This
 * mirrors `CommitIngestaUseCase` Rule 2 (backend), which always persists an
 * Ingreso row as `{ Ingreso, null }` and silently discards any overlay entry
 * targeting it — offering an edit control for it would promise a change the
 * server never applies (design.md D-05).
 */
export function esFilaEditable(
  fila: Pick<PreviewFilaDto, 'esDuplicado' | 'sugerido'>,
): boolean {
  return !fila.esDuplicado && fila.sugerido?.bucket !== BUCKET_INGRESO;
}

/**
 * categoriaEfectiva (design.md D-04) — the merge rule: a pending edit (from
 * the classification sheet, MOB-PRV-07) wins over the backend's `sugerido`.
 * `edits` presence (not its value) means "the user assigned a categoría to
 * this row" — a missing entry falls back to `sugerido?.categoriaId`. Mirrors
 * the web `resolverCategoriaMerged`, adapted to mobile's non-nullable
 * `ReadonlyMap<rowIndex, categoriaId>` (there is no "unassign" affordance in
 * the mobile sheet).
 */
export function categoriaEfectiva(
  fila: Pick<PreviewFilaDto, 'rowIndex' | 'sugerido'>,
  edits: ReadonlyMap<number, string>,
): string | null {
  return edits.has(fila.rowIndex)
    ? (edits.get(fila.rowIndex) ?? null)
    : (fila.sugerido?.categoriaId ?? null);
}

/**
 * aOverlayEdits (MOB-PRV-08) — assembles the `commitIngesta` overlay from
 * the accumulated pending edits: only rows with a pending edit that are
 * still editable (`esFilaEditable`) are included. Duplicate and Ingreso rows
 * are excluded even defensively — the sheet never opens for them in the
 * first place (MOB-PRV-06/07), but the overlay assembly must not include
 * them regardless of how a pending edit could have ended up in the map.
 */
export function aOverlayEdits(
  filas: readonly Pick<
    PreviewFilaDto,
    'rowIndex' | 'esDuplicado' | 'sugerido'
  >[],
  edits: ReadonlyMap<number, string>,
): readonly EdicionFila[] {
  return filas
    .filter((fila) => edits.has(fila.rowIndex) && esFilaEditable(fila))
    .map((fila) => ({
      rowIndex: fila.rowIndex,
      categoriaId: edits.get(fila.rowIndex) as string,
    }));
}
