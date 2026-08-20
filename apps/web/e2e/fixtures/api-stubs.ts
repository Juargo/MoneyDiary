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
/**
 * US-048 PR5 (design §6.4, edit 2/2): months August-December render as
 * `sinIngreso` (zeroed buckets, `estadoGlobal: null`) so `annual-grid.e2e.ts`
 * exercises BOTH branches of a real cell — data and disabled — at a real
 * viewport, mirroring `ResumenAnual.test.tsx`'s own `mesSinDatos` shape.
 * Only 5 of 12 months, not all: an all-`sinIngreso` year would trip
 * `ResumenAnual`'s Empty state, and `dashboard-donut.e2e.ts` (which reuses
 * this same fixture) needs the grid rendered too.
 */
function mesDelAnio(mesNumero: number) {
  const periodo = `2026-${String(mesNumero).padStart(2, '0')}`;
  if (mesNumero < 8) {
    return { ...RESUMEN_MES_FIXTURE, periodo };
  }
  return {
    ...RESUMEN_MES_FIXTURE,
    periodo,
    sinIngreso: true,
    totalIngreso: '0',
    estadoGlobal: null,
    buckets: RESUMEN_MES_FIXTURE.buckets.map((bucket) => ({
      ...bucket,
      total: '0',
      porcentajeBp: null,
      estadoSemaforo: null,
    })),
  };
}

const RESUMEN_ANUAL_FIXTURE = {
  anio: 2026,
  meses: Array.from({ length: 12 }, (_, i) => mesDelAnio(i + 1)),
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

/**
 * `GET /api/buckets/:bucket/detalle` (US-051 MBD-01..08, consumido por
 * US-053 T-20) — a literal `DetalleBucketMesDto` instance
 * (`src/api/types.ts`) for `bucket-detalle-mes.e2e.ts`: bucket `Deseos`
 * echoing the requested segment, 2 groups — Paseos with 4 transactions
 * (exercises the WDM-03 `ver 1 más…` slice) and "Sin categoría" with 2
 * (`categoriaId: null`, so the WDM-04 `destacar` highlight has a target) —
 * and non-null `porcentajeBp`/`metaBp` so the WDM-01 header renders its
 * %/meta tag and usage bar. The route handler echoes the requested
 * `bucket`/`periodo` and zeroes `porcentajeBp`/`metaBp` for
 * `/buckets/SinCategoria` (MBD-03/WDM-04).
 */
const DETALLE_BUCKET_MES_FIXTURE = {
  periodo: '2026-07',
  bucket: 'Deseos',
  total: '250000',
  totalTransacciones: 6,
  totalCategorias: 2,
  porcentajeBp: 2500,
  metaBp: 3000,
  grupos: [
    {
      categoriaId: 'cat-paseos',
      nombre: 'Paseos',
      subtotal: '200000',
      conteo: 4,
      transacciones: [
        {
          id: 'tx-p1',
          fecha: '2026-07-02T00:00:00.000Z',
          descripcion: 'Uber',
          monto: '50000',
        },
        {
          id: 'tx-p2',
          fecha: '2026-07-06T00:00:00.000Z',
          descripcion: 'Metro',
          monto: '50000',
        },
        {
          id: 'tx-p3',
          fecha: '2026-07-11T00:00:00.000Z',
          descripcion: 'RedBike',
          monto: '50000',
        },
        {
          id: 'tx-p4',
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Taxi',
          monto: '50000',
        },
      ],
    },
    {
      categoriaId: null,
      nombre: 'Sin categoría',
      subtotal: '50000',
      conteo: 2,
      transacciones: [
        {
          id: 'tx-s1',
          fecha: '2026-07-03T00:00:00.000Z',
          descripcion: 'Giro',
          monto: '25000',
        },
        {
          id: 'tx-s2',
          fecha: '2026-07-14T00:00:00.000Z',
          descripcion: 'Transferencia',
          monto: '25000',
        },
      ],
    },
  ],
};

/**
 * `GET /api/resumen/semaforo` (US-049 T7.8, design §1.7) — a literal
 * `SemaforoDetalleDto` instance (`src/api/types.ts`): a Necesidades bucket
 * over its band (Amarillo, with `consejo`), Deseos/Ahorro in Verde (no
 * advice), and a nonzero Sin categoría count so
 * `semaforo-detalle.e2e.ts` exercises the header, all 3 cards, the zone
 * bar, and the advice row at a real viewport.
 */
const SEMAFORO_DETALLE_FIXTURE = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  estadoGlobal: 'amarillo',
  diagnostico: 'Tu mes está en amarillo por Necesidades.',
  bucketsCriticos: ['Necesidades'],
  buckets: [
    {
      bucket: 'Necesidades',
      total: '550000',
      porcentajeBp: 5500,
      estadoSemaforo: 'amarillo',
      metaBp: 5000,
      bandas: {
        verdeMin: null,
        verdeMax: 5000,
        amarilloMin: null,
        amarilloMax: 6000,
      },
      consejo: {
        direccion: 'reducir',
        monto: '50049',
        mensaje: 'Para volver a Verde, reduce {monto} en Necesidades este mes.',
      },
    },
    {
      bucket: 'Deseos',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
      metaBp: 3000,
      bandas: {
        verdeMin: null,
        verdeMax: 3000,
        amarilloMin: null,
        amarilloMax: 4000,
      },
      consejo: null,
    },
    {
      bucket: 'Ahorro',
      total: '200000',
      porcentajeBp: 2000,
      estadoSemaforo: 'verde',
      metaBp: 2000,
      bandas: {
        verdeMin: 2000,
        verdeMax: 4000,
        amarilloMin: 1000,
        amarilloMax: 5000,
      },
      consejo: null,
    },
  ],
  sinCategoria: { cantidad: 2, total: '15000' },
};

