/**
 * DTO type aliases derived from `@moneydiary/api-client`'s generated
 * `components['schemas']` shapes (ADR-011/012, `api-client-package` Slice 2
 * — see design.md "Adoption mapping"). Fuente de verdad del CONTRATO en el
 * backend: `apps/api/openapi.json` (generado desde los schemas Zod). Este
 * archivo ya no es un mirror escrito a mano campo por campo — es un barrel
 * de re-exports con las notas "why" que el contrato OpenAPI no captura
 * (disciplina de dinero como string, invariantes cruzados, historia de
 * widening).
 *
 * Web NO importa de `apps/api/src/domain` (ADR-008) — el paquete tampoco lo
 * hace; solo re-exporta shapes derivadas del wire contract, no del dominio
 * del backend.
 *
 * Los montos se mantienen como strings decimales (serializados desde
 * BigInt) — nunca se parsean a number aquí. `porcentajeBp` es un number
 * seguro en JS (basis points, ≤ 10000, muy por debajo de 2^53).
 */
// Type-only import — no runtime cycle (api→domain type dependency is
// intentional for this UI type; domain has no import of api).
import type { GrupoCategoriaPorBucket } from '../domain/agrupar-categorias-por-bucket';

/**
 * `BucketResumenDto`/`ResumenMesDto` — GET /api/resumen (50/30/20 mensual).
 * `estadoSemaforo`/`estadoGlobal` ahora tipan como la unión literal
 * `'verde' | 'amarillo' | 'rojo' | null` (más estricta que el `string | null`
 * hand-written anterior) — narrowing aceptado per design.md "Adoption
 * mapping", nunca se ensancha de vuelta a `string`.
 */
export type { BucketResumenDto, ResumenMesDto } from '@moneydiary/api-client';

/**
 * `ResumenAnualDto` — GET /api/resumen/anual (US-030 Slice C). `meses`
 * siempre trae exactamente 12 entradas, Ene→Dic (garantía del backend) —
 * cada una reutiliza el mismo shape que `ResumenMesDto` (DRY). Los meses sin
 * datos/futuros llegan con `sinIngreso: true` y montos en cero, nunca
 * omitidos.
 */
export type { ResumenAnualDto } from '@moneydiary/api-client';

/**
 * `DetalleBucketTransaccionDto`/`DetalleBucketDto` — GET
 * /api/buckets/:bucket (US-017). `cargo`/`abono` son strings decimales
 * (BigInt-safe) — nunca se parsean a number aquí. `fecha` es ISO-8601 UTC
 * completo (`toISOString()`).
 *
 * `categoria` (US-013 CATAPI-05, mirrored web-side S6a): `{ id, nombre } |
 * null`, ya foldeado por el backend — `null` para filas Ingreso/SinCategoria
 * o una categoría no reconocida. Campo aditivo, no rompe el contrato
 * existente.
 */
export type {
  DetalleBucketDto,
  DetalleBucketTransaccionDto,
} from '@moneydiary/api-client';

/**
 * `MeDto` — GET /api/auth/me (auth-login-session Slice 3, design.md §6.1;
 * `esDemo` agregado por demo-trial-mode, design.md "Interfaces / Contracts").
 * Fuente de verdad en el backend: `AuthController#me` → `{ userId, email,
 * esDemo }` (sin hash, sin token).
 *
 * `email` es `string | null` porque una cuenta demo (`esDemo: true`) nunca
 * tiene email (DEMO-AUTH-05) — un usuario real (`esDemo: false`) siempre
 * trae `email: string`. Este invariante cruzado NO es solo documental: el
 * type guard `esMeDto` (`api/auth.ts`) lo hace cumplir en runtime,
 * rechazando fail-closed `{ esDemo: false, email: null }` (espejo del guard
 * del backend en `buscarIdentidad`).
 */
export type { MeDto } from '@moneydiary/api-client';

/**
 * `ReclasificarCategoriaDto` — respuesta del reclassify (US-013 S4/S6b).
 * Fuente de verdad en el backend: `PATCH /api/transacciones/:id/categoria`
 * (`transacciones.controller.ts`).
 *
 * `bucket` refleja el bucket DERIVADO server-side de la categoría elegida
 * (nunca se envía en el request — ver `postReclasificarCategoria` en
 * `client.ts`); el body de respuesta lo trae de vuelta para que el caller
 * pueda mostrar feedback sin re-fetchear antes de que la invalidación de
 * queries corra.
 */
export type { ReclasificarCategoriaDto } from '@moneydiary/api-client';

