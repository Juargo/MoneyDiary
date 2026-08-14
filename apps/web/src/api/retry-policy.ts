import type { ApiError } from './client';

/**
 * TAGS_ERROR_PERMANENTE — tags de `ApiError` cuyo resultado NO puede cambiar
 * entre reintentos: el estado del cliente/servidor sigue siendo el mismo
 * (400 "período/bucket inválido" o 401 "sin acceso"). Reintentarlos solo
 * retrasa que la UI muestre el `ErrorState` correcto, sin ninguna chance de
 * un resultado distinto.
 *
 * Extraído de `main.tsx` (dry) porque tanto el `QueryClient` de producción
 * (`shouldRetryQuery`) como `useAuthCapabilities` (retry acotado para el
 * cold start de Render, issue #323) necesitan el mismo predicado de
 * permanencia — antes vivía solo en `main.tsx`, que no puede importarse
 * desde un test (llama `createRoot` a nivel de módulo).
 */
export const TAGS_ERROR_PERMANENTE: ReadonlySet<ApiError['tag']> = new Set([
  'invalid',
  'unauthorized',
]);

/**
 * esErrorPermanente — true si `error` tiene la forma `ApiError` y su `tag`
 * está en `TAGS_ERROR_PERMANENTE`. `error` llega como `unknown` porque el
 * predicado de retry de TanStack Query lo tipa como `DefaultError` (`Error`
 * por default), sin importar los generics que cada `useQuery` declare.
 */
export function esErrorPermanente(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'tag' in error &&
    TAGS_ERROR_PERMANENTE.has((error as ApiError).tag)
  );
}
