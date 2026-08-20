/**
 * detalle-bucket-mes-view-model stub (RED phase, US-056 T-04).
 * Will be replaced by the real implementation in T-07.
 */
import type { DetalleBucketMesDto } from './detalle.types';

export interface TransaccionDetalleMesViewModel {
  readonly id: string;
  readonly fecha: string;
  readonly descripcion: string;
  readonly montoLabel: string;
}

export interface GrupoDetalleMesViewModel {
  readonly categoriaId: string | null;
  readonly nombre: string;
  readonly subtotalLabel: string;
  readonly conteo: number;
  readonly transacciones: readonly TransaccionDetalleMesViewModel[];
}

export interface DetalleBucketMesViewModel {
  readonly periodo: string;
  readonly bucket: string;
  readonly totalLabel: string;
  readonly totalTransacciones: number;
  readonly totalCategorias: number;
  readonly porcentajeLabel: string;
  readonly metaLabel: string;
  readonly sinMeta: boolean;
  readonly sinPorcentaje: boolean;
  readonly marcaPorcentajePct: number;
  readonly marcaMetaPct: number | null;
  readonly grupos: readonly GrupoDetalleMesViewModel[];
}

export function aDetalleBucketMesViewModel(
  _dto: DetalleBucketMesDto,
): DetalleBucketMesViewModel {
  throw new Error('Not implemented');
}
