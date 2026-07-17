import { formatearMontoCLP } from './formatear-monto'
import type { BucketResumenDto, ResumenMesDto } from '../api/types'

/**
 * Etiqueta explícita para "sin porcentaje": un `porcentajeBp: null` (camino
 * sinIngreso) NUNCA debe renderizarse como "0%" — se distingue con este
 * valor centinela para que el componente lo distinga de un 0 real (spec
 * W1-02, MOB-06 en mobile).
 */
export const SIN_PORCENTAJE_LABEL = '—'

export interface BucketViewModel {
  readonly bucket: string
  readonly total: string
  readonly porcentajeLabel: string
  readonly estadoSemaforo: string | null
}

/**
 * Lean por diseño (design.md, decisión de scope): sin `periodoLabel`, sin
 * `distribucionGasto` — el pie/distribución de gasto queda diferido (no hay
 * gráfico de torta en W1/W2). Se agregan campos derivados solo cuando un
 * componente concreto los necesite (YAGNI).
 */
export interface ResumenViewModel {
  readonly periodo: string
  readonly totalIngreso: string
  readonly sinIngreso: boolean
  readonly buckets: ReadonlyArray<BucketViewModel>
  readonly targets: ResumenMesDto['targets']
  readonly estadoGlobal: string | null
}

/**
 * Convierte `porcentajeBp` (basis points, entero seguro como number) a una
 * etiqueta de porcentaje. `null` (camino sinIngreso) mapea a
 * SIN_PORCENTAJE_LABEL, nunca a "0%" — un `0` verdadero sí mapea a "0%".
 * bp/100 es seguro como number: bp ≤ 10000, muy por debajo de 2^53.
 */
function aPorcentajeLabel(porcentajeBp: number | null): string {
  if (porcentajeBp === null) {
    return SIN_PORCENTAJE_LABEL
  }
  return `${porcentajeBp / 100}%`
}

function aBucketViewModel(bucket: BucketResumenDto): BucketViewModel {
  return {
    bucket: bucket.bucket,
    total: formatearMontoCLP(bucket.total),
    porcentajeLabel: aPorcentajeLabel(bucket.porcentajeBp),
    estadoSemaforo: bucket.estadoSemaforo,
  }
}

/**
 * Mapea el DTO HTTP (`ResumenMesDto`) al view model de la pantalla. Pura:
 * sin React, sin fetch. Resuelve todo el formateo de dinero (BigInt-string-
 * safe vía formatearMontoCLP) y la regla null-vs-0% para que el componente
 * solo tenga que renderizar strings ya resueltas. `estadoSemaforo`/
 * `estadoGlobal` pasan verbatim — nunca se recomputan en el cliente (spec
 * W2-01).
 */
export function aResumenViewModel(dto: ResumenMesDto): ResumenViewModel {
  return {
    periodo: dto.periodo,
    totalIngreso: formatearMontoCLP(dto.totalIngreso),
    sinIngreso: dto.sinIngreso,
    buckets: dto.buckets.map(aBucketViewModel),
    targets: dto.targets,
    estadoGlobal: dto.estadoGlobal,
  }
}
