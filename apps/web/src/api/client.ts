import type { BucketResumenDto, ResumenMesDto } from './types'

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
 * (`estadoSemaforo`, `estadoGlobal`). Un 2xx que pase esta guarda no debe
 * poder crashear el mapeo a view-model con un `TypeError` crudo — cualquier
 * forma inesperada se mapea a `ApiError` tipado (tag "parse"), nunca lanza.
 * Deliberadamente NO valida cada leaf (p.ej. `periodo`, `targets`) — KISS,
 * solo lo que efectivamente fluye a dinero/render.
 */
function esBucketResumenDto(value: unknown): value is BucketResumenDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<BucketResumenDto>
  return (
    typeof candidato.total === 'string' &&
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