// GET /api/ingresos/mes (US-054 T-13) — a literal IngresosMesDto instance
// (src/api/types.ts) with 3 transactions: BCI, Manual, and BancoEstado — so
// ingresos-mes.e2e.ts exercises 3 distinct Origen badge variants at a real
// viewport. For the pinned empty month 2026-05 the handler returns zeros —
// exercises WDI-04 Empty state.
const INGRESOS_MES_FIXTURE = {
  conteo: 3,
  total: '1500000',
  transacciones: [
    {
      id: 'ing-1',
      fecha: '2026-07-05T00:00:00.000Z',
      descripcion: 'Pago nómina',
      origen: 'BCI',
      monto: '1000000',
    },
    {
      id: 'ing-2',
      fecha: '2026-07-12T00:00:00.000Z',
      descripcion: 'Honorarios',
      origen: 'Manual',
      monto: '300000',
    },
    {
      id: 'ing-3',
      fecha: '2026-07-20T00:00:00.000Z',
      descripcion: 'Dividendo',
      origen: 'BancoEstado',
      monto: '200000',
    },
  ],
};

// DETALLE_BUCKET_MES_FIXTURE_SIN_TX_P1: the detalle fixture with the first
// Paseos row (tx-p1, 'Uber') removed. The detalle GET handler serves this
// after the PATCH fires, simulating the server removing the reclassified row
// from its original group on the next refetch (T-08 row-disappearance assert).
const DETALLE_BUCKET_MES_FIXTURE_SIN_TX_P1 = {
  ...DETALLE_BUCKET_MES_FIXTURE,
  totalTransacciones: 5,
  grupos: [
    {
      ...DETALLE_BUCKET_MES_FIXTURE.grupos[0],
      conteo: 3,
      subtotal: '150000',
      transacciones:
        DETALLE_BUCKET_MES_FIXTURE.grupos[0].transacciones.slice(1),
    },
    DETALLE_BUCKET_MES_FIXTURE.grupos[1],
  ],
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
  // Trailing `*` (not `**`) after `resumen` — matches with/without a
  // `?periodo=` query (`*` excludes `/`, so this never swallows
  // `/api/resumen/anual`'s own `/anual` path segment).
  //
  // US-048 PR5 (design §6.4, edit 1/2): echoes the requested `?periodo=`
  // into the returned DTO's `periodo` field, falling back to the fixture's
  // own `2026-07` when absent — needed so clicking a month in the annual
  // grid (`E-02`) actually moves `viewModel.periodo`, not just the URL.
  // `dashboard-donut.e2e.ts` never sends a `?periodo=`, so it keeps
  // resolving `2026-07` — its existing, unchanged behavior (D-15).
  await page.route('**/api/resumen*', (route) => {
    const periodo =
      new URL(route.request().url()).searchParams.get('periodo') ??
      RESUMEN_MES_FIXTURE.periodo;
    route.fulfill({ json: { ...RESUMEN_MES_FIXTURE, periodo } });
  });
  await page.route('**/api/resumen/anual*', (route) =>
    route.fulfill({ json: RESUMEN_ANUAL_FIXTURE }),
  );
  await page.route('**/api/buckets/**', (route) => {
    const match = /\/api\/buckets\/([^/?]+)/.exec(route.request().url());
    const bucket = match ? decodeURIComponent(match[1]) : 'desconocido';
    route.fulfill({ json: detalleBucketFixture(bucket) });
  });
  // US-053 T-20: the GROUPED route MUST be registered AFTER the flat
  // `**/api/buckets/**` stub above — Playwright matches routes in REVERSE
  // registration order (LIFO, last-registered-wins), so the later, more
  // specific pattern is tried first for `/api/buckets/:bucket/detalle`
  // requests; the flat stub remains the fallback for any other
  // `/api/buckets/*` path (the flat web chain is retired in T-18, so
  // nothing requests it — the stub stays as harmless documentation).
  await page.route('**/api/buckets/*/detalle*', (route) => {
    const url = new URL(route.request().url());
    const match = /\/api\/buckets\/([^/?]+)\/detalle/.exec(url.pathname);
    const bucket = match ? decodeURIComponent(match[1]) : 'Deseos';
    const periodo =
      url.searchParams.get('periodo') ?? DETALLE_BUCKET_MES_FIXTURE.periodo;
    const sinCategoria = bucket === 'SinCategoria';
    route.fulfill({
      json: {
        ...DETALLE_BUCKET_MES_FIXTURE,
        bucket,
        periodo,
        // MBD-03/WDM-04: SinCategoria arrives with null `porcentajeBp`/
        // `metaBp` and only its uncategorized group — the page then renders
        // no %/meta tag and no usage bar (D-02), with a single group for
        // the `destacar` highlight to land on.
        ...(sinCategoria && {
          porcentajeBp: null,
          metaBp: null,
          total: '50000',
          totalTransacciones: 2,
          totalCategorias: 1,
          grupos: [DETALLE_BUCKET_MES_FIXTURE.grupos[1]],
        }),
      },
    });
  });
  // US-054 T-13: `**/api/ingresos/mes*` — no collision with any existing stub.
  // Playwright's `*` does not cross `/`, so `**/api/resumen*` and
  // `**/api/buckets/**` can never match `/api/ingresos/mes`; registration
  // order is therefore irrelevant for this route. Position recorded here for
  // reader orientation only (WDI-08). The handler returns zeroes for the
  // pinned empty month `2026-05` (exercises WDI-04).
  await page.route('**/api/ingresos/mes*', (route) => {
    const url = new URL(route.request().url());
    const periodo = url.searchParams.get('periodo') ?? '2026-07';
    if (periodo === '2026-05') {
      route.fulfill({
        json: { conteo: 0, total: '0', transacciones: [] },
      });
      return;
    }
    route.fulfill({
      json: { ...INGRESOS_MES_FIXTURE },
    });
  });
  // US-055 T-08: stateful stub for the reclassify flow.
  // `detallePatchFired` gates the detalle GET handler so the refetch after
  // the PATCH serves the fixture WITHOUT the reclassified row — proving the
  // row-disappearance assertion (T-08 step 5) against a realistic stub.
  let detallePatchFired = false;

  // PATCH /api/transacciones/:id/categoria — the reclassify mutation.
  // Returns a valid ReclasificarCategoriaDto so the client-side validator
  // (esReclasificarCategoriaDto in client.ts) passes and the mutation's
  // onSuccess fires. Sets `detallePatchFired = true` so the next detalle
  // GET serves the modified fixture (row removed).
  await page.route('**/api/transacciones/*/categoria', (route) => {
    if (route.request().method() !== 'PATCH') {
      void route.continue();
      return;
    }
    detallePatchFired = true;
    route.fulfill({
      status: 200,
      json: {
        id: 'tx-p1',
        categoria: { id: 'cat-2', nombre: 'Streaming' },
        bucket: 'Deseos',
      },
    });
  });

  // Override the detalle GET handler registered above: re-register it AFTER
  // the PATCH stub so Playwright (LIFO) tries this handler first. When
  // `detallePatchFired` is true and the bucket matches Necesidades, serves
  // the fixture with the reclassified row removed; otherwise delegates to
  // the earlier registration via continue() — but since page.route() with
  // the same pattern replaces the prior handler in practice, we reproduce
  // the full handler logic here for the Necesidades path.
  await page.route('**/api/buckets/*/detalle*', (route) => {
    const url = new URL(route.request().url());
    const match = /\/api\/buckets\/([^/?]+)\/detalle/.exec(url.pathname);
    const bucket = match ? decodeURIComponent(match[1]) : 'Deseos';
    const periodo =
      url.searchParams.get('periodo') ?? DETALLE_BUCKET_MES_FIXTURE.periodo;
    const sinCategoria = bucket === 'SinCategoria';

    if (detallePatchFired && bucket === 'Necesidades') {
      // After the PATCH: serve the Necesidades fixture without 'Uber' (tx-p1),
      // the row the e2e test reclassifies to a Deseos categoría.
      route.fulfill({
        json: {
          ...DETALLE_BUCKET_MES_FIXTURE_SIN_TX_P1,
          bucket,
          periodo,
        },
      });
      return;
    }

    route.fulfill({
      json: {
        ...DETALLE_BUCKET_MES_FIXTURE,
        bucket,
        periodo,
        ...(sinCategoria && {
          porcentajeBp: null,
          metaBp: null,
          total: '50000',
          totalTransacciones: 2,
          totalCategorias: 1,
          grupos: [DETALLE_BUCKET_MES_FIXTURE.grupos[1]],
        }),
      },
    });
  });
  // US-049 T7.8: a DISTINCT route from `**/api/resumen*` above — Playwright's
  // `*` does not cross `/`, so `**/api/resumen*` never matches
  // `/api/resumen/semaforo` (same reasoning already documented for
  // `/api/resumen/anual`'s own coexisting stub, no ordering hazard).
  await page.route('**/api/resumen/semaforo*', (route) => {
    const periodo =
      new URL(route.request().url()).searchParams.get('periodo') ??
      SEMAFORO_DETALLE_FIXTURE.periodo;
    route.fulfill({ json: { ...SEMAFORO_DETALLE_FIXTURE, periodo } });
  });
}
