/**
 * detalle-bucket-mes-view-model (US-056, D-22).
 * Ported from apps/web/src/domain/detalle-bucket-mes-view-model.ts:9-112.
 *
 * Principles (ADR-024/D-22):
 * - `bucket` carries the raw wire key — `ETIQUETA_BUCKET` display-label
 *   resolution is the COMPONENT layer's job (not this VM). MDET-07.
 * - `grupos` passes verbatim — no re-sort, no re-group (WDM-03).
 * - Money: uses mobile's `formatearMontoCLP` (BigInt-exact, never parseFloat).
 * - `porcentajeLabel`/`metaLabel`: uses `aPorcentajeLabel` from porcentaje.ts
 *   (`SIN_PORCENTAJE_LABEL` ('—') for null, never "0%" for the null path — MOB-06).
 *   Web parity: `metaLabel` is always the result of `aPorcentajeLabel(dto.metaBp)`,
 *   yielding '—' when `metaBp` is null. The 'Sin meta' display text is a
 *   screen-layer concern resolved from the `sinMeta` flag (design D-22, MDET-02).
 * - `fecha` travels verbatim (component layer calls `aFechaCorta` for display,
 *   mirroring web GrupoMovimientos.tsx:71 + fecha.ts:29-32).
 *
 * Pure: no React Native, no fetch.
 */

import { formatearMontoCLP } from './formatear-monto';
import { aPorcentajeLabel } from './porcentaje';
import type {
  DetalleBucketMesDto,
  GrupoDetalleBucketMesDto,
  TransaccionDetalleBucketMesDto,
} from './detalle.types';

export interface TransaccionDetalleMesViewModel {
  readonly id: string;
  /** ISO-8601 UTC verbatim — the component calls aFechaCorta for display (D-22). */
  readonly fecha: string;
  readonly descripcion: string;
  readonly montoLabel: string;
}

export interface GrupoDetalleMesViewModel {
  readonly categoriaId: string | null;
  readonly nombre: string;
  /** `formatearMontoCLP(subtotal)` — BigInt-exact. */
  readonly subtotalLabel: string;
  readonly conteo: number;
  readonly transacciones: readonly TransaccionDetalleMesViewModel[];
}

export interface DetalleBucketMesViewModel {
  readonly periodo: string;
  /** Raw wire bucket key — display label resolution via ETIQUETA_BUCKET is the component's job (MDET-07). */
  readonly bucket: string;
  readonly totalLabel: string;
  readonly totalTransacciones: number;
  readonly totalCategorias: number;
  /** `aPorcentajeLabel(porcentajeBp)` — '—' for null (SIN_PORCENTAJE_LABEL, MOB-06). */
  readonly porcentajeLabel: string;
  /** `aPorcentajeLabel(metaBp)` — '—' (SIN_PORCENTAJE_LABEL) when metaBp is null (web parity). 'Sin meta' display text is the screen's job (sinMeta flag, D-22 MDET-02). */
  readonly metaLabel: string;
  /** `metaBp === null` → tag/meta zone not rendered. */
  readonly sinMeta: boolean;
  /** `porcentajeBp === null` → usage bar not rendered. */
  readonly sinPorcentaje: boolean;
  /** Position of % marker in 0..100 — `clamp(bp/100, 0, 100)` (presentation, WDM-08). */
  readonly marcaPorcentajePct: number;
  /** Position of meta marker in 0..100 — `null` when `metaBp` is `null`. */
  readonly marcaMetaPct: number | null;
  /** Verbatim server order — no re-sort (WDM-03). */
  readonly grupos: readonly GrupoDetalleMesViewModel[];
}

/** `bp` is basis points ≤ 10000 → bp/100 fits in a safe JS number; clamp is defensive. */
function clampBp(bp: number): number {
  return Math.min(Math.max(bp / 100, 0), 100);
}

function aTransaccionViewModel(
  tx: TransaccionDetalleBucketMesDto,
): TransaccionDetalleMesViewModel {
  return {
    id: tx.id,
    fecha: tx.fecha,
    descripcion: tx.descripcion,
    montoLabel: formatearMontoCLP(tx.monto),
  };
}

function aGrupoViewModel(
  grupo: GrupoDetalleBucketMesDto,
): GrupoDetalleMesViewModel {
  return {
    categoriaId: grupo.categoriaId,
    nombre: grupo.nombre,
    subtotalLabel: formatearMontoCLP(grupo.subtotal),
    conteo: grupo.conteo,
    transacciones: grupo.transacciones.map(aTransaccionViewModel),
  };
}

/**
 * Maps the HTTP DTO (`DetalleBucketMesDto`, GET /api/buckets/:bucket/detalle)
 * to the M1 view model. Pure: no React, no fetch (D-22, MDET-07).
 */
export function aDetalleBucketMesViewModel(
  dto: DetalleBucketMesDto,
): DetalleBucketMesViewModel {
  return {
    periodo: dto.periodo,
    bucket: dto.bucket,
    totalLabel: formatearMontoCLP(dto.total),
    totalTransacciones: dto.totalTransacciones,
    totalCategorias: dto.totalCategorias,
    porcentajeLabel: aPorcentajeLabel(dto.porcentajeBp),
    metaLabel: aPorcentajeLabel(dto.metaBp),
    sinMeta: dto.metaBp === null,
    sinPorcentaje: dto.porcentajeBp === null,
    marcaPorcentajePct: clampBp(dto.porcentajeBp ?? 0),
    marcaMetaPct: dto.metaBp === null ? null : clampBp(dto.metaBp),
    grupos: dto.grupos.map(aGrupoViewModel),
  };
}
