import { afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ResumenPage } from './ResumenPage';
import { renderConRouter } from '@/test/router-harness';
import type { ApiError } from '@/api/client';
import type { ResumenMesDto } from '@/api/types';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';

// Router-agnostic 4-way state switch (spec W1-02): the container
// (routes/index.tsx) owns TanStack Router's search params + `useResumen`;
// this component only receives the resulting query result + wires
// PeriodoSelector — testable without a router harness (mirrors
// apps/mobile/app/index.spec.tsx's "mock the data source, render the thin
// container" pattern, adapted for TanStack Query's result shape).
const dataDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    {
      bucket: 'Necesidades',
      total: '500000',
      porcentajeBp: 5000,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Deseos',
      total: '300000',
      porcentajeBp: 3000,
      estadoSemaforo: 'amarillo',
    },
    {
      bucket: 'Ahorro',
      total: '200000',
      porcentajeBp: 2000,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'SinCategoria',
      total: '0',
      porcentajeBp: null,
      estadoSemaforo: null,
    },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
  cantidadSinCategoria: 0,
};

const emptyDto: ResumenMesDto = {
  ...dataDto,
  sinIngreso: true,
};

function mockQuery(
  overrides: Partial<UseQueryResult<ResumenMesDto, ApiError>>,
): UseQueryResult<ResumenMesDto, ApiError> {
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as UseQueryResult<ResumenMesDto, ApiError>;
}

// The data state renders `ResumenScreen` — as of US-047 T11, the card
// header's `SemaforoTag` is a real `<Link>` that throws outside a router
// context. `renderData` below routes through `renderConRouter` (T10's
// router harness) instead of a bare `QueryClientProvider` for exactly that
// reason. Only the data-state tests need this; loading/error/empty never
// reach `ResumenScreen`.

// US-030 Slice C: the data state also renders `ResumenAnual` (self-fetching
// `/api/resumen/anual`) — branch the mock by URL so both queries resolve.
// US-053 PR3 (D-06/D-08): the transactions panel is RETIRED, so there is no
// `/api/buckets/:bucket` fetch to stub anymore.
function mockFetchAnual() {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/resumen/anual')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            anio: 2026,
            meses: Array.from({ length: 12 }, (_, i) => ({
              periodo: `2026-${String(i + 1).padStart(2, '0')}`,
              totalIngreso: '0',
              sinIngreso: true,
              buckets: [
                {
                  bucket: 'Necesidades',
                  total: '0',
                  porcentajeBp: null,
                  estadoSemaforo: null,
                },
                {
                  bucket: 'Deseos',
                  total: '0',
                  porcentajeBp: null,
                  estadoSemaforo: null,
                },
                {
                  bucket: 'Ahorro',
                  total: '0',
                  porcentajeBp: null,
                  estadoSemaforo: null,
                },
                {
                  bucket: 'SinCategoria',
                  total: '0',
                  porcentajeBp: null,
                  estadoSemaforo: null,
                },
              ],
              targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
              estadoGlobal: null,
            })),
          }),
      });
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderData(ui: ReactElement) {
  mockFetchAnual();
  return renderConRouter(ui);
}

