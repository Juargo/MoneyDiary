import type {
  ApiVersionDto,
  BucketResumenDto,
  CommitIngestaDto,
  DetalleBucketMesDto,
  GrupoDetalleBucketMesDto,
  IngestaListItemDto,
  IngestaResponseDto,
  IngresosMesDto,
  PreviewFilaDto,
  PreviewIngestaDto,
  PreviewIngestaDtoConCanonicos,
  ReclasificarCategoriaDto,
  ResumenAnualDto,
  ResumenMesDto,
  SemaforoBucketDetalleDto,
  SemaforoDetalleDto,
  TransaccionDetalleBucketMesDto,
  TransaccionIngresosMesDto,
  TransaccionResponseDto,
} from './types';
import { esMontoStringValido } from '../domain/formatear-monto';
import { esFechaValida } from '../domain/fecha';

/**
 * fetchResumen — el único lugar que toca `fetch` para el endpoint de
 * resumen. Llama same-origin a `/api/resumen[?periodo=YYYY-MM]` — sin base
 * URL, sin `x-api-key`: el proxy server-side (dev: Vite `configure`; prod:
 * función Vercel — Tarea 0-W) inyecta la key antes de reenviar a Render.
 * Nunca lanza; toda falla se mapea a un `ApiError` tipado, mismo espíritu
 * `Result<T,E>` que el backend (design.md B.3).
 */
export type ApiError =
  | { tag: 'invalid'; message: string } // 400 — período inválido
  | { tag: 'unauthorized'; message: string } // 401 — sin acceso
  | { tag: 'network'; message: string } // fetch rechazado (offline, DNS…)
  | { tag: 'parse'; message: string } // 2xx pero el body no tiene la forma esperada
  | {
      tag: 'server';
      status: number;
      message: string;
      // `code` (US-042 design.md §1/Q8): the perfil endpoints answer every
      // non-2xx with a body `{ message, code }` where `code` is the specific
      // domain reason (`PERFIL_RECHAZADO`, `DEMO_SOLO_LECTURA`, …) — the
      // client picks its own copy by `status + code` and NEVER renders
      // `message` (design.md D-04, the anti-enumeration constraint).
      // Optional and unused by every existing `'server'` producer in this
      // file, so this is additive, not a breaking widen.
      code?: string;
    }; // cualquier otro no-2xx (5xx, 404…)

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

/**
 * Guarda money-safety: valida, campo por campo, todo lo que
 * `aResumenViewModel`/`formatearMontoCLP` (domain/resumen-view-model.ts)
 * consume aguas abajo — `totalIngreso`, `buckets[i].total` (BigInt-string),
 * `buckets[i].porcentajeBp` y los `string | null` renderizados verbatim
 * (`estadoSemaforo`, `estadoGlobal`). Los campos de dinero (`total`,
 * `totalIngreso`) se validan con `esMontoStringValido` — NO basta con
 * `typeof === 'string'`: `formatearMontoCLP` lanza sobre cualquier string
 * que no cumpla el formato decimal estricto (`""`, `"abc"`, `"12.5"`,
 * `"+100"`, `" 100"`), así que un `typeof`-only guard deja pasar un 2xx que
 * crashearía el mapeo a view-model con un `TypeError` crudo. Con este guard,
 * ninguna forma inesperada llega a `formatearMontoCLP` — se mapea a
 * `ApiError` tipado (tag "parse"), nunca lanza. Deliberadamente NO valida
 * cada leaf (p.ej. `periodo`, `targets`) — KISS, solo lo que efectivamente
 * fluye a dinero/render.
 */
function esBucketResumenDto(value: unknown): value is BucketResumenDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<BucketResumenDto>;
  return (
    typeof candidato.total === 'string' &&
    esMontoStringValido(candidato.total) &&
    (typeof candidato.porcentajeBp === 'number' ||
      candidato.porcentajeBp === null) &&
    (typeof candidato.estadoSemaforo === 'string' ||
      candidato.estadoSemaforo === null)
  );
}

function esResumenMesDto(value: unknown): value is ResumenMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<ResumenMesDto>;
  return (
    typeof candidato.totalIngreso === 'string' &&
    esMontoStringValido(candidato.totalIngreso) &&
    Array.isArray(candidato.buckets) &&
    candidato.buckets.every(esBucketResumenDto) &&
    (typeof candidato.estadoGlobal === 'string' ||
      candidato.estadoGlobal === null) &&
    // US-047 WG5-05: the legend now reads `cantidadSinCategoria` directly
    // (Sin categoría row's transaction count) — a payload missing it, or
    // carrying it as a non-number, must be rejected the same way any other
    // structurally invalid ResumenMesDto already is. `esResumenAnualDto`
    // reuses this guard unmodified for each of its 12 months (verified
    // safe, design §3/§0 blast-radius note): the annual DTO always
    // populates this field server-side, so no real payload is newly
    // rejected there.
    typeof candidato.cantidadSinCategoria === 'number'
  );
}

