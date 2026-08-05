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
  readonly bucket: string;
  readonly total: string;
  readonly porcentajeBp: number | null;
  readonly estadoSemaforo: string | null;
}

export interface ResumenMesDto {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
  readonly buckets: ReadonlyArray<BucketResumenDto>;
  readonly targets: {
    readonly Necesidades: number;
    readonly Deseos: number;
    readonly Ahorro: number;
  };
  readonly estadoGlobal: string | null;
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
  readonly anio: number;
  readonly meses: ReadonlyArray<ResumenMesDto>;
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
  readonly id: string;
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly categoria: { readonly id: string; readonly nombre: string } | null;
}

export interface DetalleBucketDto {
  readonly periodo: string;
  readonly bucket: string;
  readonly transacciones: ReadonlyArray<DetalleBucketTransaccionDto>;
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
  readonly userId: string;
  readonly email: string | null;
  readonly esDemo: boolean;
}

/**
 * Mirror escrito a mano del DTO HTTP de respuesta del reclassify (US-013
 * S4/S6b). Fuente de verdad en el backend:
 * `PATCH /api/transacciones/:id/categoria` (`transacciones.controller.ts`).
 *
 * `bucket` refleja el bucket DERIVADO server-side de la categoría elegida
 * (nunca se envía en el request — ver `postReclasificarCategoria` en
 * `client.ts`); el body de respuesta lo trae de vuelta para que el caller
 * pueda mostrar feedback sin re-fetchear antes de que la invalidación de
 * queries corra.
 */
export interface ReclasificarCategoriaDto {
  readonly id: string;
  readonly categoria: { readonly id: string; readonly nombre: string };
  readonly bucket: string;
}

/**
 * Mirror escrito a mano del DTO HTTP de `POST /api/ingestas`
 * (`upload-cartola-ui`, design.md "Interfaces / contracts"). Fuente de
 * verdad en el backend:
 * `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts`.
 *
 * `cargo`/`abono` son strings decimales (BigInt-safe) y `fecha` es
 * ISO-8601 (`toISOString()`) — misma disciplina que `DetalleBucketTransaccionDto`,
 * nunca se parsean a number aquí.
 */
export interface TransaccionResponseDto {
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
}

export interface IngestaResponseDto {
  readonly ingestaId: string;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly archivo: {
    readonly nombre: string;
    readonly extension: string;
    readonly tamanoBytes: number;
  };
  readonly totalTransacciones: number;
  /**
   * Conteo de filas detectadas como duplicadas y NO persistidas (US-005
   * `us-005-deteccion-duplicados`, design.md §5.1). `totalTransacciones` YA
   * refleja solo lo importado (semántica sin cambios) — este campo se suma,
   * no se resta de nada. `0` cuando no hubo duplicados, nunca omitido.
   */
  readonly duplicadosOmitidos: number;
  readonly transacciones: ReadonlyArray<TransaccionResponseDto>;
}

/**
 * Mirror escrito a mano del DTO HTTP de `GET /api/ingestas`
 * (`us-018-eliminar-ingesta` Slice 2, design.md §7.4; widened by
 * `us-004-historial-ingestas` Slice 3, design.md §9/§4.3). Fuente de verdad
 * en el backend: `apps/api/src/infrastructure/http/dto/ingesta-list.dto.ts`.
 *
 * `totalTransacciones` es un CONTEO de filas (row count), no dinero — `number`
 * plano, sin el tratamiento BigInt-string que llevan `cargo`/`abono` en otros
 * DTOs. `fecha` es ISO-8601 (`Ingesta.creadoEn.toISOString()`).
 *
 * US-004 widen (additivo, ING-03/ING-07): `banco` ahora `string | null` (una
 * `FALLIDA` temprana no tiene banco resuelto — extensión inválida o banco no
 * reconocido); `nombreArchivo`/`estado`/`motivoFallo` son nuevos. `estado` es
 * una unión string-literal a mano, NO un enum importado del backend — el
 * contrato HTTP nunca debe filtrar un tipo de persistencia a través del
 * boundary (mismo razonamiento que el resto de este archivo, ADR-008).
 */
export type EstadoIngestaResumen = 'exitoso' | 'fallido' | 'pendiente';

export interface IngestaListItemDto {
  readonly id: string;
  readonly banco: string | null;
  readonly nombreArchivo: string;
  readonly estado: 'PROCESADA' | 'FALLIDA';
  readonly motivoFallo: string | null;
  readonly fecha: string;
  readonly totalTransacciones: number;
}

/**
 * Contrato de `GET /version` del API (endpoint público, consumido cross-origin
 * vía CORS con allowlist). Mismo shape que los `/version.json` de web y
 * landing: identifica qué build del backend está sirviendo prod.
 */
export interface ApiVersionDto {
  readonly version: string;
  readonly commit: string;
  readonly ref: string;
  readonly builtAt: string;
}

/**
 * Mirror escrito a mano del DTO HTTP de `POST /api/ingestas/preview`
 * (`us-003-vista-previa` Slice 2, design.md §9.4). Fuente de verdad en el
 * backend: `apps/api/src/infrastructure/http/dto/preview-ingesta.dto.ts`.
 *
 * `cargo`/`abono` son strings decimales (BigInt-safe) — misma disciplina que
 * `TransaccionResponseDto`, nunca se parsean a number aquí. `fecha` es
 * ISO-8601 (`toISOString()`).
 */
export interface PreviewTransaccionDto {
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
}

/**
 * `estructura.totalFilasDatos` es el conteo TOTAL de filas normalizadas del
 * archivo (PRE-dedupe, design.md D5) — puede ser mayor que `muestra.length`,
 * que queda capado a `PREVIEW_SAMPLE_MAX = 50` server-side (design.md D8, el
 * cliente nunca re-capa). `muestra` es la fuente de verdad ÚNICA que el
 * selector 10/25/50 (CA-01, PREV-06) re-slicea client-side, sin re-request.
 */
export interface PreviewIngestaDto {
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly estructura: { readonly totalFilasDatos: number };
  readonly muestra: ReadonlyArray<PreviewTransaccionDto>;
}
