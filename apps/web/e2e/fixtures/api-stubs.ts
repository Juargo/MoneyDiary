import type { Page } from '@playwright/test';

/**
 * e2e/fixtures/api-stubs.ts — the ONLY thing this harness talks to instead
 * of a real backend (US-063 design.md D-11). Every Configuración surface
 * this change touches renders behind `_authenticated`'s `beforeLoad`
 * (`requireSession(fetchMe, …)`, `src/routes/_authenticated.tsx`), so
 * `GET /api/auth/me` must resolve successfully before ANY of these specs
 * can even reach a Configuración route — stubbing it is what lets the
 * suite skip a real login flow entirely.
 *
 * Every shape below is a literal instance of this repo's own DTOs
 * (`src/api/types.ts`), not a hand-rolled guess — a fixture drifting from
 * the real contract would make the whole suite assert against a fiction.
 *
 * `page.route` intercepts matching requests BEFORE they leave the browser,
 * so this works identically whether or not a real server is listening on
 * `vite preview`'s port — no `vite dev` proxy, no `x-api-key`, no cookie.
 */

const ME_FIXTURE = {
  userId: 'e2e-user-1',
  nombre: 'Usuaria E2E',
  email: 'e2e@moneydiary.test',
  esDemo: false,
  googleVinculado: false,
};

const CATALOGO_FIXTURE = {
  categorias: [
    {
      id: 'cat-1',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      transaccionesCount: 3,
      patrones: [
        {
          id: 'pat-1',
          categoriaId: 'cat-1',
          patron: 'LIDER',
          matchType: 'CONTAINS',
          prioridad: 100,
        },
      ],
    },
    {
      id: 'cat-2',
      nombre: 'Streaming',
      bucket: 'Deseos',
      transaccionesCount: 0,
      patrones: [],
    },
  ],
};

// GET /version of the API (cross-origin in prod, `VITE_API_BASE_URL`-based —
// `src/api/client.ts#fetchApiVersion`). No base is configured for this
// build, so the call resolves same-origin to `/version` against the preview
// server itself. Stubbed for completeness (the `ApiVersionBadge` mounted by
// `_authenticated.tsx` calls it on every Configuración route) — its absence
// would only make the badge not render (fetchApiVersion never throws), but
// leaving it unstubbed sends a real, always-404 request through the preview
// server on every spec run for no reason.
const API_VERSION_FIXTURE = {
  version: '0.0.0-e2e',
  commit: 'e2e0000',
  ref: 'e2e',
  builtAt: '2026-08-14T00:00:00.000Z',
};

export async function stubApi(page: Page): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: ME_FIXTURE }),
  );
  await page.route('**/api/categorias', (route) =>
    route.fulfill({ json: CATALOGO_FIXTURE }),
  );
  // The task list names this stub "GET /api/version" — the real endpoint
  // this app calls has no `/api` prefix (see the docblock above); stubbed
  // at its real path so the intent (the version badge's request never hits
  // the network) is honoured rather than the literal string.
  await page.route('**/version', (route) =>
    route.fulfill({ json: API_VERSION_FIXTURE }),
  );
}