export async function fetchResumen(
  periodo?: string,
): Promise<ApiResult<ResumenMesDto>> {
  const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
  const url = `/api/resumen${query}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      error: { tag: 'invalid', message: 'El período no es válido.' },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esResumenMesDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Guarda money-safety para `SemaforoDetalleDto` (US-049, design §1.7 "The DTO
 * guard is IN SCOPE — WG5-05 lesson"): valida exactamente lo que
 * `aSemaforoDetalleViewModel` (`domain/semaforo-detalle-view-model.ts`)
 * consume aguas abajo — `totalIngreso`/`sinCategoria.total` vía
 * `esMontoStringValido` (mismo razonamiento que `esResumenMesDto`:
 * `formatearMontoCLP` lanza sobre `"12.5"`/`"abc"`/etc), `periodo`,
 * `sinIngreso`, `diagnostico`, `estadoGlobal`/`bucketsCriticos` (ambos
 * renderizados verbatim, WG5-05 recurrence), y cada `buckets[]` con
 * `bucket`/`porcentajeBp`/`estadoSemaforo`/`metaBp`/`bandas`/`consejo` en la
 * forma exacta del wire. `estadoGlobal`/`estadoSemaforo` se validan contra la
 * unión exacta `'verde' | 'amarillo' | 'rojo' | null` vía `esEstadoSemaforo`
 * (compartida entre ambos call sites, DRY) — nunca un `string` suelto, mismo
 * espíritu que `esConsejoDto` con `direccion`. Un `consejo.monto` como
 * `"12.5"` (JSON-válido pero no BigInt-safe) DEBE rechazarse aquí — si no,
 * `formatearMontoCLP` lanzaría mid-render sin ErrorBoundary en la app (la
 * misma clase de bug que `esBucketResumenDto` ya previene para
 * `/api/resumen`). Deliberadamente NO valida `buckets[i].total` (KISS —
 * ningún consumidor de este PR lo lee; se agrega el día que un consumidor
 * real lo necesite, no antes).
 */
function esEstadoSemaforo(
  value: unknown,
): value is 'verde' | 'amarillo' | 'rojo' | null {
  return (
    value === null ||
    value === 'verde' ||
    value === 'amarillo' ||
    value === 'rojo'
  );
}

function esBandasBucketDto(
  value: unknown,
): value is SemaforoBucketDetalleDto['bandas'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<SemaforoBucketDetalleDto['bandas']>;
  return (
    typeof candidato.verdeMax === 'number' &&
    typeof candidato.amarilloMax === 'number' &&
    (typeof candidato.verdeMin === 'number' || candidato.verdeMin === null) &&
    (typeof candidato.amarilloMin === 'number' ||
      candidato.amarilloMin === null)
  );
}

function esConsejoDto(
  value: unknown,
): value is SemaforoBucketDetalleDto['consejo'] {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const candidato = value as Partial<
    NonNullable<SemaforoBucketDetalleDto['consejo']>
  >;
  return (
    (candidato.direccion === 'reducir' || candidato.direccion === 'aumentar') &&
    typeof candidato.mensaje === 'string' &&
    typeof candidato.monto === 'string' &&
    esMontoStringValido(candidato.monto)
  );
}

function esSemaforoBucketDetalleDto(
  value: unknown,
): value is SemaforoBucketDetalleDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<SemaforoBucketDetalleDto>;
  return (
    typeof candidato.bucket === 'string' &&
    (typeof candidato.porcentajeBp === 'number' ||
      candidato.porcentajeBp === null) &&
    esEstadoSemaforo(candidato.estadoSemaforo) &&
    typeof candidato.metaBp === 'number' &&
    esBandasBucketDto(candidato.bandas) &&
    esConsejoDto(candidato.consejo)
  );
}

function esSinCategoriaDto(
  value: unknown,
): value is SemaforoDetalleDto['sinCategoria'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<SemaforoDetalleDto['sinCategoria']>;
  return (
    typeof candidato.cantidad === 'number' &&
    typeof candidato.total === 'string' &&
    esMontoStringValido(candidato.total)
  );
}

function esSemaforoDetalleDto(value: unknown): value is SemaforoDetalleDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<SemaforoDetalleDto>;
  return (
    typeof candidato.totalIngreso === 'string' &&
    esMontoStringValido(candidato.totalIngreso) &&
    typeof candidato.periodo === 'string' &&
    typeof candidato.sinIngreso === 'boolean' &&
    esEstadoSemaforo(candidato.estadoGlobal) &&
    Array.isArray(candidato.bucketsCriticos) &&
    candidato.bucketsCriticos.every((item) => typeof item === 'string') &&
    typeof candidato.diagnostico === 'string' &&
    Array.isArray(candidato.buckets) &&
    candidato.buckets.every(esSemaforoBucketDetalleDto) &&
    esSinCategoriaDto(candidato.sinCategoria)
  );
}

/**
 * fetchSemaforoDetalle — GET /api/resumen/semaforo[?periodo=YYYY-MM] (US-049,
 * design §1.7). Misma disciplina never-throw `ApiResult<T>` que
 * `fetchResumen`: same-origin (el proxy inyecta `x-api-key`), sin base URL,
 * mismo status-mapping (400 → periodo inválido, 401 → sin acceso, 5xx →
 * server genérico, network → fetch rechazado, body inesperado → parse).
 */
export async function fetchSemaforoDetalle(
  periodo?: string,
): Promise<ApiResult<SemaforoDetalleDto>> {
  const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
  const url = `/api/resumen/semaforo${query}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      error: { tag: 'invalid', message: 'El período no es válido.' },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esSemaforoDetalleDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Guarda money-safety para el annual (US-030 Slice C): reutiliza
 * `esResumenMesDto` mes a mes (DRY, mismo shape que `/api/resumen`) y además
 * exige exactamente 12 entradas — la garantía del backend (Ene→Dic,
 * `resumen-anual.dto.ts`). Un body con menos/más meses es tan inesperado
 * como uno con un monto malformado: se mapea a `ApiError` tipado (tag
 * "parse"), nunca lanza ni deja pasar un array corto a la grilla anual.
 */
function esResumenAnualDto(value: unknown): value is ResumenAnualDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<ResumenAnualDto>;
  return (
    typeof candidato.anio === 'number' &&
    Array.isArray(candidato.meses) &&
    candidato.meses.length === 12 &&
    candidato.meses.every(esResumenMesDto)
  );
}