/**
 * `TransaccionResponseDto` — fila dentro de la respuesta de POST
 * /api/ingestas (`upload-cartola-ui`, design.md "Interfaces / contracts").
 *
 * `cargo`/`abono` son strings decimales (BigInt-safe) y `fecha` es
 * ISO-8601 (`toISOString()`) — misma disciplina que
 * `DetalleBucketTransaccionDto`, nunca se parsean a number aquí.
 */
export type { TransaccionResponseDto } from '@moneydiary/api-client';

/**
 * `IngestaResponseDto` — respuesta de POST /api/ingestas. Fuente de verdad
 * en el backend: `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts`.
 *
 * `duplicadosOmitidos` (US-005 `us-005-deteccion-duplicados`, design.md
 * §5.1): conteo de filas detectadas como duplicadas y NO persistidas.
 * `totalTransacciones` YA refleja solo lo importado (semántica sin cambios)
 * — este campo se suma, no se resta de nada. `0` cuando no hubo duplicados,
 * nunca omitido.
 */
export type { IngestaResponseDto } from '@moneydiary/api-client';

/**
 * `EstadoIngestaResumen`/`IngestaListItemDto` — GET /api/ingestas
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
 * reconocido); `nombreArchivo`/`estado`/`motivoFallo` son nuevos.
 * `EstadoIngestaResumen` NO está en el wire (design.md "Adoption mapping") —
 * es una proyección de UI, no un DTO; se mantiene escrito a mano, distinta
 * de `IngestaListItemDto['estado']` (que sí viene del contrato, unión
 * `'PROCESADA' | 'FALLIDA'`).
 */
export type EstadoIngestaResumen = 'exitoso' | 'fallido' | 'pendiente';

export type { IngestaListItemDto } from '@moneydiary/api-client';

/**
 * `ApiVersionDto` — GET /version del API (endpoint público, consumido
 * cross-origin vía CORS con allowlist). Mismo shape que los `/version.json`
 * de web y landing: identifica qué build del backend está sirviendo prod.
 */
export type { ApiVersionDto } from '@moneydiary/api-client';

/**
 * `AuthCapabilitiesDto` — GET /api/auth/capabilities (auth-google-login
 * Slice D, AC-10). Fuente de verdad en el backend:
 * `apps/api/src/infrastructure/http-express/schemas/auth-capabilities.schema.ts`.
 *
 * Fuente única del kill switch (design.md §4.5): el botón "Continuar con
 * Google" en `/login` SOLO se muestra cuando `googleLoginEnabled: true`.
 * Nunca se deriva de un flag de build-time — la verdad vive enteramente en
 * el servidor (presencia de `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en
 * Render).
 *
 * El contrato ahora también trae `googleLoginMobileEnabled` (gate
 * independiente para el login de Google en mobile, ADR-035) — campo
 * requerido que web no consume; el guard `esAuthCapabilitiesDto`
 * (`api/capabilities.ts`) sigue validando únicamente `googleLoginEnabled`
 * (WAC-02 — el guard valida lo que la app efectivamente consume).
 */
export type { AuthCapabilitiesDto } from '@moneydiary/api-client';

/**
 * `PreviewTransaccionDto` — fila dentro de POST /api/ingestas/preview
 * (`us-003-vista-previa` Slice 2, design.md §9.4). Fuente de verdad en el
 * backend: `apps/api/src/infrastructure/http/dto/preview-ingesta.dto.ts`.
 *
 * `cargo`/`abono` son strings decimales (BigInt-safe) — misma disciplina que
 * `TransaccionResponseDto`, nunca se parsean a number aquí. `fecha` es
 * ISO-8601 (`toISOString()`).
 */
export type { PreviewTransaccionDto } from '@moneydiary/api-client';

/**
 * `PreviewFilaDto` — fila canónica dentro de POST /api/ingestas/preview
 * (US-057 canonical shape: rowIndex, fecha, descripcion, cargo, abono,
 * esDuplicado, sugerido). Re-exported from `@moneydiary/api-client` (US-059,
 * D-08). `cargo`/`abono` son strings decimales (BigInt-safe) — misma
 * disciplina que `PreviewTransaccionDto`, nunca se parsean a number aquí.
 */
export type { PreviewFilaDto } from '@moneydiary/api-client';

