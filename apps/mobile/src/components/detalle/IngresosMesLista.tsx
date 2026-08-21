/**
 * IngresosMesLista — RED stub (US-056, T-16).
 * Every export throws so all spec cases fail RED.
 * Replaced by real implementation in T-17 (GREEN).
 */

import type { IngresosMesFilaViewModel } from '../../domain/ingresos-mes-view-model';

export function IngresosMesLista(_props: {
  filas: readonly IngresosMesFilaViewModel[];
}): never {
  throw new Error('IngresosMesLista: RED stub — not implemented yet (T-17)');
}
