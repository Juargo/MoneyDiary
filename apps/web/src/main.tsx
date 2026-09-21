import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { QUERY_CLIENT_DEFAULTS } from './api/query-client-defaults';
import { esErrorPermanente } from './api/retry-policy';
import { controladorTema } from './lib/use-preferencia-tema';
import { controladorVersion } from './lib/use-aviso-version';
// Self-hosted Inter Variable (the app's body/label face) — same-origin,
// bundled font file, no render-blocking Google Fonts CDN. Referenced by
// --font-sans in index.css. Explicit `/index.css` path (not the bare package
// specifier) so `vite/client`'s ambient `*.css` module declaration applies —
// bare-specifier CSS-only packages have no `.d.ts`/"types" field for tsc.
import '@fontsource-variable/inter/index.css';
import './index.css';

/**
 * shouldRetryQuery — predicado de retry para el QueryClient de producción.
 * Solo los tags permanentes (`invalid`/`unauthorized`, `esErrorPermanente`
 * en `api/retry-policy.ts`) cortan el retry; errores transitorios
 * (`network`, `server`, `parse`) o cualquier error no reconocible como
 * `ApiError` conservan el comportamiento default de TanStack Query (hasta 3
 * intentos con backoff).
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (esErrorPermanente(error)) {
    return false;
  }
  return failureCount < 3;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// El script inline de `index.html` (WT-04) ya aplicó la clase/color-scheme
// antes del primer paint; `iniciar()` solo conecta los listeners de OS
// (`matchMedia`) y cross-tab (`storage`) para mantener el DOM sincronizado
// después de que React monta (WT-02/WT-05). El entorno del controlador ya
// pasa `matchMedia: undefined` si el navegador no lo soporta
// (`lib/use-preferencia-tema.ts`), así que esta llamada no lanza en ese caso.
controladorTema.iniciar();

// issue #751: arma el intervalo (30 min, solo con la pestaña visible) y los
// listeners de `visibilitychange`/`vite:preloadError` del aviso de "hay una
// versión nueva" (`components/AvisoVersionNueva.tsx`, montado en
// `routes/__root.tsx`). Ver `lib/controlador-version.ts` para el detalle de
// cuándo dispara cada chequeo.
controladorVersion.iniciar();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
