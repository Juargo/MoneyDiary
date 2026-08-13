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

/**
 * IniciarVinculacionGoogle — el body de éxito de
 * `POST /api/perfil/google/vincular` (VINC041-01): `200 { urlAutorizacion }`.
 * A diferencia de `PerfilPatch`/`PasswordPatch`, este SÍ se lee — es la URL a
 * la que `use-google-vinculo.ts` navega (design.md §1/Q9c, "the jsdom
 * gotcha").
 */
export type IniciarVinculacionGoogle = {
  readonly urlAutorizacion: string;
};

function esIniciarVinculacionGoogle(
  value: unknown,
): value is IniciarVinculacionGoogle {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { urlAutorizacion?: unknown }).urlAutorizacion === 'string'
  );
}

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

/**
 * enviarMutacion — el fetch + mapeo de error compartido por PATCH y POST
 * (`dry`: red/401/no-2xx son la MISMA lógica en las cuatro funciones de este
 * archivo). Devuelve el `Response` crudo en éxito — cada caller decide si
 * necesita leer el body (`postVincularGoogle`) o descartarlo
 * (`patchPerfil`/`patchPassword`/`postDesvincularGoogle`).
 */
async function enviarMutacion(
  url: string,
  method: 'PATCH' | 'POST',
  body: unknown,
): Promise<ApiResult<Response>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...SESSION_FETCH_OPTIONS,
      method,
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

  return { ok: true, value: res };
}

async function enviarPatch(
  url: string,
  body: PerfilPatch | PasswordPatch,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion(url, 'PATCH', body);
  // 200 (perfil) o 204 (password) — ningún caller lee el body de éxito (ver
  // docblock de arriba). 204 no trae body de todos modos (mismo gotcha que
  // `deleteIngesta`, D7).
  return r.ok ? { ok: true, value: undefined } : r;
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

/**
 * `POST /api/perfil/google/vincular` — VINC041-01. A diferencia de las
 * PATCH de arriba, el body de éxito SÍ se lee (`urlAutorizacion` — la URL a
 * la que `useVincularGoogle` navega vía `window.location.assign`), así que
 * está guardado igual que `esMeDto` en `auth.ts`: una forma inesperada en un
 * 200 se mapea a `{ tag: 'parse' }`, nunca lanza.
 */
export async function postVincularGoogle(
  passwordActual: string,
): Promise<ApiResult<IniciarVinculacionGoogle>> {
  const r = await enviarMutacion('/api/perfil/google/vincular', 'POST', {
    passwordActual,
  });
  if (!r.ok) {
    return r;
  }

  let body: unknown;
  try {
    body = await r.value.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }
  if (!esIniciarVinculacionGoogle(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }
  return { ok: true, value: body };
}

/** `POST /api/perfil/google/desvincular` — VINC041-06, `204` sin body. */
export async function postDesvincularGoogle(
  passwordActual: string,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion('/api/perfil/google/desvincular', 'POST', {
    passwordActual,
  });
  return r.ok ? { ok: true, value: undefined } : r;
}