/**
 * fetchResumenAnual — GET /api/resumen/anual[?anio=YYYY] (US-030 Slice C).
 * Misma disciplina que `fetchResumen`: same-origin, sin key, nunca lanza,
 * error tipado. El 400 aquí es específico de `anio` inválido (mirror del
 * mensaje scrubbed del backend, `resumen.controller.ts#obtenerAnual`).
 */
export async function fetchResumenAnual(
  anio?: number,
): Promise<ApiResult<ResumenAnualDto>> {
  const query =
    anio !== undefined ? `?anio=${encodeURIComponent(String(anio))}` : '';
  const url = `/api/resumen/anual${query}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      error: { tag: 'invalid', message: 'El año no es válido.' },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esResumenAnualDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Guarda money-safety para `DetalleBucketMesDto` (US-051 `bucket-detalle-mes`,
 * consumido por US-053): valida exactamente lo que
 * `aDetalleBucketMesViewModel` (`domain/detalle-bucket-mes-view-model.ts`)
 * consume aguas abajo — `total`/`grupos[].subtotal`/`transacciones[].monto`
 * vía `esMontoStringValido` (mismo razonamiento que `esResumenMesDto`:
 * `formatearMontoCLP` lanza sobre `""`/`"abc"`/`"12.5"`/etc, un `typeof`-only
 * guard dejaría pasar un 2xx que crashearía mid-render con un `TypeError`
 * crudo), `fecha` vía `esFechaValida` (un `fecha` no parseable produciría una
 * fecha garbled vía el slice posicional de `aFechaCorta`), `periodo`/`bucket`
 * (pasados verbatim al header), `porcentajeBp`/`metaBp` (`number | null` — la
 * barra de uso se esconde cuando `porcentajeBp === null`, D-02, así que un
 * tipo inesperado rompería esa decisión), y los conteos `totalTransacciones`/
 * `totalCategorias`/`conteo` (`number`). Un 2xx que no cumpla la forma
 * esperada nunca llega a `formatearMontoCLP`/`aFechaCorta`/el view model —
 * se mapea a `ApiError` tipado (tag "parse"), nunca lanza.
 */
function esTransaccionDetalleBucketMesDto(
  value: unknown,
): value is TransaccionDetalleBucketMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<TransaccionDetalleBucketMesDto>;
  return (
    typeof candidato.id === 'string' &&
    typeof candidato.fecha === 'string' &&
    esFechaValida(candidato.fecha) &&
    typeof candidato.descripcion === 'string' &&
    typeof candidato.monto === 'string' &&
    esMontoStringValido(candidato.monto)
  );
}

function esGrupoDetalleBucketMesDto(
  value: unknown,
): value is GrupoDetalleBucketMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<GrupoDetalleBucketMesDto>;
  return (
    (candidato.categoriaId === null ||
      typeof candidato.categoriaId === 'string') &&
    typeof candidato.nombre === 'string' &&
    typeof candidato.subtotal === 'string' &&
    esMontoStringValido(candidato.subtotal) &&
    typeof candidato.conteo === 'number' &&
    Array.isArray(candidato.transacciones) &&
    candidato.transacciones.every(esTransaccionDetalleBucketMesDto)
  );
}

function esDetalleBucketMesDto(value: unknown): value is DetalleBucketMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<DetalleBucketMesDto>;
  return (
    typeof candidato.periodo === 'string' &&
    typeof candidato.bucket === 'string' &&
    typeof candidato.total === 'string' &&
    esMontoStringValido(candidato.total) &&
    typeof candidato.totalTransacciones === 'number' &&
    typeof candidato.totalCategorias === 'number' &&
    (typeof candidato.porcentajeBp === 'number' ||
      candidato.porcentajeBp === null) &&
    (typeof candidato.metaBp === 'number' || candidato.metaBp === null) &&
    Array.isArray(candidato.grupos) &&
    candidato.grupos.every(esGrupoDetalleBucketMesDto)
  );
}

/**
 * fetchDetalleBucketMes — GET /api/buckets/:bucket/detalle[?periodo=YYYY-MM]
 * (US-051 `bucket-detalle-mes` MBD-01..08; consumido por US-053). Misma
 * disciplina que `fetchResumen`: same-origin, sin key, nunca lanza,
 * error tipado. El 400 aquí puede venir de un `:bucket` fuera de la allowlist
 * o de un `periodo` inválido — mismo mensaje que el flat sibling que reemplazó
 * (el backend no distingue entre ambos, ver dry.md "distinguir conocimiento de
 * coincidencia"). `grupos` pasa verbatim al view model — el cliente nunca
 * re-ordena ni re-agrupa (WDM-03).
 */
export async function fetchDetalleBucketMes(
  bucket: string,
  periodo?: string,
): Promise<ApiResult<DetalleBucketMesDto>> {
  const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
  const url = `/api/buckets/${encodeURIComponent(bucket)}/detalle${query}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      error: {
        tag: 'invalid',
        message: 'El bucket o el período no son válidos.',
      },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esDetalleBucketMesDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Guardia money-safe para `IngresosMesDto` (US-052 `ingresos-detalle-mes`,
 * consumido por US-054): valida exactamente lo que consume el view-model
 * (`domain/ingresos-mes-view-model.ts`) aguas abajo — `total` y
 * `transacciones[].monto` vía `esMontoStringValido` (mismo razonamiento que
 * `esDetalleBucketMesDto`: `formatearMontoConSigno` lanza ante `""`/`"abc"`/
 * `"12.5"`/etc, así que un guard de solo typeof dejaría que un 2xx crashee a
 * mitad de render con un TypeError), `fecha` vía `esFechaValida` (una `fecha`
 * no parseable renderizaría una fecha corrupta por el slice posicional de
 * `aFechaCorta` en vez de fallar explícitamente), y la forma deja `conteo`
 * (`number`) e `id`/`descripcion` (`string`) más `origen` como string no vacío
 * (nombre de banco verbatim o `'Manual'`, MID-02 — vacío es shape mismatch).
 * Fail-closed: cualquier mismatch de forma mapea a `{tag:'parse'}`, nunca
 * lanza.
 */
function esTransaccionIngresosMesDto(
  value: unknown,
): value is TransaccionIngresosMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<TransaccionIngresosMesDto>;
  return (
    typeof candidato.id === 'string' &&
    typeof candidato.fecha === 'string' &&
    esFechaValida(candidato.fecha) &&
    typeof candidato.descripcion === 'string' &&
    typeof candidato.origen === 'string' &&
    candidato.origen !== '' &&
    typeof candidato.monto === 'string' &&
    esMontoStringValido(candidato.monto)
  );
}

