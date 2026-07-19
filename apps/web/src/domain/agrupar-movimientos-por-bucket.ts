import { formatearMontoCLP } from './formatear-monto'
import { ETIQUETA_BUCKET } from '../lib/bucket-colors'
import type { MovimientoMesItemDto, MovimientosMesDto } from '../api/types'

export interface MovimientoAgrupadoRowViewModel {
  readonly id: string
  readonly fechaLabel: string
  readonly descripcion: string
  readonly cargoLabel: string
  readonly abonoLabel: string
}

export interface GrupoMovimientosViewModel {
  readonly bucket: string
  readonly etiqueta: string
  readonly subtotalLabel: string
  readonly cantidad: number
  readonly filas: ReadonlyArray<MovimientoAgrupadoRowViewModel>
}

export interface MovimientosAgrupadosViewModel {
  readonly periodo: string
  readonly grupos: ReadonlyArray<GrupoMovimientosViewModel>
}

const BUCKET_INGRESO = 'Ingreso'

/**
 * Canonical cross-group order (design.md D2, product decision #4). Web
 * cannot import the backend's `Bucket` enum (ADR-008) — this is a local
 * mirror of the domain's fixed category order, plus `Ingreso` which the
 * movimientos endpoint also tags per-row.
 */
const ORDEN_GRUPOS = ['Ingreso', 'Necesidades', 'Deseos', 'Ahorro', 'SinCategoria'] as const

const BUCKET_SIN_CATEGORIA = 'SinCategoria'

const BUCKETS_CONOCIDOS: ReadonlySet<string> = new Set(ORDEN_GRUPOS)

/**
 * Fail-safe fold (money-never-vanishes): any `bucket` value outside the
 * known 5-value set is folded into `SinCategoria` rather than silently
 * dropped from the panel/subtotals. Mirrors the backend's own fold of
 * unrecognized/null `bucketId` → `SinCategoria` in
 * `prisma-movimientos-mes.repository.ts` — keeps web and API semantics
 * consistent (DRY of semantics), so this is never expected to trigger in
 * practice but degrades safely if it ever does.
 */
function aBucketConocido(bucket: string): string {
  return BUCKETS_CONOCIDOS.has(bucket) ? bucket : BUCKET_SIN_CATEGORIA
}

/**
 * `fecha` llega como ISO-8601 UTC completo — un slice de los primeros 10
 * caracteres da `YYYY-MM-DD` sin pasar por `Date`/timezone, mismo trato que
 * `detalle-bucket-view-model.ts#aFechaLabel` (no exportado allí — un
 * one-liner duplicado dos veces no justifica una extracción compartida
 * todavía; DRY/YAGNI "three strikes").
 */
function aFechaLabel(fechaIso: string): string {
  return fechaIso.slice(0, 10)
}

function aFilaViewModel(tx: MovimientoMesItemDto): MovimientoAgrupadoRowViewModel {
  return {
    id: tx.id,
    fechaLabel: aFechaLabel(tx.fecha),
    descripcion: tx.descripcion,
    cargoLabel: formatearMontoCLP(tx.cargo),
    abonoLabel: formatearMontoCLP(tx.abono),
  }
}

/**
 * Rows within a group sort date-descending (WG-03, most recent first). On a
 * same-date tie, `id` descending gives deterministic output — the inverse of
 * the incoming date-asc/id-asc order from the backend (design.md D2).
 */
function ordenarFilasDesc(rows: ReadonlyArray<MovimientoMesItemDto>): ReadonlyArray<MovimientoMesItemDto> {
  return [...rows].sort((a, b) => {
    const porFecha = b.fecha.localeCompare(a.fecha)
    if (porFecha !== 0) {
      return porFecha
    }
    return b.id.localeCompare(a.id)
  })
}

/**
 * Per-group subtotal in BigInt, never `float`/`Number` (WG-04). `Ingreso`
 * is measured by credits (Σ abono); every spending bucket is measured by
 * charges (Σ cargo) — mirrors `calcular-resumen-mes`'s `totalAbono`/
 * `totalCargo` semantics so this subtotal is consistent with the number the
 * pie shows for that bucket (design.md D2).
 */
function subtotal(bucket: string, rows: ReadonlyArray<MovimientoMesItemDto>): bigint {
  const campo: 'abono' | 'cargo' = bucket === BUCKET_INGRESO ? 'abono' : 'cargo'
  return rows.reduce((acc, row) => acc + BigInt(row[campo]), 0n)
}

/**
 * aMovimientosAgrupadosViewModel — pure transform (no React, no I/O) from
 * the flat `GET /api/movimientos` DTO to the grouped-by-category view model
 * `TransaccionesAgrupadas` renders (design.md D2). Groups by `bucket`,
 * emits ONLY non-empty groups (WG-01), in the fixed `ORDEN_GRUPOS` order
 * (WG-02) regardless of subtotal size, with each group's rows sorted
 * date-descending (WG-03) and an exact BigInt subtotal + count (WG-04).
 */
export function aMovimientosAgrupadosViewModel(dto: MovimientosMesDto): MovimientosAgrupadosViewModel {
  const porBucket = new Map<string, MovimientoMesItemDto[]>()
  for (const tx of dto.transacciones) {
    const bucket = aBucketConocido(tx.bucket)
    const filas = porBucket.get(bucket)
    if (filas) {
      filas.push(tx)
    } else {
      porBucket.set(bucket, [tx])
    }
  }

  const grupos: GrupoMovimientosViewModel[] = []
  for (const bucket of ORDEN_GRUPOS) {
    const filasDto = porBucket.get(bucket)
    if (!filasDto || filasDto.length === 0) {
      continue
    }
    grupos.push({
      bucket,
      etiqueta: ETIQUETA_BUCKET[bucket] ?? bucket,
      subtotalLabel: formatearMontoCLP(String(subtotal(bucket, filasDto))),
      cantidad: filasDto.length,
      filas: ordenarFilasDesc(filasDto).map(aFilaViewModel),
    })
  }

  return { periodo: dto.periodo, grupos }
}