/**
 * `CommitIngestaDto` — respuesta de POST /api/ingestas/commit (US-057,
 * CMT-05). Re-exported from `@moneydiary/api-client` (US-059, D-08).
 * Contiene `ingestaId`, `totalTransacciones`, `duplicadosOmitidos` y
 * `transacciones[]` con bucket/categoriaId/cargo/abono/fecha por fila.
 * Montos son strings decimales (BigInt-safe). No-money fields (conteos) son
 * `number` plano.
 */
export type { CommitIngestaDto } from '@moneydiary/api-client';

/**
 * `PreviewIngestaDto` — respuesta de POST /api/ingestas/preview.
 * `estructura.totalFilasDatos` es el conteo TOTAL de filas normalizadas del
 * archivo (PRE-dedupe, design.md D5) — puede ser mayor que `muestra.length`,
 * que queda capado a `PREVIEW_SAMPLE_MAX = 50` server-side (design.md D8, el
 * cliente nunca re-capa). `muestra` es la fuente de verdad ÚNICA que el
 * selector 10/25/50 (CA-01, PREV-06) re-slicea client-side, sin re-request.
 *
 * NOTA: a partir de US-059 el cliente web consume los campos canónicos
 * `filas`/`resumen` (US-057). `muestra`/`estructura` son campos legacy
 * que el backend mantiene hasta US-061.
 */
export type { PreviewIngestaDto } from '@moneydiary/api-client';

/**
 * `PreviewIngestaDtoConCanonicos` — intersection alias que estrecha los campos
 * opcionales `filas`/`resumen` de `PreviewIngestaDto` a required (no-`!`
 * downstream, D-08, US-059). Producida por el guard `esPreviewIngestaDto`
 * hardened en `client.ts` — después de pasar el guard, `filas` y `resumen`
 * son siempre no-undefined en toda la cadena de tipos.
 */
export type PreviewIngestaDtoConCanonicos = Omit<
  import('@moneydiary/api-client').PreviewIngestaDto,
  'filas' | 'resumen'
> & {
  readonly filas: ReadonlyArray<
    import('@moneydiary/api-client').PreviewFilaDto
  >;
  readonly resumen: NonNullable<
    import('@moneydiary/api-client').PreviewIngestaDto['resumen']
  >;
};

/**
 * `CatalogoEstado` — discriminated union que modela el estado de la carga del
 * catálogo de clasificación del usuario (US-059, D-07). Calculada en
 * `SubirCartola` a partir de `useCategorias()` + `agruparPorBucket(...)` y
 * pasada hacia abajo como prop a `PreviewMuestra`/`FilaRevision`.
 *
 * - `cargando`: `useCategorias.isPending` — selects deshabilitados.
 * - `error`: `useCategorias.isError` — degradado inline, tabla sigue visible.
 * - `listo`: catálogo cargado con grupos no-vacíos (empty-buckets ya filtrados
 *   por `agruparPorBucket`).
 */
export type CatalogoEstado =
  | { readonly tag: 'cargando' }
  | { readonly tag: 'error' }
  | {
      readonly tag: 'listo';
      readonly grupos: ReadonlyArray<GrupoCategoriaPorBucket>;
    };

/**
 * `PatronDto`/`CategoriaDto`/`CatalogoDto` — contrato HTTP del catálogo de
 * clasificación por usuario (US-038/US-043, design.md §1/Q2a). **Excepción
 * ADR-008 declarada**: a diferencia del resto de este archivo, estos tres
 * tipos NO vienen de `@moneydiary/api-client` — `openapi.json` todavía no
 * cubre `GET/POST/PATCH/DELETE /api/categorias` ni `/api/patrones` (esos
 * schemas Zod existen en el backend pero el paquete generado no se ha
 * regenerado para incluirlos). Se escriben a mano, verificados campo por
 * campo contra los mappers del backend
 * (`apps/api/src/infrastructure/http/dto/{categoria,patron,catalogo}.dto.ts`)
 * — no importados, solo mirrored. Verificados por los runtime guards de
 * `api/categorias.ts` (task 12), no por un test standalone propio.
 *
 * `matchType`/`bucket` son `string` plano, no la unión literal del web
 * (`BucketAsignable`/`MatchType` en `catalogo-constantes.ts`) — el servidor
 * es la autoridad de validez (ADR-024); una categoría con un bucket que el
 * web no reconoce debe poder listarse igual (design.md Q4c), no rechazarse
 * como un parse failure.
 */
export interface PatronDto {
  readonly id: string;
  readonly categoriaId: string;
  readonly patron: string;
  readonly matchType: string;
  readonly prioridad: number;
}

