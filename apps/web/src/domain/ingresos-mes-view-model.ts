import { aDiaConSemana, aFechaCorta, aFechaLargaLabel } from './fecha';
import { formatearMontoConSigno } from './formatear-monto';
import { mesAbreviadoConAnio, mesCompletoLabel } from './periodo-anual';
import { periodoActual } from './periodo';
import type { IngresosMesDto, TransaccionIngresosMesDto } from '../api/types';

export interface IngresosMesFilaViewModel {
  readonly id: string;
  /**
   * `aFechaCorta(fecha)` — YYYY-MM-DD vía cirugía de string pura (D-02).
   * Consumido por `EliminarMovimientoControl` para su `aria-label` y su
   * diálogo de confirmación (mantiene el formato corto, superficie
   * independiente del tratamiento visual de la columna Fecha —
   * `GrupoMovimientos` precedent). NO renombrar ni retirar.
   */
  readonly fechaLabel: string;
  /** `aDiaConSemana(fecha).dia` — 2 dígitos, cirugía de string pura (D-02 discipline, `GrupoMovimientos` precedent). */
  readonly diaLabel: string;
  /** `aDiaConSemana(fecha).diaSemana` — abreviatura de día de semana en minúsculas; el `uppercase` es CSS, no dominio. */
  readonly diaSemanaLabel: string;
  /** `aFechaLargaLabel(fecha)` — "3 de julio de 2026", para el `sr-only` de la celda de fecha. */
  readonly fechaLargaLabel: string;
  readonly descripcion: string;
  /** Origen verbatim — nombre de banco o `'Manual'` (MID-02, CA-02). */
  readonly origen: string;
  /** `formatearMontoConSigno(monto, '+')` — signo positivo (MID-05). */
  readonly montoLabel: string;
}

export interface IngresosMesViewModel {
  /** `mesCompletoLabel(periodo ?? periodoActual())` — el wire no trae echo de periodo (MID-01, WDI-01). */
  readonly mesLabel: string;
  /**
   * `mesAbreviadoConAnio(periodo ?? periodoActual())` — "AGO 2026", el
   * encabezado de columna de la tabla (`IngresosMesTable`'s `<th scope="col">`
   * de Fecha, bucket-detalle-lista-rediseño precedent): el mes/año se dice
   * una sola vez ahí, no en cada fila.
   */
  readonly periodoLabel: string;
  /** `conteo === 1 ? '1 ingreso' : \`${conteo} ingresos\`` (D-03; `0` → plural, WDI-04). */
  readonly conteoLabel: string;
  /** `dto.conteo` verbatim — celda numérica derecha de la franja de totales (no se parsea `conteoLabel`). */
  readonly conteo: number;
  /** `formatearMontoConSigno(total, '+')` — `$0` sin signo para cero (WDI-04). */
  readonly totalLabel: string;
  /** Filas en el orden del wire verbatim — nunca re-ordenadas (MID-01, WDI-06). */
  readonly filas: ReadonlyArray<IngresosMesFilaViewModel>;
}

function aFilaViewModel(
  tx: TransaccionIngresosMesDto,
): IngresosMesFilaViewModel {
  const { dia, diaSemana } = aDiaConSemana(tx.fecha);
  return {
    id: tx.id,
    fechaLabel: aFechaCorta(tx.fecha),
    diaLabel: dia,
    diaSemanaLabel: diaSemana,
    fechaLargaLabel: aFechaLargaLabel(tx.fecha),
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
 * orden de filas pasa verbatim (MID-01 autoritativo). `mesLabel`/`periodoLabel`
 * derivan del `periodo` del caller porque el wire no tiene echo de `periodo`
 * (MID-01); sin `periodo` → mes calendario actual (MID-04, D-01).
 */
export function aIngresosMesViewModel(
  dto: IngresosMesDto,
  periodo?: string,
): IngresosMesViewModel {
  const periodoResuelto = periodo ?? periodoActual();
  return {
    mesLabel: mesCompletoLabel(periodoResuelto),
    periodoLabel: mesAbreviadoConAnio(periodoResuelto),
    conteoLabel: dto.conteo === 1 ? '1 ingreso' : `${dto.conteo} ingresos`,
    conteo: dto.conteo,
    totalLabel: formatearMontoConSigno(dto.total, '+'),
    filas: dto.transacciones.map(aFilaViewModel),
  };
}
