import { useQuery } from '@tanstack/react-query';
import { fetchResumen } from './client';
import type { ApiError } from './client';
import type { ResumenMesDto } from './types';

/**
 * useResumen — hook TanStack Query para GET /api/resumen[?periodo=YYYY-MM].
 *
 * Recibe `periodo` como argumento explícito en lugar de leerlo de
 * `Route.useSearch()` directamente: la pantalla/selector de período es un
 * work unit posterior (W1 componentes) — este hook solo necesita aceptar el
 * valor, quien lo llame decide de dónde sale (search params de router, un
 * valor fijo en tests, etc.).
 *
 * `periodo` ausente → el backend resuelve el mes actual (mismo contrato que
 * `GET /api/resumen` sin query param).
 *
 * `options.enabled` (peak-end landing, `SubirCartola` exito state) — thin
 * passthrough a `useQuery`'s propio `enabled`: deja montar el hook sin
 * disparar la request hasta que se cumpla una condición (p. ej. "solo
 * después de que el commit tuvo éxito y se derivó un mes dominante").
 * Ausente u `true` → mismo comportamiento de siempre (default `useQuery`).
 */
export function useResumen(
  periodo?: string,
  options?: { readonly enabled?: boolean },
) {
  return useQuery<ResumenMesDto, ApiError>({
    queryKey: ['resumen', periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchResumen(periodo);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    enabled: options?.enabled,
  });
}
