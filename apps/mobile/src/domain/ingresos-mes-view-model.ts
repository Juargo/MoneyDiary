/**
 * ingresos-mes-view-model (US-056, D-22).
 * Ported from apps/web/src/domain/ingresos-mes-view-model.ts:50-60.
 *
 * Reads `dto.total` (the real IngresosMesResponse field). The field
 * `totalIngreso` does NOT exist in IngresosMesResponse (types.gen.ts:1962-1976).
 *
 * Mobile substitution: uses `periodoActualUTC(new Date())` where web uses
 * `periodoActual()` (web's periodo.ts helper) — documented as the mobile
 * equivalent (D-22).
 *
 * Pure: no React Native, no fetch.
 */

import { aFechaCorta } from './fecha-corta';
import { formatearMontoConSigno } from './formatear-monto';
import { mesCompletoLabel, periodoActualUTC } from './periodo-anual';
import type {
  IngresosMesDto,
  TransaccionIngresosMesDto,
} from './detalle.types';

export interface IngresosMesFilaViewModel {
  readonly id: string;
  /** `aFechaCorta(fecha)` — YYYY-MM-DD via string surgery (TZ-safe). */
  readonly fechaLabel: string;
  readonly descripcion: string;
  /** Origen verbatim — bank name or 'Manual' (MID-02, CA-02). No normalization. */
  readonly origen: string;
  /** `formatearMontoConSigno(monto, '+')` — positive sign (MID-05). */
  readonly montoLabel: string;
}

export interface IngresosMesViewModel {
  /** `mesCompletoLabel(periodo ?? periodoActualUTC(new Date()))` */
  readonly mesLabel: string;
  /** `conteo === 1 ? '1 ingreso' : \`${conteo} ingresos\`` (0 → plural, WDI-04). */
  readonly conteoLabel: string;
  /** `formatearMontoConSigno(total, '+')` — '$0' without sign for zero (WDI-04). */
  readonly totalLabel: string;
  /** Verbatim server order — never re-sorted (MID-01, WDI-06). */
  readonly filas: readonly IngresosMesFilaViewModel[];
}

function aFilaViewModel(
  tx: TransaccionIngresosMesDto,
): IngresosMesFilaViewModel {
  return {
    id: tx.id,
    fechaLabel: aFechaCorta(tx.fecha),
    descripcion: tx.descripcion,
    origen: tx.origen,
    montoLabel: formatearMontoConSigno(tx.monto, '+'),
  };
}

/**
 * Maps the HTTP DTO (`IngresosMesDto`, GET /api/ingresos/mes) to the M2
 * view model. Pure: no React, no fetch (D-22, MDET-07).
 *
 * `mesLabel` derives from the `periodo` param because the wire does not echo
 * the periodo (MID-01); when `periodo` is undefined → current calendar month
 * via `periodoActualUTC(new Date())` (mobile equivalent of web's
 * `periodoActual()`).
 */
export function aIngresosMesViewModel(
  dto: IngresosMesDto,
  periodo?: string,
): IngresosMesViewModel {
  return {
    mesLabel: mesCompletoLabel(periodo ?? periodoActualUTC(new Date())),
    conteoLabel: dto.conteo === 1 ? '1 ingreso' : `${dto.conteo} ingresos`,
    totalLabel: formatearMontoConSigno(dto.total, '+'),
    filas: dto.transacciones.map(aFilaViewModel),
  };
}
