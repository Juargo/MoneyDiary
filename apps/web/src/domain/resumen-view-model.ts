import { formatearMontoCLP, esMontoStringValido } from './formatear-monto'
import { calcularDistribucionGasto, type TajadaGasto } from './distribucion-gasto'
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
 * Lean por diseño (design.md, decisión de scope): sin `periodoLabel` — no hay
 * header en esta pantalla (US-030 Slice B agrega `distribucionGasto`, antes
 * diferido; los demás campos derivados se agregan solo cuando un componente
 * concreto los necesite, YAGNI).
 *
 * `distribucionGasto` es puro dominio (`bucket`/`porcentaje`/`fraccion`) — el
 * color hex y la etiqueta UI ("Gustos" para "Deseos") se resuelven en la capa
 * de presentación (`DistribucionPie`/`LeyendaGasto` vía `lib/bucket-colors`),
 * igual que en mobile (`theme/colors.ts`). El dominio nunca importa `lib/`.
 */
export interface ResumenViewModel {
  readonly periodo: string
  readonly totalIngreso: string
  readonly sinIngreso: boolean
  readonly buckets: ReadonlyArray<BucketViewModel>
  /** Share-of-spending split for the pie + legend (77/12/11-style). */
  readonly distribucionGasto: ReadonlyArray<TajadaGasto>
  /**
   * The bucket with the largest total among all 4 buckets (including
   * SinCategoria) — the dashboard's default selection for the transactions
   * panel before the user picks one explicitly (US-030 Slice B, task 30.10).
   * `null` only if `buckets` is empty (FIX 4) — the backend contract
   * guarantees the 4 canonical buckets today, but this stays defensive.
   */
  readonly bucketPorDefecto: string | null
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
 * Belt-and-suspenders money guard (FIX 6): money is validated at the fetch
 * boundary (`client.ts`/`esMontoStringValido`), so this should never see a
 * malformed string in practice — but there is no ErrorBoundary in the app,
 * so an unvalidated bad string reaching a bare `BigInt(...)` here would
 * throw a raw `SyntaxError` mid-render (the exact past "money guard crash"
 * class). Degrades an invalid/empty total to `0n` instead of throwing.
 */
function montoSeguro(montoStr: string): bigint {
  return esMontoStringValido(montoStr) ? BigInt(montoStr) : 0n
}

/**
 * The bucket with the largest raw money total, BigInt-compared (never
 * `Number`/`parseFloat` on a money string — same discipline as
 * `calcularDistribucionGasto`). The backend contract guarantees `buckets` is
 * always the 4 canonical buckets, but `Array.reduce` with no seed throws on
 * an empty array (FIX 4) — this returns `null` instead. On a tie (equal max
 * totals), the FIRST bucket in DTO order wins (strict `>` never replaces the
 * running max on equality).
 */
export function bucketConMayorTotal(buckets: ReadonlyArray<BucketResumenDto>): string | null {
  if (buckets.length === 0) {
    return null
  }
  return buckets.reduce((mayor, actual) =>
    montoSeguro(actual.total) > montoSeguro(mayor.total) ? actual : mayor,
  ).bucket
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
    distribucionGasto: calcularDistribucionGasto(dto.buckets),
    bucketPorDefecto: bucketConMayorTotal(dto.buckets),
    targets: dto.targets,
    estadoGlobal: dto.estadoGlobal,
  }
}
