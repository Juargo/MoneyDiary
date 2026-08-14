import type { ApiError, ApiResult } from './client';

/**
 * api/perfil.ts — cliente de `/api/perfil*` (US-042 design.md §1/Q5, module
 * map). Misma disciplina never-throw `ApiResult<T>` que `auth.ts`/`client.ts`:
 * `credentials: 'same-origin'` explícito (la cookie de sesión `md_session` no
 * depende de un default implícito), toda falla mapeada a un `ApiError`
 * tipado, nunca lanza.
 *
 * Ambas funciones devuelven `ApiResult<void>` — el body de éxito de
 * `PATCH /api/perfil` (la identidad actualizada) se DESCARTA sin leerlo,
 * mismo espíritu que `postLogin` descartando `token`: la orquestación
 * (`use-guardar-perfil.ts`, design.md §1/Q2b) nunca lee `r.value`, solo
 * `r.ok`/`r.error` — la identidad fresca llega por la invalidación de
 * `['auth-me']` (design.md §1/Q2d), no por este body. Evita además duplicar
 * el guard de forma de `esMeDto` (`auth.ts`, no exportado) en un segundo
 * archivo (`dry`).
 *
 * Todo no-2xx (400/403/409/503) se mapea a `{ tag: 'server', status, code }`
 * — `code` es el campo `body.code` que `aPerfilHttpError` (backend) siempre
 * envía (`PERFIL_RECHAZADO`, `DEMO_SOLO_LECTURA`, `NOMBRE_INVALIDO`, …).
 * `message` aquí es SIEMPRE el genérico de relleno: el texto mostrado al
 * usuario lo elige `mensajes.ts` por `status + code` (design.md D-04 — nunca
 * se renderiza un string del servidor).
 */

const SESSION_FETCH_OPTIONS: RequestInit = { credentials: 'same-origin' };

export type PerfilPatch = {
  readonly nombre?: string;
  readonly email?: string;
  readonly passwordActual?: string;
};

export type PasswordPatch = {
  readonly passwordActual: string;
  readonly passwordNueva: string;
};

async function errorConCodigo(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      tag: 'server',
      status: res.status,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    };
  }
  const code = (body as { code?: unknown } | null)?.code;
  return {
    tag: 'server',
    status: res.status,
    code: typeof code === 'string' ? code : undefined,
    message: 'Ocurrió un error inesperado. Intenta nuevamente.',
  };
}

async function enviarPatch(
  url: string,
  body: PerfilPatch | PasswordPatch,
): Promise<ApiResult<void>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...SESSION_FETCH_OPTIONS,
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    };
  }
  if (!res.ok) {
    return { ok: false, error: await errorConCodigo(res) };
  }

  // 200 (perfil) o 204 (password) — ningún caller lee el body de éxito
  // (ver docblock de arriba). 204 no trae body de todos modos (mismo gotcha
  // que `deleteIngesta`, D7).
  return { ok: true, value: undefined };
}

/** `PATCH /api/perfil` — PERF040-01/02/03/04/07/08. */
export async function patchPerfil(
  patch: PerfilPatch,
): Promise<ApiResult<void>> {
  return enviarPatch('/api/perfil', patch);
}

/** `PATCH /api/perfil/password` — PERF040-03/04/05/06/07/08. */
export async function patchPassword(
  patch: PasswordPatch,
): Promise<ApiResult<void>> {
  return enviarPatch('/api/perfil/password', patch);
}
