import type { BucketResumenDto, DetalleBucketDto, DetalleBucketTransaccionDto, ResumenMesDto } from './types'
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
 * fetchDetalleBucket — GET /api/buckets/:bucket[?periodo=YYYY-MM] (US-017).
 * Misma disciplina que `fetchResumen`: same-origin, sin key, nunca lanza,
 * error tipado. Mensajes de 400/401/5xx son específicos de este recurso (no
 * se comparten con `fetchResumen` — el 400 aquí puede venir de un `:bucket`
 * inválido o de un `periodo` inválido, no solo de período; ver dry.md
 * "distinguir conocimiento de coincidencia").
 *
 * Guarda money-safety: valida todo lo que `aDetalleBucketViewModel`
 * consume aguas abajo — `cargo`/`abono` (BigInt-string), `fecha`,
 * `descripcion`. `cargo`/`abono` se validan con `esMontoStringValido` (no
 * basta con `typeof === 'string'`: `formatearMontoCLP` lanza sobre
 * `""`/`"abc"`/`"12.5"`/etc — ver `esBucketResumenDto` arriba, mismo
 * razonamiento) y `fecha` con `esFechaValida` (un `fecha` no parseable
 * produciría una fecha garbled/vacía vía `aFechaLabel`, que solo hace un
 * slice posicional sin validar formato). Un 2xx que no cumpla la forma
 * esperada nunca llega a `formatearMontoCLP`/`aFechaLabel` con un valor
 * inesperado — se mapea a `ApiError` tipado (tag "parse"), nunca lanza.
 */
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
    esMontoStringValido(candidato.abono)
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
