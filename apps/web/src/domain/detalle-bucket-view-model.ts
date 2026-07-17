import { formatearMontoCLP } from './formatear-monto'
import type { DetalleBucketDto, DetalleBucketTransaccionDto } from '../api/types'

export interface DetalleBucketRowViewModel {
  readonly id: string
  readonly fechaLabel: string
  readonly descripcion: string
  readonly cargoLabel: string
  readonly abonoLabel: string
}

export interface DetalleBucketViewModel {
  readonly periodo: string
  readonly bucket: string
  readonly filas: ReadonlyArray<DetalleBucketRowViewModel>
}

/**
 * `fecha` llega como ISO-8601 UTC completo (`toISOString()`, convención
 * bloqueada del backend). Un slice de los primeros 10 caracteres da
 * `YYYY-MM-DD` sin pasar por `Date`/timezone — el backend ya normaliza a
 * medianoche UTC, así que no hay ambigüedad que resolver aquí (KISS: nada de
 * aritmética de fechas "ingeniosa").
 */
function aFechaLabel(fechaIso: string): string {
  return fechaIso.slice(0, 10)
}

function aFilaViewModel(tx: DetalleBucketTransaccionDto): DetalleBucketRowViewModel {
  return {
    id: tx.id,
    fechaLabel: aFechaLabel(tx.fecha),
    descripcion: tx.descripcion,
    cargoLabel: formatearMontoCLP(tx.cargo),
    abonoLabel: formatearMontoCLP(tx.abono),
  }
}

/**
 * Mapea el DTO HTTP (`DetalleBucketDto`) al view model de la pantalla de
 * detalle. Pura: sin React, sin fetch. cargo/abono se formatean cada uno por
 * separado, verbatim (sin restar ni elegir "el monto neto") — evita inventar
 * una regla de signo que el backend no expone (spec W3-03: "exact CLP
 * amount").
 */
export function aDetalleBucketViewModel(dto: DetalleBucketDto): DetalleBucketViewModel {
  return {
    periodo: dto.periodo,
    bucket: dto.bucket,
    filas: dto.transacciones.map(aFilaViewModel),
  }
}
