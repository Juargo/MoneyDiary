import type {
  BucketResumenDto,
  DetalleBucketDto,
  DetalleBucketTransaccionDto,
  IngestaResponseDto,
  ReclasificarCategoriaDto,
  ResumenAnualDto,
  ResumenMesDto,
  TransaccionResponseDto,
} from './types'
import { esMontoStringValido } from '../domain/formatear-monto'
import { esFechaValida } from '../domain/detalle-bucket-view-model'

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
  | { tag: 'server'; status: number; message: string } // cualquier otro no-2xx (5xx, 404…)

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }

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
    return false
  }
  const candidato = value as Partial<BucketResumenDto>
  return (
    typeof candidato.total === 'string' &&
    esMontoStringValido(candidato.total) &&
    (typeof candidato.porcentajeBp === 'number' || candidato.porcentajeBp === null) &&
    (typeof candidato.estadoSemaforo === 'string' || candidato.estadoSemaforo === null)
  )
}

function esResumenMesDto(value: unknown): value is ResumenMesDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<ResumenMesDto>
  return (
    typeof candidato.totalIngreso === 'string' &&
    esMontoStringValido(candidato.totalIngreso) &&
    Array.isArray(candidato.buckets) &&
    candidato.buckets.every(esBucketResumenDto) &&
    (typeof candidato.estadoGlobal === 'string' || candidato.estadoGlobal === null)
  )
}

export async function fetchResumen(periodo?: string): Promise<ApiResult<ResumenMesDto>> {
  const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
  const url = `/api/resumen${query}`

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (res.status === 400) {
    return { ok: false, error: { tag: 'invalid', message: 'El período no es válido.' } }
  }
  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized', message: 'Sin acceso.' } }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: { tag: 'server', status: res.status, message: 'Ocurrió un error inesperado. Intenta nuevamente.' },
    }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  if (!esResumenMesDto(body)) {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  return { ok: true, value: body }
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
    return false
  }
  const candidato = value as Partial<ResumenAnualDto>
  return (
    typeof candidato.anio === 'number' &&
    Array.isArray(candidato.meses) &&
    candidato.meses.length === 12 &&
    candidato.meses.every(esResumenMesDto)
  )
}

/**
 * fetchResumenAnual — GET /api/resumen/anual[?anio=YYYY] (US-030 Slice C).
 * Misma disciplina que `fetchResumen`: same-origin, sin key, nunca lanza,
 * error tipado. El 400 aquí es específico de `anio` inválido (mirror del
 * mensaje scrubbed del backend, `resumen.controller.ts#obtenerAnual`).
 */
export async function fetchResumenAnual(anio?: number): Promise<ApiResult<ResumenAnualDto>> {
  const query = anio !== undefined ? `?anio=${encodeURIComponent(String(anio))}` : ''
  const url = `/api/resumen/anual${query}`

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (res.status === 400) {
    return { ok: false, error: { tag: 'invalid', message: 'El año no es válido.' } }
  }
  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized', message: 'Sin acceso.' } }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: { tag: 'server', status: res.status, message: 'Ocurrió un error inesperado. Intenta nuevamente.' },
    }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  if (!esResumenAnualDto(body)) {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  return { ok: true, value: body }
}

