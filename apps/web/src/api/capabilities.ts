import { useQuery } from '@tanstack/react-query';
import type { ApiError, ApiResult } from './client';
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
 * useAuthCapabilities — hook TanStack Query para GET /api/auth/capabilities.
 * Misma disciplina que `useApiVersion`: cacheado indefinidamente sin retry
 * dentro de la sesión de la pestaña — si falla, `GoogleLoginButton` trata
 * cualquier estado que no sea `{ googleLoginEnabled: true }` (loading
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
    retry: false,
  });
}
