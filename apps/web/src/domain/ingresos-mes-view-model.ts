import { aFechaCorta } from './fecha';
import { formatearMontoConSigno } from './formatear-monto';
import { mesCompletoLabel } from './periodo-anual';
import { periodoActual } from './periodo';
import type { IngresosMesDto, TransaccionIngresosMesDto } from '../api/types';

export interface IngresosMesFilaViewModel {
  readonly id: string;
  /** `aFechaCorta(fecha)` — YYYY-MM-DD via pure string surgery (D-02). */
  readonly fechaLabel: string;
  readonly descripcion: string;
  /** Origen verbatim — bank name or `'Manual'` (MID-02, CA-02). */
  readonly origen: string;
  /** `formatearMontoConSigno(monto, '+')` — positive sign (MID-05). */
  readonly montoLabel: string;
}

export interface IngresosMesViewModel {
  /** `mesCompletoLabel(periodo ?? periodoActual())` — the wire carries no periodo echo (MID-01, WDI-01). */
  readonly mesLabel: string;
  /** `conteo === 1 ? '1 ingreso' : \`${conteo} ingresos\`` (D-03; `0` → plural, WDI-04). */
  readonly conteoLabel: string;
  /** `formatearMontoConSigno(total, '+')` — `$0` carries no sign prefix for zero (WDI-04). */
  readonly totalLabel: string;
  /** Rows in the wire's order verbatim — never re-sorted (MID-01, WDI-06). */
  readonly filas: ReadonlyArray<IngresosMesFilaViewModel>;
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
 * Maps the HTTP DTO (`IngresosMesDto`, GET /api/ingresos/mes) to the
 * `/ingresos` page view-model (US-054). Pure: no React, no fetch. Principles
 * (WDI-06, ADR-024): the ONLY derivations are display labels/formatting —
 * no re-sort, no totals recomputation, no classification logic. The row
 * order passes through verbatim (MID-01 authoritative). `mesLabel` derives
 * from the caller's `periodo` because the wire has no `periodo` echo
 * (MID-01); absent `periodo` → current calendar month (MID-04, D-01).
 */
export function aIngresosMesViewModel(
  dto: IngresosMesDto,
  periodo?: string,
): IngresosMesViewModel {
  return {
    mesLabel: mesCompletoLabel(periodo ?? periodoActual()),
    conteoLabel: dto.conteo === 1 ? '1 ingreso' : `${dto.conteo} ingresos`,
    totalLabel: formatearMontoConSigno(dto.total, '+'),
    filas: dto.transacciones.map(aFilaViewModel),
  };
}