/**
 * fetchDetalleBucket — GET /api/buckets/:bucket[?periodo=YYYY-MM] (US-017).
 * Misma disciplina que `fetchResumen`: same-origin, sin key, nunca lanza,
 * error tipado. Mensajes de 400/401/5xx son específicos de este recurso (no
 * se comparten con `fetchResumen` — el 400 aquí puede venir de un `:bucket`
 * inválido o de un `periodo` inválido, no solo de período; ver dry.md
 * "distinguir conocimiento de coincidencia").
 *
 * Guarda money-safety: valida todo lo que `aDetalleBucketViewModel`/
 * `agruparDetallePorCategoria` consumen aguas abajo — `cargo`/`abono`
 * (BigInt-string), `fecha`, `descripcion`, `categoria`. `cargo`/`abono` se
 * validan con `esMontoStringValido` (no basta con `typeof === 'string'`:
 * `formatearMontoCLP` lanza sobre `""`/`"abc"`/`"12.5"`/etc — ver
 * `esBucketResumenDto` arriba, mismo razonamiento) y `fecha` con
 * `esFechaValida` (un `fecha` no parseable produciría una fecha
 * garbled/vacía vía `aFechaLabel`, que solo hace un slice posicional sin
 * validar formato). `categoria` (US-013 CATAPI-05) debe ser `null` o
 * `{id, nombre}` con ambos campos `string` — la agrupación por categoría
 * (S6a) usa `categoria.id` como clave de grupo, así que una forma
 * inesperada aquí produciría grupos garbled en vez de fallar explícito. Un
 * 2xx que no cumpla la forma esperada nunca llega a
 * `formatearMontoCLP`/`aFechaLabel`/`agruparDetallePorCategoria` con un
 * valor inesperado — se mapea a `ApiError` tipado (tag "parse"), nunca
 * lanza.
 */
function esCategoriaTx(value: unknown): value is { id: string; nombre: string } | null {
  if (value === null) {
    return true
  }
  if (typeof value !== 'object') {
    return false
  }
  const candidato = value as Partial<{ id: string; nombre: string }>
  return typeof candidato.id === 'string' && typeof candidato.nombre === 'string'
}

function esDetalleBucketTransaccionDto(value: unknown): value is DetalleBucketTransaccionDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<DetalleBucketTransaccionDto>
  return (
    typeof candidato.id === 'string' &&
    typeof candidato.fecha === 'string' &&
    esFechaValida(candidato.fecha) &&
    typeof candidato.descripcion === 'string' &&
    typeof candidato.cargo === 'string' &&
    esMontoStringValido(candidato.cargo) &&
    typeof candidato.abono === 'string' &&
    esMontoStringValido(candidato.abono) &&
    esCategoriaTx(candidato.categoria ?? null)
  )
}

function esDetalleBucketDto(value: unknown): value is DetalleBucketDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<DetalleBucketDto>
  return (
    typeof candidato.bucket === 'string' &&
    Array.isArray(candidato.transacciones) &&
    candidato.transacciones.every(esDetalleBucketTransaccionDto)
  )
}

export async function fetchDetalleBucket(bucket: string, periodo?: string): Promise<ApiResult<DetalleBucketDto>> {
  const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
  const url = `/api/buckets/${encodeURIComponent(bucket)}${query}`

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (res.status === 400) {
    return { ok: false, error: { tag: 'invalid', message: 'El bucket o el período no son válidos.' } }
  }
  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized', message: 'Sin acceso.' } }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: { tag: 'server', status: res.status, message: 'Ocurrió un error inesperado. Intenta nuevamente.' },
    }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  if (!esDetalleBucketDto(body)) {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  return { ok: true, value: body }
}

function esReclasificarCategoriaDto(value: unknown): value is ReclasificarCategoriaDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<ReclasificarCategoriaDto>
  if (typeof candidato.id !== 'string' || typeof candidato.bucket !== 'string') {
    return false
  }
  if (typeof candidato.categoria !== 'object' || candidato.categoria === null) {
    return false
  }
  const categoria = candidato.categoria as Partial<{ id: string; nombre: string }>
  return typeof categoria.id === 'string' && typeof categoria.nombre === 'string'
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
  const url = `/api/transacciones/${encodeURIComponent(transaccionId)}/categoria`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoria }),
    })
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (res.status === 400) {
    return { ok: false, error: { tag: 'invalid', message: 'La categoría elegida no es válida.' } }
  }
  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized', message: 'Sin acceso.' } }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: { tag: 'server', status: res.status, message: 'Ocurrió un error inesperado. Intenta nuevamente.' },
    }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  if (!esReclasificarCategoriaDto(body)) {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  return { ok: true, value: body }
}

