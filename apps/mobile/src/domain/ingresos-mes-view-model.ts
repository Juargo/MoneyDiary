/**
 * ingresos-mes-view-model stub (RED phase, US-056 T-04).
 * Will be replaced by the real implementation in T-07.
 */
import type { IngresosMesDto } from './detalle.types';

export interface IngresosMesFilaViewModel {
  readonly id: string;
  readonly fechaLabel: string;
  readonly descripcion: string;
  readonly origen: string;
  readonly montoLabel: string;
}

export interface IngresosMesViewModel {
  readonly mesLabel: string;
  readonly conteoLabel: string;
  readonly totalLabel: string;
  readonly filas: readonly IngresosMesFilaViewModel[];
}

export function aIngresosMesViewModel(
  _dto: IngresosMesDto,
  _periodo?: string,
): IngresosMesViewModel {
  throw new Error('Not implemented');
}
