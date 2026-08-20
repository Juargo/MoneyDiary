/**
 * Porcentaje helpers (US-056, D-14).
 * Promoted from apps/mobile/src/domain/resumen-view-model.ts into a standalone
 * module, mirroring apps/web/src/domain/porcentaje.ts.
 *
 * `SIN_PORCENTAJE_LABEL` was already exported from resumen-view-model.ts (MOB-06);
 * it is now the canonical source here and re-exported from resumen-view-model.ts
 * for zero call-site churn. `aPorcentajeLabel` was private in resumen-view-model.ts
 * and is now exported so the detalle-mes view-models can use it (D-14 DRY extract).
 */

/** Sentinel label for a null basis-point percentage (sinIngreso path, MOB-06). */
export const SIN_PORCENTAJE_LABEL = '—';

/**
 * Maps `porcentajeBp` (basis points, safe JS number) to a percentage label.
 * `null` maps to `SIN_PORCENTAJE_LABEL` — NEVER to "0%" (MOB-06 discipline).
 * A real 0 basis-point value maps to "0%".
 */
export function aPorcentajeLabel(porcentajeBp: number | null): string {
  if (porcentajeBp === null) {
    return SIN_PORCENTAJE_LABEL;
  }
  return `${porcentajeBp / 100}%`;
}