/**
 * Guarda money-safety para `IngestaResponseDto` (`upload-cartola-ui`): mismo
 * razonamiento que `esDetalleBucketTransaccionDto` — `cargo`/`abono` se
 * validan con `esMontoStringValido` y `fecha` con `esFechaValida` antes de
 * que cualquier cosa aguas abajo (`formatearMontoCLP`) toque el valor. Un
 * 2xx que no cumpla la forma esperada se mapea a `ApiError` tipado (tag
 * "parse"), nunca lanza.
 */
function esTransaccionResponseDto(value: unknown): value is TransaccionResponseDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<TransaccionResponseDto>
  return (
    typeof candidato.fecha === 'string' &&
    esFechaValida(candidato.fecha) &&
    typeof candidato.descripcion === 'string' &&
    typeof candidato.cargo === 'string' &&
    esMontoStringValido(candidato.cargo) &&
    typeof candidato.abono === 'string' &&
    esMontoStringValido(candidato.abono)
  )
}

function esArchivoIngestaDto(value: unknown): value is IngestaResponseDto['archivo'] {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<IngestaResponseDto['archivo']>
  return (
    typeof candidato.nombre === 'string' &&
    typeof candidato.extension === 'string' &&
    typeof candidato.tamanoBytes === 'number'
  )
}

function esIngestaResponseDto(value: unknown): value is IngestaResponseDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<IngestaResponseDto>
  return (
    typeof candidato.ingestaId === 'string' &&
    typeof candidato.banco === 'string' &&
    typeof candidato.tipoCuenta === 'string' &&
    typeof candidato.numeroCuenta === 'string' &&
    esArchivoIngestaDto(candidato.archivo) &&
    typeof candidato.totalTransacciones === 'number' &&
    Array.isArray(candidato.transacciones) &&
    candidato.transacciones.every(esTransaccionResponseDto)
  )
}

/**
 * postIngesta — POST /api/ingestas same-origin (upload-cartola-ui, design.md
 * Decision 1/4). Envía `multipart/form-data` con el archivo bajo el campo
 * `file` (backend `FileInterceptor('file')`) — sin fijar `Content-Type`
 * manualmente, el browser genera el boundary del multipart; fijarlo a mano
 * lo rompería.
 *
 * A diferencia de `fetchResumen`/`fetchDetalleBucket`, un 400 aquí NO se
 * re-mapea a un mensaje fijo del cliente: el backend ya emite mensajes
 * scrubbed en español para cada variante (banco no reconocido, estructura
 * inválida, PDF sin texto, tamaño/extensión) y el cliente no puede
 * distinguirlas entre sí desde un 400 solo — se pasa `body.message` verbatim
 * (DRY, fuente única en el backend). Si el body no es legible, cae a un
 * mensaje genérico.
 */
export async function postIngesta(file: File): Promise<ApiResult<IngestaResponseDto>> {
  const formData = new FormData()
  formData.append('file', file)

  let res: Response
  try {
    res = await fetch('/api/ingestas', { method: 'POST', body: formData })
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (res.status === 400) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      return {
        ok: false,
        error: { tag: 'invalid', message: 'El archivo no se pudo procesar. Intenta nuevamente.' },
      }
    }
    const mensaje = (body as { message?: unknown } | null)?.message
    return {
      ok: false,
      error: {
        tag: 'invalid',
        message: typeof mensaje === 'string' ? mensaje : 'El archivo no se pudo procesar. Intenta nuevamente.',
      },
    }
  }
  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized', message: 'Tu sesión expiró. Inicia sesión de nuevo.' } }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: { tag: 'server', status: res.status, message: 'Ocurrió un error inesperado. Intenta nuevamente.' },
    }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  if (!esIngestaResponseDto(body)) {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  return { ok: true, value: body }
}
