import type { ApiError, ApiResult } from './client'
import type { MeDto } from './types'

/**
 * api/auth.ts — cliente de sesión web (auth-login-session Slice 3, AUTH-01,
 * AUTH-10). Misma disciplina never-throw `ApiResult<T>` que `client.ts`:
 * `fetch` same-origin a través del proxy server-side (ni base URL ni
 * `x-api-key` desde el navegador — el proxy los inyecta, ver `vite.config.ts`
 * / `api/[...path].ts`), toda falla mapeada a un `ApiError` tipado, nunca
 * lanza.
 *
 * AUTH-01 — web NO debe persistir el token del body. El backend ahora
 * devuelve `{ token, userId, expiresAt }` en el body de login para que los
 * clientes móviles lo persistan en SecureStore (design.md §5.4) — pero la
 * sesión web vive ENTERAMENTE en la cookie HttpOnly `md_session` que la misma
 * respuesta setea. `postLogin` devuelve deliberadamente `ApiResult<void>`:
 * nunca lee el campo `token` del body, así que ningún código web puede
 * accidentalmente guardarlo (localStorage, Zustand, memoria, etc).
 */

// `credentials: 'same-origin'` ya es el default del navegador para `fetch`,
// pero se declara explícito (design.md §6.1) para que el envío de la cookie
// de sesión no dependa de un default implícito del runtime.
const SESSION_FETCH_OPTIONS: RequestInit = { credentials: 'same-origin' }

function errorGenerico(status: number): ApiError {
  return { tag: 'server', status, message: 'Ocurrió un error inesperado. Intenta nuevamente.' }
}

export async function postLogin(input: { email: string; password: string }): Promise<ApiResult<void>> {
  let res: Response
  try {
    res = await fetch('/api/auth/login', {
      ...SESSION_FETCH_OPTIONS,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized', message: 'Credenciales inválidas.' } }
  }
  if (!res.ok) {
    return { ok: false, error: errorGenerico(res.status) }
  }

  // Éxito: el body trae `{ token, userId, expiresAt }` pero se DESCARTA sin
  // leerlo — la cookie ya quedó seteada por el navegador. `value: undefined`
  // es la garantía en tipos de que ningún caller puede leer un `token`.
  return { ok: true, value: undefined }
}

function esMeDto(value: unknown): value is MeDto {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidato = value as Partial<MeDto>
  return typeof candidato.userId === 'string' && typeof candidato.email === 'string'
}

export async function fetchMe(): Promise<ApiResult<MeDto>> {
  let res: Response
  try {
    res = await fetch('/api/auth/me', SESSION_FETCH_OPTIONS)
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized', message: 'Sesión no válida.' } }
  }
  if (!res.ok) {
    return { ok: false, error: errorGenerico(res.status) }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  if (!esMeDto(body)) {
    return { ok: false, error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' } }
  }

  return { ok: true, value: body }
}

export async function postLogout(): Promise<ApiResult<void>> {
  let res: Response
  try {
    res = await fetch('/api/auth/logout', { ...SESSION_FETCH_OPTIONS, method: 'POST' })
  } catch {
    return { ok: false, error: { tag: 'network', message: 'No se pudo conectar con el servidor.' } }
  }

  if (!res.ok) {
    return { ok: false, error: errorGenerico(res.status) }
  }

  return { ok: true, value: undefined }
}