export interface CategoriaDto {
  readonly id: string;
  readonly nombre: string;
  readonly bucket: string;
  readonly patrones: ReadonlyArray<PatronDto>;
  readonly transaccionesCount: number;
}

export interface CatalogoDto {
  readonly categorias: ReadonlyArray<CategoriaDto>;
}

/**
 * `SemaforoBucketDetalleDto`/`SemaforoDetalleDto` — GET /api/resumen/semaforo
 * (US-049, design.md §1.6). Sibling detail endpoint to `ResumenMesDto`:
 * exposes zone-band edges (`bandas`), the target (`metaBp`), a
 * backend-generated Spanish `diagnostico`, and per-bucket CLP-to-Verde
 * `consejo` (`{ direccion, monto, mensaje }` or `null`).
 *
 * `buckets` is always exactly 3 entries (Necesidades, Deseos, Ahorro) —
 * SinCategoria has no band/estado/target, its count+total travel in the
 * separate `sinCategoria` object instead (D-03). `consejo.mensaje` ships the
 * literal `{monto}` placeholder — the client substitutes it with
 * `formatearMontoCLP(consejo.monto)` before rendering (D-05, SEM-10).
 */
export type {
  SemaforoBucketDetalleDto,
  SemaforoDetalleDto,
} from '@moneydiary/api-client';

/**
 * `DetalleBucketMesDto`/`GrupoDetalleBucketMesDto`/`TransaccionDetalleBucketMesDto`
 * — GET /api/buckets/:bucket/detalle (US-051 `bucket-detalle-mes`, MBD-01..08;
 * consumido por US-053 `us-053-web-detalle-mes-bucket`). Fuente de verdad en
 * el backend: `apps/api/src/infrastructure/http-express/schemas/
 * bucket-detalle-mes.schema.ts` (generado a `openapi.json` → api-client).
 *
 * Disciplina de dinero idéntica al resto del archivo: `total`/`subtotal`/
 * `monto` son strings decimales (BigInt-safe) — nunca se parsean a number
 * aquí. `porcentajeBp`/`metaBp` son `number | null` (basis points ≤ 10000,
 * seguros en JS); `porcentajeBp: null` significa "sin ingreso" (MBD-01, el
 * cliente esconde la barra de uso, D-02). `fecha` es ISO-8601 UTC completo.
 *
 * `grupos` llega ORDENADO por el backend (es-CL alfabético, "Sin categoría"
 * al final, MBD-02) — el cliente nunca re-ordena ni re-agrupa (WDM-03); la
 * respuesta pasa verbatim al view model.
 */
export type {
  DetalleBucketMesDto,
  GrupoDetalleBucketMesDto,
  TransaccionDetalleBucketMesDto,
} from '@moneydiary/api-client';

/**
 * `IngresosMesDto`/`TransaccionIngresosMesDto` — GET /api/ingresos/mes
 * (US-052 `ingresos-detalle-mes`, MID-01..06; consumido por US-054
 * `us-054-web-detalle-mes-ingresos`). Fuente de verdad en el backend:
 * `apps/api/src/infrastructure/http-express/schemas/ingresos-mes.schema.ts`
 * (generado a `openapi.json` → api-client, US-052 — D-06: aliases type-only,
 * sin regen del paquete).
 *
 * Disciplina de dinero idéntica al resto del archivo: `total`/`monto` son
 * strings decimales (BigInt-safe) — nunca se parsean a number aquí. `fecha`
 * es ISO-8601 UTC completo. `origen` es el nombre del banco verbatim o
 * `'Manual'` (MID-02). `transacciones` llega en el orden exacto del servidor
 * (MID-01) — el cliente nunca re-ordena ni re-computa totales (WDI-06,
 * ADR-024).
 */
export type {
  IngresosMesDto,
  TransaccionIngresosMesDto,
} from '@moneydiary/api-client';

/**
 * `RegistrarMovimientoManualDto` — POST /api/movimientos 201 response (US-060,
 * D-06/WEB-REG-10). The persisted manual movement returned by the backend after
 * a successful registration. Amounts are BigInt-safe strings; `origen` is always
 * `"Manual"`. Used as the `useMutation` success type in `use-registrar-movimiento.ts`.
 *
 * `RegistrarMovimientoManualInput` (the request type alias) is NOT re-exported
 * here — it lives in `movimientos.ts` only, following the `CategoriaInput`/
 * `PatronInput` co-location precedent (`categorias.ts`) — request types are
 * co-located with their client fn and not relayed through the barrel (D-06).
 */
export type { RegistrarMovimientoManualDto } from '@moneydiary/api-client';