function esIngresosMesDto(value: unknown): value is IngresosMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<IngresosMesDto>;
  return (
    typeof candidato.conteo === 'number' &&
    typeof candidato.total === 'string' &&
    esMontoStringValido(candidato.total) &&
    Array.isArray(candidato.transacciones) &&
    candidato.transacciones.every(esTransaccionIngresosMesDto)
  );
}

/**
 * fetchIngresosMes — GET /api/ingresos/mes[?periodo=YYYY-MM] (US-052
 * `ingresos-detalle-mes`, MID-01..06; consumido por US-054). Misma disciplina
 * never-throw `ApiResult<T>` que `fetchResumen`/`fetchDetalleBucketMes`:
 * mismo-origen (el proxy inyecta `x-api-key`), sin base URL, mismo mapeo de
 * estados (400 → período inválido — el único input inválido, precedente de
 * `fetchResumen`; 401 → no autorizado; otro non-2xx → server genérico;
 * rechazo de fetch → network; cuerpo inesperado → parse). `transacciones`
 * pasa verbatim al view-model — el client nunca re-ordena ni recalcula
 * totales (MID-01, WDI-06).
 */
export async function fetchIngresosMes(
  periodo?: string,
): Promise<ApiResult<IngresosMesDto>> {
  const query =
    periodo != null ? `?periodo=${encodeURIComponent(periodo)}` : '';
  const url = `/api/ingresos/mes${query}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      error: { tag: 'invalid', message: 'El período no es válido.' },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esIngresosMesDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

function esReclasificarCategoriaDto(
  value: unknown,
): value is ReclasificarCategoriaDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<ReclasificarCategoriaDto>;
  if (
    typeof candidato.id !== 'string' ||
    typeof candidato.bucket !== 'string'
  ) {
    return false;
  }
  if (typeof candidato.categoria !== 'object' || candidato.categoria === null) {
    return false;
  }
  const categoria = candidato.categoria as Partial<{
    id: string;
    nombre: string;
  }>;
  return (
    typeof categoria.id === 'string' && typeof categoria.nombre === 'string'
  );
}

/**
 * postReclasificarCategoria — PATCH /api/transacciones/:id/categoria (US-013
 * S4/S6b). Misma disciplina never-throw `ApiResult<T>` que el resto de
 * `client.ts`: same-origin (el proxy server-side inyecta `x-api-key`), toda
 * falla mapeada a un `ApiError` tipado, nunca lanza.
 *
 * El request SOLO envía `{ categoria: nombre }` — nunca un bucket (design.md
 * §4.1/§7.3): el bucket destino se DERIVA server-side de la categoría
 * elegida, el cliente no puede inyectarlo. `400` = categoría desconocida;
 * `404` (no existe / no es del usuario, anti-enumeration) cae en la rama
 * genérica `!res.ok` → `{tag: 'server', status: 404}`, igual que cualquier
 * otro no-2xx no distinguido explícitamente aquí.
 */
export async function postReclasificarCategoria(
  transaccionId: string,
  categoria: string,
): Promise<ApiResult<ReclasificarCategoriaDto>> {
  const url = `/api/transacciones/${encodeURIComponent(transaccionId)}/categoria`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoria }),
    });
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    return {
      ok: false,
      error: { tag: 'invalid', message: 'La categoría elegida no es válida.' },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esReclasificarCategoriaDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Guarda money-safety para `IngestaResponseDto` (`upload-cartola-ui`): mismo
 * razonamiento que `esDetalleBucketMesDto` — `cargo`/`abono` se
 * validan con `esMontoStringValido` y `fecha` con `esFechaValida` antes de
 * que cualquier cosa aguas abajo (`formatearMontoCLP`) toque el valor. Un
 * 2xx que no cumpla la forma esperada se mapea a `ApiError` tipado (tag
 * "parse"), nunca lanza.
 */
function esTransaccionResponseDto(
  value: unknown,
): value is TransaccionResponseDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<TransaccionResponseDto>;
  return (
    typeof candidato.fecha === 'string' &&
    esFechaValida(candidato.fecha) &&
    typeof candidato.descripcion === 'string' &&
    typeof candidato.cargo === 'string' &&
    esMontoStringValido(candidato.cargo) &&
    typeof candidato.abono === 'string' &&
    esMontoStringValido(candidato.abono)
  );
}

function esArchivoIngestaDto(
  value: unknown,
): value is IngestaResponseDto['archivo'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<IngestaResponseDto['archivo']>;
  return (
    typeof candidato.nombre === 'string' &&
    typeof candidato.extension === 'string' &&
    typeof candidato.tamanoBytes === 'number'
  );
}

function esIngestaResponseDto(value: unknown): value is IngestaResponseDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<IngestaResponseDto>;
  return (
    typeof candidato.ingestaId === 'string' &&
    typeof candidato.banco === 'string' &&
    typeof candidato.tipoCuenta === 'string' &&
    typeof candidato.numeroCuenta === 'string' &&
    esArchivoIngestaDto(candidato.archivo) &&
    typeof candidato.totalTransacciones === 'number' &&
    typeof candidato.duplicadosOmitidos === 'number' &&
    Array.isArray(candidato.transacciones) &&
    candidato.transacciones.every(esTransaccionResponseDto)
  );
}

/**
 * postIngesta — POST /api/ingestas same-origin (upload-cartola-ui, design.md
 * Decision 1/4). Envía `multipart/form-data` con el archivo bajo el campo
 * `file` (backend `FileInterceptor('file')`) — sin fijar `Content-Type`
 * manualmente, el browser genera el boundary del multipart; fijarlo a mano
 * lo rompería.
 *
 * A diferencia de `fetchResumen`, un 400 aquí NO se
 * re-mapea a un mensaje fijo del cliente: el backend ya emite mensajes
 * scrubbed en español para cada variante (banco no reconocido, estructura
 * inválida, PDF sin texto, tamaño/extensión) y el cliente no puede
 * distinguirlas entre sí desde un 400 solo — se pasa `body.message` verbatim
 * (DRY, fuente única en el backend). Si el body no es legible, cae a un
 * mensaje genérico.
 */
export async function postIngesta(
  file: File,
): Promise<ApiResult<IngestaResponseDto>> {
  const formData = new FormData();
  formData.append('file', file);

  let res: Response;
  try {
    res = await fetch('/api/ingestas', { method: 'POST', body: formData });
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        error: {
          tag: 'invalid',
          message: 'El archivo no se pudo procesar. Intenta nuevamente.',
        },
      };
    }
    const mensaje = (body as { message?: unknown } | null)?.message;
    return {
      ok: false,
      error: {
        tag: 'invalid',
        message:
          typeof mensaje === 'string'
            ? mensaje
            : 'El archivo no se pudo procesar. Intenta nuevamente.',
      },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: {
        tag: 'unauthorized',
        message: 'Tu sesión expiró. Inicia sesión de nuevo.',
      },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esIngestaResponseDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Valida un `sugerido` de `PreviewFilaDto`: debe ser `null` o un objeto con
 * `bucket: string` y `categoriaId: string | null`. Un objeto sin `categoriaId`
 * (aunque tenga `bucket`) se rechaza — el guard downstream necesita el campo
 * para el display-merge (D-05).
 */
function esPreviewFilaSugerido(
  value: unknown,
): value is { bucket: string; categoriaId: string | null } | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const s = value as Record<string, unknown>;
  return (
    typeof s['bucket'] === 'string' &&
    (typeof s['categoriaId'] === 'string' || s['categoriaId'] === null) &&
    'categoriaId' in s
  );
}

/**
 * Valida una fila canónica de `PreviewFilaDto` (US-057/US-059, D-08).
 * Money-safety: `cargo`/`abono` validados con `esMontoStringValido`;
 * `fecha` con `esFechaValida` — evita que `formatearMontoCLP` / `.slice(0,10)`
 * procesen valores malformados en el render. `sugerido` puede ser `null` o el
 * shape `{ bucket, categoriaId }` — validado por `esPreviewFilaSugerido`.
 */
function esPreviewFilaDto(value: unknown): value is PreviewFilaDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const fila = value as Record<string, unknown>;
  return (
    typeof fila['rowIndex'] === 'number' &&
    typeof fila['fecha'] === 'string' &&
    esFechaValida(fila['fecha']) &&
    typeof fila['descripcion'] === 'string' &&
    typeof fila['cargo'] === 'string' &&
    esMontoStringValido(fila['cargo']) &&
    typeof fila['abono'] === 'string' &&
    esMontoStringValido(fila['abono']) &&
    typeof fila['esDuplicado'] === 'boolean' &&
    esPreviewFilaSugerido(fila['sugerido'])
  );
}

/**
 * Valida el sub-objeto `resumen` canónico de `PreviewIngestaResponse` (US-057,
 * D-08). Todos los campos son conteos (row counts, not money) — validados como
 * `number`, NO `esMontoStringValido`.
 */
function esResumenPreviewDto(
  value: unknown,
): value is NonNullable<PreviewIngestaDto['resumen']> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r['totalFilas'] === 'number' &&
    typeof r['duplicadosDetectados'] === 'number' &&
    typeof r['nuevas'] === 'number'
  );
}

/**
 * Guard hardened para `PreviewIngestaDtoConCanonicos` (US-059 PR1, D-08,
 * WEB-PRV-03). Requiere AMBOS campos canónicos: `filas` (array no vacío de
 * `PreviewFilaDto` validados) y `resumen` (objeto con conteos). Mantiene la
 * validación de `banco`/`tipoCuenta`/`numeroCuenta` (presentes en el response
 * y usados en el header). Retorna un type predicate que estrecha a
 * `PreviewIngestaDtoConCanonicos` — downstream puede acceder a
 * `data.filas`/`data.resumen` sin `!` (tsc-safe).
 *
 * // muestra/estructura not validated — deprecated fields removed in US-061.
 *
 * Reemplaza el guard legacy que solo validaba `muestra`/`estructura`.
 */
function esPreviewIngestaDto(
  value: unknown,
): value is PreviewIngestaDtoConCanonicos {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<PreviewIngestaDto>;
  return (
    typeof candidato.banco === 'string' &&
    typeof candidato.tipoCuenta === 'string' &&
    typeof candidato.numeroCuenta === 'string' &&
    Array.isArray(candidato.filas) &&
    (candidato.filas as unknown[]).every(esPreviewFilaDto) &&
    esResumenPreviewDto(candidato.resumen)
  );
}

/**
 * previewIngesta — POST /api/ingestas/preview same-origin
 * (`us-003-vista-previa` Slice 2, design.md §9.4). Faithful mirror of
 * `postIngesta`'s transport: same multipart contract (field `file`, no
 * manual `Content-Type`), never throws, same status-mapping conventions
 * (400 passes `body.message` verbatim, 401 fixed session-expired message).
 * The ONLY difference from `postIngesta` is the URL and the response DTO —
 * this endpoint is read-only server-side (PREV-02), the client never
 * invalidates any cache from its result (that's `usePreviewIngesta`'s job,
 * D10).
 */
export async function previewIngesta(
  file: File,
): Promise<ApiResult<PreviewIngestaDtoConCanonicos>> {
  const formData = new FormData();
  formData.append('file', file);

  let res: Response;
  try {
    res = await fetch('/api/ingestas/preview', {
      method: 'POST',
      body: formData,
    });
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        error: {
          tag: 'invalid',
          message: 'El archivo no se pudo procesar. Intenta nuevamente.',
        },
      };
    }
    const mensaje = (body as { message?: unknown } | null)?.message;
    return {
      ok: false,
      error: {
        tag: 'invalid',
        message:
          typeof mensaje === 'string'
            ? mensaje
            : 'El archivo no se pudo procesar. Intenta nuevamente.',
      },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: {
        tag: 'unauthorized',
        message: 'Tu sesión expiró. Inicia sesión de nuevo.',
      },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esPreviewIngestaDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Valida una fila individual dentro de `CommitIngestaDto.transacciones`
 * (US-059, D-08). Money-safety: `cargo`/`abono` con `esMontoStringValido`;
 * `fecha` con `esFechaValida`. `categoriaId` puede ser `string | null`.
 * `bucket` y `descripcion` son strings simples (no-money, no-fecha).
 */
function esCommitTransaccionDto(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const t = value as Record<string, unknown>;
  return (
    typeof t['bucket'] === 'string' &&
    (typeof t['categoriaId'] === 'string' || t['categoriaId'] === null) &&
    typeof t['cargo'] === 'string' &&
    esMontoStringValido(t['cargo']) &&
    typeof t['abono'] === 'string' &&
    esMontoStringValido(t['abono']) &&
    typeof t['descripcion'] === 'string' &&
    typeof t['fecha'] === 'string' &&
    esFechaValida(t['fecha'])
  );
}

/**
 * Guard para `CommitIngestaDto` (US-059, D-08). Valida campos de nivel raíz:
 * `ingestaId` (string), `totalTransacciones`/`duplicadosOmitidos` (number,
 * conteos no-money) y `transacciones[]` (cada fila validada por
 * `esCommitTransaccionDto`). Sigue el mismo patrón que `esIngestaResponseDto`.
 */
function esCommitIngestaDto(value: unknown): value is CommitIngestaDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<CommitIngestaDto>;
  return (
    typeof candidato.ingestaId === 'string' &&
    typeof candidato.totalTransacciones === 'number' &&
    typeof candidato.duplicadosOmitidos === 'number' &&
    Array.isArray(candidato.transacciones) &&
    (candidato.transacciones as unknown[]).every(esCommitTransaccionDto)
  );
}

/**
 * postCommitIngesta — POST /api/ingestas/commit same-origin (US-059 PR1,
 * D-04). Faithful mirror of `previewIngesta`'s transport doctrine — only
 * differences are the URL (`/api/ingestas/commit`), the extra `edits` field
 * (always sent, even when empty — an empty array is a valid pure
 * auto-classify commit), and the response DTO (`CommitIngestaDto`, 201).
 *
 * FormData: `file` (binary) + `edits` (JSON string of the sparse overlay
 * `[{ rowIndex, categoriaId }]`). No manual `Content-Type` — the browser sets
 * the multipart boundary.
 *
 * Status mapping identical to `postIngesta`:
 *   400 → `body.message` verbatim (backend-scrubbed Spanish)
 *   401 → fixed "Tu sesión expiró…"
 *   non-2xx → `server`
 *   network throw → `network`
 *   guard-fail on 2xx → `parse`
 * Note: the commit endpoint responds 201; `!res.ok` is false for 201, so no
 * special casing is needed — the `res.ok` branch handles it correctly.
 */
export async function postCommitIngesta(
  file: File,
  edits: ReadonlyArray<{ rowIndex: number; categoriaId: string | null }>,
): Promise<ApiResult<CommitIngestaDto>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('edits', JSON.stringify(edits));

  let res: Response;
  try {
    res = await fetch('/api/ingestas/commit', {
      method: 'POST',
      body: formData,
    });
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 400) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        error: {
          tag: 'invalid',
          message: 'El archivo no se pudo procesar. Intenta nuevamente.',
        },
      };
    }
    const mensaje = (body as { message?: unknown } | null)?.message;
    return {
      ok: false,
      error: {
        tag: 'invalid',
        message:
          typeof mensaje === 'string'
            ? mensaje
            : 'El archivo no se pudo procesar. Intenta nuevamente.',
      },
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: {
        tag: 'unauthorized',
        message: 'Tu sesión expiró. Inicia sesión de nuevo.',
      },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esCommitIngestaDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Guarda money-safety para `IngestaListItemDto` (`us-018-eliminar-ingesta`
 * Slice 2, design.md §7.1; widened by `us-004-historial-ingestas` Slice 3,
 * design.md §9): `totalTransacciones` es un CONTEO de filas, no dinero — se
 * valida con `typeof === 'number'`, NO `esMontoStringValido` (esa guarda es
 * solo para strings decimales BigInt-safe, este campo nunca lo es). `fecha`
 * se valida con `esFechaValida` (mismo razonamiento que
 * `esDetalleBucketMesDto`: un `fecha` no parseable produciría una
 * fecha garbled en pantalla en vez de fallar explícito). Un 2xx que no cumpla
 * la forma esperada se mapea a `ApiError` tipado (tag "parse"), nunca lanza.
 *
 * US-004 widen: `banco`/`motivoFallo` aceptan explícitamente `null` (una
 * `FALLIDA` temprana no tiene banco resuelto ni, para una `PROCESADA`, motivo
 * de falla) — se valida `=== null || typeof === 'string'`, no simplemente
 * `typeof === 'string'` (eso rechazaría el `null` legítimo). `estado` se
 * valida contra la unión exacta `'PROCESADA' | 'FALLIDA'` vía
 * `esIngestaEstado`, nunca un `string` suelto.
 */
function esIngestaEstado(
  value: unknown,
): value is IngestaListItemDto['estado'] {
  return value === 'PROCESADA' || value === 'FALLIDA';
}

function esIngestaListItemDto(value: unknown): value is IngestaListItemDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<IngestaListItemDto>;
  return (
    typeof candidato.id === 'string' &&
    (candidato.banco === null || typeof candidato.banco === 'string') &&
    typeof candidato.nombreArchivo === 'string' &&
    esIngestaEstado(candidato.estado) &&
    (candidato.motivoFallo === null ||
      typeof candidato.motivoFallo === 'string') &&
    typeof candidato.fecha === 'string' &&
    esFechaValida(candidato.fecha) &&
    typeof candidato.totalTransacciones === 'number'
  );
}

/**
 * fetchIngestas — GET /api/ingestas same-origin (`us-018-eliminar-ingesta`
 * Slice 2, design.md §7.1). Misma disciplina que `fetchResumen`: same-origin,
 * sin key, nunca lanza, error tipado. El body llega envuelto en
 * `{ ingestas: [...] }` (consistencia con el resto de endpoints, ninguno
 * devuelve un array bare) — se valida que `body.ingestas` sea un array donde
 * CADA elemento cumple `esIngestaListItemDto` antes de desenvolverlo.
 */
export async function fetchIngestas(): Promise<
  ApiResult<IngestaListItemDto[]>
> {
  let res: Response;
  try {
    res = await fetch('/api/ingestas');
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (typeof body !== 'object' || body === null) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }
  const ingestas = (body as { ingestas?: unknown }).ingestas;
  if (!Array.isArray(ingestas) || !ingestas.every(esIngestaListItemDto)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: ingestas };
}

/**
 * deleteIngesta — DELETE /api/ingestas/:id same-origin
 * (`us-018-eliminar-ingesta` Slice 2, design.md §7.1/D7).
 *
 * **204 gotcha (D7):** un 204 no trae body — llamar `res.json()` lanza. En
 * `res.ok` (204) se devuelve `{ ok: true, value: undefined }` SIN parsear
 * JSON. `404` (anti-enumeration: no existe / no es del usuario) se mapea a
 * `{ tag: 'server', status: 404 }` con un mensaje que invita a refrescar la
 * lista, en vez del genérico de 5xx — la UI lo trata como "ya no está", no
 * como un error inesperado.
 */
export async function deleteIngesta(id: string): Promise<ApiResult<void>> {
  const url = `/api/ingestas/${encodeURIComponent(id)}`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'DELETE' });
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: 404,
        message: 'La cartola ya no existe. La lista se actualizará.',
      },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  return { ok: true, value: undefined };
}

function esApiVersionDto(value: unknown): value is ApiVersionDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<ApiVersionDto>;
  return (
    typeof candidato.version === 'string' &&
    typeof candidato.commit === 'string' &&
    typeof candidato.ref === 'string' &&
    typeof candidato.builtAt === 'string'
  );
}

/**
 * fetchApiVersion — GET /version del API. A diferencia del resto del cliente,
 * NO va same-origin por el proxy `/api`: el endpoint es público y vive en la
 * raíz del backend (fuera de `/api`), así que se llama CROSS-ORIGIN a la URL
 * absoluta (`VITE_API_BASE_URL`, pública, sin secretos) y el backend lo
 * autoriza vía CORS con allowlist. Sin base configurada → llamada same-origin
 * que fallará y se mapea a `ApiError` (el badge simplemente no se muestra).
 * Nunca lanza; toda falla es un `ApiError` tipado.
 */
export async function fetchApiVersion(): Promise<ApiResult<ApiVersionDto>> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const url = `${base}/version`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'No se pudo obtener la versión del API.',
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esApiVersionDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}
