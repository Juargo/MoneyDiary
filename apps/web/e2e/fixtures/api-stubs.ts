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

/**
 * `GET /api/resumen` (US-047 T15, design §4.3) — a literal `ResumenMesDto`
 * instance (`src/api/types.ts`) with a NONZERO total in all 4
 * `BUCKETS_ANILLO` items and a nonzero `totalIngreso`, so the dashboard
 * chart's non-empty-state markup renders: the 4-wedge donut ring, all 5
 * legend rows (3 spend + divider + Ingresos/Sin categoría), and the T1 grid
 * body — `ResumenPage` renders `<Empty />` instead whenever
 * `sinIngreso: true`, so this MUST stay `false` for `dashboard-donut.e2e.ts`
 * to exercise anything.
 */
const RESUMEN_MES_FIXTURE = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    {
      bucket: 'Necesidades',
      total: '400000',
      porcentajeBp: 4000,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Deseos',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Ahorro',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'SinCategoria',
      total: '100000',
      porcentajeBp: 1000,
      estadoSemaforo: null,
    },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
  cantidadSinCategoria: 2,
};

/**
 * `GET /api/resumen/anual` (US-047 T15) — a minimal 12-month
 * `ResumenAnualDto`; each month reuses `RESUMEN_MES_FIXTURE`'s own shape
 * (design §5's "reuses the same per-month shape" note) with its own
 * `periodo`. `ResumenAnual` self-fetches this on every dashboard render
 * (`ResumenScreen` → `ResumenAnual`), so it must resolve for the donut
 * spec's page to settle, even though this spec asserts nothing about the
 * annual grid itself.
 */
const RESUMEN_ANUAL_FIXTURE = {
  anio: 2026,
  meses: Array.from({ length: 12 }, (_, i) => ({
    ...RESUMEN_MES_FIXTURE,
    periodo: `2026-${String(i + 1).padStart(2, '0')}`,
  })),
};

/**
 * `GET /api/buckets/:bucket` (US-047 T15) — a minimal `DetalleBucketDto`,
 * empty `transacciones` (task's own stated sufficiency: "this stub only
 * needs to keep the transactions panel from erroring, not to assert on its
 * content"). `bucket` echoes the requested segment so a real bucket name
 * always round-trips, even though `dashboard-donut.e2e.ts` never asserts on
 * the transactions panel.
 */
function detalleBucketFixture(bucket: string) {
  return {
    bucket,
    periodo: '2026-07',
    transacciones: [],
  };
}

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
  // Trailing `*` (not `**`) after `resumen` — matches with/without a
  // `?periodo=` query (`*` excludes `/`, so this never swallows
  // `/api/resumen/anual`'s own `/anual` path segment).
  await page.route('**/api/resumen*', (route) =>
    route.fulfill({ json: RESUMEN_MES_FIXTURE }),
  );
  await page.route('**/api/resumen/anual*', (route) =>
    route.fulfill({ json: RESUMEN_ANUAL_FIXTURE }),
  );
  await page.route('**/api/buckets/**', (route) => {
    const match = /\/api\/buckets\/([^/?]+)/.exec(route.request().url());
    const bucket = match ? decodeURIComponent(match[1]) : 'desconocido';
    route.fulfill({ json: detalleBucketFixture(bucket) });
  });
}
