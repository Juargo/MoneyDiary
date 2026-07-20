import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import type { ApiError } from './api/client'
// Self-hosted Inter Variable (Serene Finance typography) — same-origin,
// bundled font file, no render-blocking Google Fonts CDN. Referenced by
// --font-sans in index.css. Explicit `/index.css` path (not the bare package
// specifier) so `vite/client`'s ambient `*.css` module declaration applies —
// bare-specifier CSS-only packages have no `.d.ts`/"types" field for tsc.
import '@fontsource-variable/inter/index.css'
import './index.css'

// Tags que representan un fallo PERMANENTE del request (el body/estado del
// cliente no cambia entre reintentos: 400 "período/bucket inválido" o 401
// "sin acceso"). Reintentarlos con el backoff default de TanStack Query
// (retry: 3) solo retrasa varios segundos que la UI muestre el ErrorState
// correcto sin ninguna chance de éxito distinto.
const TAGS_ERROR_PERMANENTE: ReadonlySet<ApiError['tag']> = new Set(['invalid', 'unauthorized'])

/**
 * `QueryClient` (sin generics explícitos) tipa el `error` del retry como el
 * `DefaultError` global (`Error`), no como `ApiError` — aunque
 * `useResumen`/`useDetalleBucket` declaren `useQuery<T, ApiError>`, el
 * predicado de retry vive a nivel de cliente y debe aceptar cualquier error
 * que TanStack Query le pase. Por eso `error` llega como `unknown` y este
 * type guard confirma que tiene la forma `ApiError` antes de leer `.tag`.
 */
function esApiErrorConTagPermanente(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'tag' in error &&
    TAGS_ERROR_PERMANENTE.has((error as ApiError).tag)
  )
}

/**
 * shouldRetryQuery — predicado de retry para el QueryClient de producción.
 * Solo los tags permanentes (`invalid`/`unauthorized`) cortan el retry;
 * errores transitorios (`network`, `server`, `parse`) o cualquier error no
 * reconocible como `ApiError` conservan el comportamiento default de
 * TanStack Query (hasta 3 intentos con backoff).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (esApiErrorConTagPermanente(error)) {
    return false
  }
  return failureCount < 3
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
