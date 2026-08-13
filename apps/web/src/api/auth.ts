import type { ApiError, ApiResult } from './client';
import type { MeDto } from './types';

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
const SESSION_FETCH_OPTIONS: RequestInit = { credentials: 'same-origin' };

function errorGenerico(status: number): ApiError {
  return {
    tag: 'server',
    status,
    message: 'Ocurrió un error inesperado. Intenta nuevamente.',
  };
}

export async function postLogin(input: {
  email: string;
  password: string;
}): Promise<ApiResult<void>> {
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      ...SESSION_FETCH_OPTIONS,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
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

  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Credenciales inválidas.' },
    };
  }
  if (!res.ok) {
    return { ok: false, error: errorGenerico(res.status) };
  }

  // Éxito: el body trae `{ token, userId, expiresAt }` pero se DESCARTA sin
  // leerlo — la cookie ya quedó seteada por el navegador. `value: undefined`
  // es la garantía en tipos de que ningún caller puede leer un `token`.
  return { ok: true, value: undefined };
}

// Fail-closed cross-field invariant (mirrors the backend guard restored in
// `buscarIdentidad`, PR1): a real user (`esDemo=false`) MUST have
// `email: string` — a `null` email on a non-demo account is rejected, not
// silently accepted, even though it type-checks field-by-field. A demo user
// (`esDemo=true`) is the only shape allowed to have `email: null`.
//
// US-042 WCFG-04 (design.md §1/Q4a): `nombre`/`googleVinculado` are REQUIRED
// in the generated contract (`MeDto`) but were unchecked here — a payload
// missing or mistyping either passed silently and downstream code read
// `undefined` through a `string`/`boolean` type. Both are REJECTED, never
// defaulted: `googleVinculado ?? false` would render a false statement about
// the user's account security (and a button guaranteed to 409); `nombre ??
// ''` would let `Guardar cambios` write a blank name over a good one. `nombre`
// is deliberately NOT length-validated here — the guard's job is shape,
// PERF040-01's 1..80 rule is a domain rule that lives server-side (ADR-024).
//
// This hardening is a runtime-only check (`tsc` cannot catch a shape drift in
// a JSON payload) whose failure mode is app-wide: `requireSession`
// (`lib/require-session.ts`) maps ANY non-ok `fetchMe` result — including
// `{ tag: 'parse' }` — to a `/login` redirect, with no discrimination by
// `error.tag`. If `/api/auth/me` ever stops sending either field, every
// `_authenticated` route bounces to `/login` for every user, with no
// client-side recovery. Deploy-ordering consequence (design.md §1/Q4c): an
// `apps/api` rollback past US-040/US-041 MUST revert this hardening first, or
// in the same window — never API-first. Nothing in the toolchain enforces
// that ordering; it is a documentation-only mitigation, restated in the PR
// description of the PR that carries this change.
function esMeDto(value: unknown): value is MeDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<MeDto>;
  if (
    typeof candidato.userId !== 'string' ||
    typeof candidato.nombre !== 'string' ||
    typeof candidato.esDemo !== 'boolean' ||
    typeof candidato.googleVinculado !== 'boolean' ||
    (candidato.email !== null && typeof candidato.email !== 'string')
  ) {
    return false;
  }
  return candidato.esDemo ? true : typeof candidato.email === 'string';
}

export async function fetchMe(): Promise<ApiResult<MeDto>> {
  let res: Response;
  try {
    res = await fetch('/api/auth/me', SESSION_FETCH_OPTIONS);
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
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    };
  }
  if (!res.ok) {
    return { ok: false, error: errorGenerico(res.status) };
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

  if (!esMeDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

export async function postLogout(): Promise<ApiResult<void>> {
  let res: Response;
  try {
    res = await fetch('/api/auth/logout', {
      ...SESSION_FETCH_OPTIONS,
      method: 'POST',
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

  if (!res.ok) {
    return { ok: false, error: errorGenerico(res.status) };
  }

  return { ok: true, value: undefined };
}
