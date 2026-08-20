import { aFechaCorta } from './fecha';
import { formatearMontoConSigno } from './formatear-monto';
import { mesCompletoLabel } from './periodo-anual';
import { periodoActual } from './periodo';
import type { IngresosMesDto, TransaccionIngresosMesDto } from '../api/types';

export interface IngresosMesFilaViewModel {
  readonly id: string;
  /** `aFechaCorta(fecha)` — YYYY-MM-DD vía cirugía de string pura (D-02). */
  readonly fechaLabel: string;
  readonly descripcion: string;
  /** Origen verbatim — nombre de banco o `'Manual'` (MID-02, CA-02). */
  readonly origen: string;
  /** `formatearMontoConSigno(monto, '+')` — signo positivo (MID-05). */
  readonly montoLabel: string;
}

export interface IngresosMesViewModel {
  /** `mesCompletoLabel(periodo ?? periodoActual())` — el wire no trae echo de periodo (MID-01, WDI-01). */
  readonly mesLabel: string;
  /** `conteo === 1 ? '1 ingreso' : \`${conteo} ingresos\`` (D-03; `0` → plural, WDI-04). */
  readonly conteoLabel: string;
  /** `formatearMontoConSigno(total, '+')` — `$0` sin signo para cero (WDI-04). */
  readonly totalLabel: string;
  /** Filas en el orden del wire verbatim — nunca re-ordenadas (MID-01, WDI-06). */
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
 * Mapea el DTO HTTP (`IngresosMesDto`, GET /api/ingresos/mes) al view-model
 * de la página `/ingresos` (US-054). Puro: sin React, sin fetch. Principios
 * (WDI-06, ADR-024): las ÚNICAS derivaciones son labels/formato de display —
 * sin re-orden, sin recálculo de totales, sin lógica de clasificación. El
 * orden de filas pasa verbatim (MID-01 autoritativo). `mesLabel` deriva del
 * `periodo` del caller porque el wire no tiene echo de `periodo` (MID-01);
 * sin `periodo` → mes calendario actual (MID-04, D-01).
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
