import { useQuery } from '@tanstack/react-query';
import type { ApiError, ApiResult } from './client';
import { esErrorPermanente } from './retry-policy';
import type { AuthCapabilitiesDto } from './types';

/**
 * fetchAuthCapabilities — GET /api/auth/capabilities same-origin
 * (auth-google-login Slice D, AC-10, design.md §4.5). Same never-throw
 * `ApiResult<T>` discipline as the rest of `api/*`: same-origin `fetch`
 * through the proxy (the proxy injects `x-api-key`), every failure mapped
 * to a typed `ApiError`, never throws.
 *
 * The endpoint is session-public (reachable without a logged-in user, per
 * AC-10) — it exists precisely so `/login` can decide whether to show the
 * Google button before any session exists.
 */
function esAuthCapabilitiesDto(value: unknown): value is AuthCapabilitiesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<AuthCapabilitiesDto>;
  return typeof candidato.googleLoginEnabled === 'boolean';
}

export async function fetchAuthCapabilities(): Promise<
  ApiResult<AuthCapabilitiesDto>
> {
  let res: Response;
  try {
    res = await fetch('/api/auth/capabilities');
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

  if (!esAuthCapabilitiesDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * MAX_INTENTOS_COLD_START — el API vive en el free tier de Render, que se
 * duerme tras inactividad; un arranque en frío midió **73s** (issue #323).
 * `retry: false` (un único intento) hacía que el primer visitante del día
 * se topara con el proxy de Vercel cortando la request bastante antes de
 * que Render terminara de despertar, y la opción de Google desaparecía en
 * silencio por el resto de la sesión de la pestaña — aunque el kill switch
 * server-side siguiera prendido.
 *
 * Con el backoff exponencial DEFAULT de TanStack Query (1s, 2s, 4s, 8s,
 * 16s — sin llegar al cap de 30s con solo 5 reintentos) y `failureCount < 5`
 * dando 6 intentos totales (1 inicial + 5 reintentos — TanStack pasa
 * `failureCount` empezando en 0, así que `< N` habilita N reintentos), la
 * sola espera entre intentos ya suma ~31s; sumado a la duración de cada
 * intento (el proxy no responde instantáneo mientras Render sigue
 * despertando), el peor caso ronda los 90–120s de wall clock — cubre con
 * margen holgado los 73s medidos, sin reintentar indefinidamente. La
 * asimetría que hace esto seguro: un `googleLoginEnabled: false` explícito
 * es un 200 (nunca entra a esta rama, `esErrorPermanente` corta 401
 * inmediato) — el retry más largo solo cuesta algo en el caso de cold
 * start, nunca en el caso normal.
 */
const MAX_INTENTOS_COLD_START = 5;

/**
 * shouldRetryAuthCapabilities — reintenta fallos transitorios (`network`,
 * `server`, `parse`, o cualquier error no reconocible como `ApiError`) hasta
 * `MAX_INTENTOS_COLD_START` intentos totales; corta de inmediato ante un
 * fallo permanente (`esErrorPermanente` — `invalid`/`unauthorized`, aunque
 * `/api/auth/capabilities` hoy solo puede producir `unauthorized` de esos
 * dos). Fail-closed se preserva: agotados los intentos, `GoogleLoginButton`
 * sigue sin mostrar nada.
 */
export function shouldRetryAuthCapabilities(
  failureCount: number,
  error: unknown,
): boolean {
  if (esErrorPermanente(error)) {
    return false;
  }
  return failureCount < MAX_INTENTOS_COLD_START;
}

/**
 * useAuthCapabilities — hook TanStack Query para GET /api/auth/capabilities.
 * Misma disciplina que `useApiVersion`: cacheado indefinidamente dentro de
 * la sesión de la pestaña (`staleTime: Infinity` — el kill switch no cambia
 * a mitad de sesión) — pero, a diferencia de `useApiVersion`, con retry
 * acotado ante el cold start de Render (`shouldRetryAuthCapabilities`,
 * issue #323). Mientras el retry sigue en curso, `isPending` se mantiene
 * `true`, así que `GoogleLoginButton` sigue renderizando su placeholder
 * invisible (`h-9 w-full`) — el botón aparece recién cuando la respuesta
 * llega, sin saltos de layout. Agotados los intentos, `GoogleLoginButton`
 * trata cualquier estado que no sea `{ googleLoginEnabled: true }` (loading
 * incluido) como "no mostrar" (fail-closed), nunca asume `true` por
 * defecto.
 */
export function useAuthCapabilities() {
  return useQuery<AuthCapabilitiesDto, ApiError>({
    queryKey: ['auth-capabilities'],
    queryFn: async () => {
      const result = await fetchAuthCapabilities();
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    staleTime: Infinity,
    retry: shouldRetryAuthCapabilities,
  });
}

/**
 * useGoogleLoginVisible — the SINGLE source of truth for "should the Google
 * login path show right now?" (fresh-review finding, login round-7
 * follow-up). Before this extraction `GoogleLoginButton` and
 * `routes/login.tsx`'s divider gate each computed
 * `!isPending && data?.googleLoginEnabled === true` independently, with no
 * guarantee the two derivations would ever agree. Both now call this hook
 * instead — `isPending` still comes through separately so
 * `GoogleLoginButton` can keep rendering its layout-reserving placeholder
 * while the capability is still loading, something a plain boolean can't
 * express.
 */
export function useGoogleLoginVisible(): {
  isPending: boolean;
  visible: boolean;
} {
  const { data, isPending } = useAuthCapabilities();
  return {
    isPending,
    visible: !isPending && data?.googleLoginEnabled === true,
  };
}
