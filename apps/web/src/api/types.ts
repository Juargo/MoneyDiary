/**
 * Mirror escrito a mano del DTO HTTP del backend (ADR-011/012: un
 * `@moneydiary/api-client` formal queda diferido — ver design.md D2 y
 * tasks.md "Tracked debt"). Fuente de verdad en el backend:
 * `apps/api/src/infrastructure/http/dto/resumen-mes.dto.ts`.
 *
 * Web NO importa de `apps/api/src/domain` (ADR-008) — este archivo es un
 * espejo de datos plano, no una re-exportación del dominio del backend.
 *
 * Los montos se mantienen como strings decimales (serializados desde
 * BigInt) — nunca se parsean a number aquí. `porcentajeBp` es un number
 * seguro en JS (basis points, ≤ 10000, muy por debajo de 2^53).
 */

export interface BucketResumenDto {
  readonly bucket: string
  readonly total: string
  readonly porcentajeBp: number | null
  readonly estadoSemaforo: string | null
}

export interface ResumenMesDto {
  readonly periodo: string
  readonly totalIngreso: string
  readonly sinIngreso: boolean
  readonly buckets: ReadonlyArray<BucketResumenDto>
  readonly targets: {
    readonly Necesidades: number
    readonly Deseos: number
    readonly Ahorro: number
  }
  readonly estadoGlobal: string | null
}