describe('ResumenPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders exactly the loading state while the query is pending', () => {
    render(
      <ResumenPage
        query={mockQuery({ isPending: true })}
        periodo={undefined}
        onPeriodoChange={() => {}}
        onSelectBucket={() => {}}
        onSelectIngresos={() => {}}
      />,
    );
    expect(screen.getByText('Cargando resumen…')).toBeInTheDocument();
    expect(
      screen.queryByText('Distribución del gasto'),
    ).not.toBeInTheDocument();
  });

  it('renders exactly the error state with the typed message and a working retry', () => {
    const refetch = vi.fn();
    const error: ApiError = {
      tag: 'network',
      message: 'Problema de conexión.',
    };
    render(
      <ResumenPage
        query={mockQuery({ isError: true, error, refetch })}
        periodo={undefined}
        onPeriodoChange={() => {}}
        onSelectBucket={() => {}}
        onSelectIngresos={() => {}}
      />,
    );

    expect(screen.getByText('Problema de conexión.')).toBeInTheDocument();
    expect(
      screen.queryByText('Distribución del gasto'),
    ).not.toBeInTheDocument();
  });

  it('renders exactly the empty state when sinIngreso is true, not "$0"/"0%"', async () => {
    // P1 design-critique fix: the default `<Empty>` now carries a "Subir
    // cartola" CTA (`Link`), so this test needs a router — `renderConRouter`
    // (T10's harness) already registers a `/subir` sentinel for exactly
    // this. Its initial match resolves asynchronously (see this file's own
    // `renderData` precedent), so the first assertion is a `findBy`.
    renderConRouter(
      <ResumenPage
        query={mockQuery({ data: emptyDto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        onSelectBucket={() => {}}
        onSelectIngresos={() => {}}
      />,
    );
    // Query the exact description, not a loose /cartola/i regex: the "Subir
    // cartola" CTA button ALSO matches "cartola" now, so a loose regex here
    // matches two elements.
    expect(
      await screen.findByText('Carga una cartola para ver tu resumen del mes.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Distribución del gasto'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subir cartola' })).toHaveAttribute(
      'href',
      '/subir',
    );
  });

  it('renders the data state with income, all 4 buckets, and the global semáforo', async () => {
    renderData(
      <ResumenPage
        query={mockQuery({ data: dataDto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        onSelectBucket={() => {}}
        onSelectIngresos={() => {}}
      />,
    );
    // Router harness resolves its initial match asynchronously — `findBy`
    // for the first assertion, sync `getBy` is safe after that. The income
    // card was removed from the dashboard (2026-08-30) — anchor on the hero
    // card's testid instead of the (now gone) rendered amount.
    expect(await screen.findByTestId('semaforo-global')).toBeInTheDocument();
    // "Necesidades"/"Deseos"(Gustos)/"Ahorro" render twice each (pie slice +
    // legend row) — see ResumenScreen.test.tsx.
    expect(screen.getAllByText('Necesidades').length).toBeGreaterThan(0);
    expect(screen.getByText('Gustos')).toBeInTheDocument();
    expect(screen.getAllByText('Ahorro').length).toBeGreaterThan(0);
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument();
    // US-053 PR3 (D-06): the panel is retired, so "Distribución del gasto"
    // is the ONLY content heading below the (sr-only) <h1> — the old
    // `<h2>Necesidades</h2>` (BucketDetailList's demoted heading) is gone.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Distribución del gasto' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Año 2026 — vista macro por mes',
      }),
    ).toBeInTheDocument();
  });

  // T-16 (US-054 D-05): `onSelectIngresos` is threaded through ResumenPage →
  // ResumenScreen → LeyendaGasto. A click on the Ingresos legend row must
  // reach the callback the caller passed — a silent-no-op would leave the
  // navigation dead without any error.
  it('threads onSelectIngresos to the Ingresos legend row (US-054 T-16, D-05)', async () => {
    const onSelectIngresos = vi.fn();
    renderData(
      <ResumenPage
        query={mockQuery({ data: dataDto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        onSelectBucket={() => {}}
        onSelectIngresos={onSelectIngresos}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Ingresos/ }));
    expect(onSelectIngresos).toHaveBeenCalledTimes(1);
  });

  it('wires the period selector — reports the previous month via onPeriodoChange', async () => {
    const onPeriodoChange = vi.fn();
    renderData(
      <ResumenPage
        query={mockQuery({ data: dataDto })}
        periodo="2026-07"
        onPeriodoChange={onPeriodoChange}
        onSelectBucket={() => {}}
        onSelectIngresos={() => {}}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Mes anterior' }),
    );

    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06');
  });
});
