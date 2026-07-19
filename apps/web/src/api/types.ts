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

/**
 * Mirror escrito a mano del DTO HTTP anual (US-030 Slice C). Fuente de
 * verdad en el backend: `apps/api/src/infrastructure/http/dto/resumen-anual.dto.ts`.
 *
 * `meses` siempre trae exactamente 12 entradas, Ene→Dic (garantía del
 * backend) — cada una reutiliza `ResumenMesDto` (DRY, mismo shape que
 * `/api/resumen`). Los meses sin datos/futuros llegan con `sinIngreso: true`
 * y montos en cero, nunca omitidos.
 */
export interface ResumenAnualDto {
  readonly anio: number
  readonly meses: ReadonlyArray<ResumenMesDto>
}

/**
 * Mirror escrito a mano del DTO HTTP del detalle de bucket (US-017). Fuente
 * de verdad en el backend: `apps/api/src/infrastructure/http/dto/detalle-bucket.dto.ts`.
 *
 * cargo/abono son strings decimales (BigInt-safe) — nunca se parsean a
 * number aquí. `fecha` es ISO-8601 UTC completo (`toISOString()`).
 *
 * `categoria` (US-013 CATAPI-05, mirrored web-side S6a): `{ id, nombre } |
 * null`, ya foldeado por el backend — `null` para filas Ingreso/SinCategoria
 * o una categoría no reconocida. Campo aditivo, no rompe el contrato
 * existente.
 */
export interface DetalleBucketTransaccionDto {
  readonly id: string
  readonly fecha: string
  readonly descripcion: string
  readonly cargo: string
  readonly abono: string
  readonly banco: string
  readonly tipoCuenta: string
  readonly numeroCuenta: string
  readonly categoria: { readonly id: string; readonly nombre: string } | null
}

export interface DetalleBucketDto {
  readonly periodo: string
  readonly bucket: string
  readonly transacciones: ReadonlyArray<DetalleBucketTransaccionDto>
}

/**
 * Mirror escrito a mano del DTO HTTP de `GET /api/auth/me` (auth-login-session
 * Slice 3, design.md §6.1; `esDemo` agregado por demo-trial-mode, design.md
 * "Interfaces / Contracts"). Fuente de verdad en el backend:
 * `AuthController#me` → `{ userId, email, esDemo }` (sin hash, sin token).
 *
 * `email` es `string | null` porque una cuenta demo (`esDemo: true`) nunca
 * tiene email (DEMO-AUTH-05) — un usuario real (`esDemo: false`) siempre
 * trae `email: string`. Este invariante cruzado NO es solo documental: el
 * type guard `esMeDto` (`api/auth.ts`) lo hace cumplir en runtime,
 * rechazando fail-closed `{ esDemo: false, email: null }` (espejo del guard
 * del backend en `buscarIdentidad`).
 */
export interface MeDto {
  readonly userId: string
  readonly email: string | null
  readonly esDemo: boolean
}
