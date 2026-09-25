import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';
import type { MeDto, ResumenAnualDto, ResumenMesDto } from '@/api/types';

/**
 * Route-tree integration proof for `/` (issue #747 PR2), same pattern as
 * `semaforo-route.test.tsx`: real generated route tree, `beforeLoad`'s
 * `_authenticated` guard included for free.
 *
 * PR1 (`feat/periodo-ultimo-mes-con-datos`) changed the backend contract: an
 * absent `?periodo=` no longer resolves to "now" — it resolves to the
 * user's LAST month WITH DATA, echoed back on `ResumenMesDto.periodo`. This
 * suite pins that the CONTAINER (`routes/_authenticated/index.tsx`) reads
 * that echo instead of re-deriving "now" client-side or re-using the
 * (absent) route search param — a component test of `ResumenPage`/
 * `PeriodoSelector` alone can't catch this class of bug, since both already
 * receive whatever `periodo` their caller passes verbatim; the bug lives
 * entirely in what the ROUTE container chooses to pass.
 *
 * System clock faked to 2026-07-19 (current month `2026-07`) while the
 * stub resolves the absent `periodo` to `2026-05` — a PAST month — so any
 * assertion that would pass by accident merely because "resolved" and
 * "now" happen to coincide is ruled out.
 */
const ME_DTO: MeDto = {
  userId: 'user-1',
  email: 'usuario@moneydiary.cl',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
};

const RESUMEN_DTO: ResumenMesDto = {
  periodo: '2026-05',
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
      total: '350000',
      porcentajeBp: 3500,
      estadoSemaforo: 'amarillo',
    },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'amarillo',
};

function resumenAnualDto(): ResumenAnualDto {
  return {
    anio: 2026,
    meses: Array.from({ length: 12 }, (_, i) => ({
      ...RESUMEN_DTO,
      periodo: `2026-${String(i + 1).padStart(2, '0')}`,
      sinIngreso: true,
      estadoGlobal: null,
    })),
  };
}

function buildFetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.startsWith('/api/auth/me')) {
      return { ok: true, status: 200, json: () => Promise.resolve(ME_DTO) };
    }
    // Exact match only — no `?periodo=` query, mirroring the actual bug
    // scenario (a first-load deep link with no explicit period at all).
    if (url === '/api/resumen') {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(RESUMEN_DTO),
      };
    }
    if (url.startsWith('/api/resumen/anual')) {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(resumenAnualDto()),
      };
    }
    // Any destination page's own fetch (e.g. `/api/ingresos/mes`,
    // `/api/buckets/:bucket/detalle`) is irrelevant here — this suite only
    // asserts the NAVIGATION target (router state), never that destination
    // page's rendered content.
    return { ok: false, status: 401, json: () => Promise.resolve({}) };
  });
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe('/ (dashboard) resolves periodo from the backend echo, not the absent search param (issue #747 PR2)', () => {
  beforeEach(() => {
    // `shouldAdvanceTime: true` (same fix as `IngresosMesPage.test.tsx`'s
    // "when periodo is absent" block): the real `RouterProvider` needs
    // `waitFor`/`findBy`'s retry timers to actually fire before the route
    // component mounts — plain `vi.useFakeTimers()` freezes them too.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('labels the header with the RESOLVED month, not "now", and shows no "Mes en curso" marker for a past resolved month', async () => {
    vi.stubGlobal('fetch', buildFetchStub());
    renderApp();

    expect(await screen.findByText('mayo 2026')).toBeInTheDocument();
    expect(screen.queryByText('julio 2026')).not.toBeInTheDocument();
    expect(screen.queryByText('Mes en curso')).not.toBeInTheDocument();
  });

  it('the semáforo hero row links to /semaforo carrying the RESOLVED periodo', async () => {
    vi.stubGlobal('fetch', buildFetchStub());
    renderApp();

    const fila = await screen.findByTestId('semaforo-global');
    expect(fila).toHaveAttribute(
      'href',
      expect.stringContaining('periodo=2026-05'),
    );
  });

  it('clicking the Ingresos legend row navigates to /ingresos with the RESOLVED periodo, not undefined', async () => {
    vi.stubGlobal('fetch', buildFetchStub());
    const router = renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /Ingresos/ }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/ingresos'),
    );
    expect(router.state.location.search).toEqual({ periodo: '2026-05' });
  });

  it('clicking a bucket legend row navigates to /buckets/:bucket with the RESOLVED periodo, not undefined', async () => {
    vi.stubGlobal('fetch', buildFetchStub());
    const router = renderApp();

    // "Necesidades" is the accessible name of BOTH the pie slice and the
    // legend row (`ResumenScreen.test.tsx` documents the same doubling) —
    // wait for both to exist, then click the legend row specifically (DOM
    // order: `DistribucionPie` renders before `LeyendaGasto` in
    // `ResumenScreen`, so index 1 is the legend row).
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /Necesidades/ }),
      ).toHaveLength(2),
    );
    const [, filaLeyenda] = screen.getAllByRole('button', {
      name: /Necesidades/,
    });
    fireEvent.click(filaLeyenda);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/buckets/Necesidades'),
    );
    expect(router.state.location.search).toEqual({ periodo: '2026-05' });
  });

  it('prev/next navigation still moves relative to the RESOLVED period, not the client-derived current month', async () => {
    vi.stubGlobal('fetch', buildFetchStub());
    const router = renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Mes anterior' }),
    );

    // From the resolved 2026-05 (not from "now" = 2026-07): one month back
    // is 2026-04, never 2026-06.
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ periodo: '2026-04' }),
    );
  });
});
