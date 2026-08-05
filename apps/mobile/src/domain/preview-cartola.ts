import type { PreviewTransaccionDto } from '../api/preview-ingesta';
import { formatearMontoCLP } from './formatear-monto';

/**
 * preview-cartola — pure view-model for the mobile preview list (US-003
 * Slice 3, design.md §10.2). No RN import, no ports: mirrors the SOLID
 * skill's note that mobile domain logic is pure functions (formatting,
 * slicing), same shape as the web sibling `PreviewMuestra.tsx`.
 */

/** CA-01 selector options, same three values as the web preview panel. */
export const OPCIONES_CANTIDAD_PREVIEW = [10, 25, 50] as const;
export type CantidadPreview = (typeof OPCIONES_CANTIDAD_PREVIEW)[number];
export const CANTIDAD_PREVIEW_DEFECTO: CantidadPreview = 10;

/**
 * sliceMuestra — client-side row-count selector (PREV-06, CA-01): slices the
 * already-fetched `muestra` array, never issues a new request. Selecting a
 * `cantidad` larger than `muestra.length` returns every available row with
 * no padding (`Array.prototype.slice` handles this natively).
 */
export function sliceMuestra(
  muestra: readonly PreviewTransaccionDto[],
  cantidad: CantidadPreview,
): readonly PreviewTransaccionDto[] {
  return muestra.slice(0, cantidad);
}

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
  fila: PreviewTransaccionDto,
): FilaPreviewFormateada {
  return {
    fecha: fila.fecha.slice(0, 10),
    descripcion: fila.descripcion,
    cargo: formatearMontoCLP(fila.cargo),
    abono: formatearMontoCLP(fila.abono),
  };
}
