import { afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { ReactNode } from 'react';
import { ResumenScreen } from './ResumenScreen';
import { aResumenViewModel } from '@/domain/resumen-view-model';
import type { ResumenViewModel } from '@/domain/resumen-view-model';
import type {
  DetalleBucketDto,
  ResumenAnualDto,
  ResumenMesDto,
} from '@/api/types';

// US-030 Slice B (tasks 30.9/30.10): the dashboard body. The old per-bucket
// `<Link>` breakdown list is gone — the pie + legend now represent that
// split, and the right panel shows the SELECTED bucket's transactions
// inline (via `BucketDetailList`, which owns its own `useDetalleBucket`
// query) instead of navigating away. A `QueryClientProvider` wrapper (not a
// router) is what these tests need now.
const viewModel: ResumenViewModel = {
  periodo: '2026-07',
  totalIngreso: '$1.000.000',
  sinIngreso: false,
  buckets: [
    {
      bucket: 'Necesidades',
      total: '$500.000',
      porcentajeLabel: '50%',
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Deseos',
      total: '$300.000',
      porcentajeLabel: '30%',
      estadoSemaforo: 'amarillo',
    },
    {
      bucket: 'Ahorro',
      total: '$200.000',
      porcentajeLabel: '20%',
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'SinCategoria',
      total: '$0',
      porcentajeLabel: '—',
      estadoSemaforo: null,
    },
  ],
  distribucionGasto: [
    { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
    { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
    { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
  ],
  // US-047 PR1 shim field (judgment-day round 2): SinCategoria total is 0 in
  // this fixture, so the renormalized reading equals the diluted one above.
  distribucionGastoInterina: [
    { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
    { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
    { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
  ],
  // Necesidades has the largest raw total among the 4 buckets — the
  // dashboard's default transactions-panel selection (task 30.10).
  bucketPorDefecto: 'Necesidades',
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
  // US-047 PR1 compile-fix: `leyendaPrincipal`/`leyendaComplemento` became
  // required fields on `ResumenViewModel` in T5 (design D-03). This fixture
  // is a hand-rolled view-model (not built via `aResumenViewModel`), so it
  // needs the two new fields added directly. T11 (Phase 4) is the task that
  // rewrites this whole fixture/suite to actually exercise the legend props
  // — this is the minimal 1-line-spirit addition to keep `tsc` green without
  // pulling that rewrite forward.
  leyendaPrincipal: [
    {
      kind: 'gasto',
      bucket: 'Necesidades',
      porcentaje: 50,
      montoLabel: '-$500.000',
    },
    {
      kind: 'gasto',
      bucket: 'Deseos',
      porcentaje: 30,
      montoLabel: '-$300.000',
    },
    {
      kind: 'gasto',
      bucket: 'Ahorro',
      porcentaje: 20,
      montoLabel: '-$200.000',
    },
  ],
  leyendaComplemento: [
    { kind: 'ingreso', montoLabel: '+$1.000.000' },
    {
      kind: 'sinCategoria',
      bucket: 'SinCategoria',
      montoLabel: '$0',
      cantidadLabel: '0 tx',
    },
  ],
};

/**
 * A REAL `ResumenMesDto` (all 4 canonical buckets, run through the actual
 * `aResumenViewModel` mapper) — unlike `viewModel` above, which is a
 * hand-rolled fixture whose `distribucionGasto` was trimmed to 3 items and
 * so could not have caught the PR1 regression: `calcularDistribucionGasto`
 * now apportions over all 4 `BUCKETS_ANILLO` members (SinCategoria
 * included, US-047 D-05), so a REAL view model's `distribucionGasto` also
 * has 4 items. Used by the shim regression test below.
 */
function resumenMesDtoReal(): ResumenMesDto {
  return {
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
}

function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mesSinDatos(periodo: string): ResumenAnualDto['meses'][number] {
  return {
    periodo,
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
    cantidadSinCategoria: 0,
  };
}

function mesConDatos(periodo: string): ResumenAnualDto['meses'][number] {
  return {
    periodo,
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
        estadoSemaforo: 'verde',
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
}

/**
 * Mocks `fetch` for both `/api/buckets/:bucket` (returning a bucket-specific
 * transaction so tests can tell WHICH bucket the transactions panel actually
 * fetched, purely by asserting on rendered text) AND `/api/resumen/anual`
 * (US-030 Slice C — `ResumenScreen` now also renders `ResumenAnual`, which
 * self-fetches). The annual DTO here is all-`sinIngreso` (renders the Empty
 * state) — this file's tests are about the 2-column section, not the annual
 * grid (see `ResumenAnual.test.tsx` for that).
 */
function mockFetchPorBucket() {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/resumen/anual')) {
      const dto: ResumenAnualDto = {
        anio: 2026,
        // Only January has data — enough to exercise the clickable-month
        // path without adding noise to this file's 2-column-section tests.
        meses: Array.from({ length: 12 }, (_, i) => {
          const periodo = `2026-${String(i + 1).padStart(2, '0')}`;
          return i === 0 ? mesConDatos(periodo) : mesSinDatos(periodo);
        }),
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dto),
      });
    }
    const match = /\/api\/buckets\/([^/?]+)/.exec(url);
    const bucket = match ? decodeURIComponent(match[1]) : 'desconocido';
    const dto: DetalleBucketDto = {
      periodo: '2026-07',
      bucket,
      transacciones: [
        {
          id: `tx-${bucket}`,
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: `Movimiento de ${bucket}`,
          cargo: '1000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
          categoria: null,
        },
      ],
    };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dto),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderScreen(
  vm: ResumenViewModel = viewModel,
  onPeriodoChange: (periodo: string) => void = vi.fn(),
) {
  return render(
    <ResumenScreen viewModel={vm} onPeriodoChange={onPeriodoChange} />,
    { wrapper: crearWrapper() },
  );
}

describe('ResumenScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders totalIngreso formatted exactly as received (spec W1-01)', () => {
    mockFetchPorBucket();
    renderScreen();
    expect(screen.getByText('$1.000.000')).toBeInTheDocument();
  });

  // A11y (ADR-018): the document must start at a page-level <h1> instead of
  // jumping straight to <h2> — a broken heading outline confuses assistive
  // technology users navigating by heading. Reusing `BucketDetailList` for
  // the right panel must not introduce a SECOND <h1> (it demotes to <h2>).
  it('renders exactly one page-level <h1> heading', async () => {
    mockFetchPorBucket();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // "Necesidades"/"Gustos"/"Ahorro" are each selectable in TWO places (pie
  // slice + legend row, both wired to the same `onSelectBucket`) — hence
  // `getAllByRole` here. "Sin categoría" has no pie slice (excluded from
  // `distribucionGastoInterina` by design, still true at this PR2 boundary
  // — the pie's real 4-wedge rewire is T11), only a legend row.
  //
  // US-047 PR2 interim query fix (T11 will do the full accessible-name
  // rename per its own task text — this is only enough to keep this
  // pre-existing suite correct at the PR2 boundary): the pie wedge's
  // `aria-label` stayed a concise bucket name ("Necesidades"), but the
  // legend row's accessible name now includes its content (D-08 deliberate
  // `aria-label` removal, T7) — e.g. "Necesidades 50% -$500.000". A
  // `^Necesidades\b` prefix match still counts BOTH controls without
  // hardcoding the fixture's exact percentage/amount text here.
  it('renders the "Distribución del gasto" pie + legend, with SinCategoria selectable though outside the pie (spec W1-02, task 30.9/30.10)', () => {
    mockFetchPorBucket();
    renderScreen();
    // FIX 2 (WCAG 4.1.2): the interactive main pie is a "group", not an
    // "img" — role="img" would flatten the slice buttons below it.
    expect(
      screen.getByRole('group', { name: 'Distribución del gasto' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Necesidades\b/ }),
    ).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Gustos\b/ })).toHaveLength(
      2,
    );
    expect(screen.getAllByRole('button', { name: /^Ahorro\b/ })).toHaveLength(
      2,
    );
    expect(
      screen.getAllByRole('button', { name: /^Sin categoría\b/ }),
    ).toHaveLength(1);
  });

  // Regression test (judgment-day PR1 fix, updated for PR2/T7): a REAL
  // `distribucionGasto` (built via `aResumenViewModel`, not the hand-rolled
  // `viewModel` fixture above) now has 4 items (SinCategoria included,
  // US-047 D-05). Before the `tajadasInterinas` shim, the OLD
  // `entradasLeyenda` spread that 4-item array AND manually appended a
  // SECOND SinCategoria row — a duplicate legend row sharing the same React
  // `key`, which triggered a duplicate-key console warning. `LeyendaGasto`
  // now renders 5 rows total (3 `leyendaPrincipal` + Ingresos +
  // SinCategoria from `leyendaComplemento`, T7/WG5-03) — the count changed
  // from 4→5 because Ingresos moved INSIDE `LeyendaGasto`'s own rendered
  // rows (it used to live only in `IngresoCard`); this asserts the
  // duplicate-row/duplicate-key symptom stays gone under the new shape.
  it('renders exactly 5 legend rows (3 gasto + Ingresos + Sin categoría, no duplicate) from a REAL view model, without a React duplicate-key warning (PR1/PR2 shim regression)', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockFetchPorBucket();
    const vmReal = aResumenViewModel(resumenMesDtoReal());

    renderScreen(vmReal);

    expect(screen.getAllByTestId('leyenda-item')).toHaveLength(5);
    expect(
      screen.getAllByRole('button', { name: /^Sin categoría\b/ }),
    ).toHaveLength(1);
    for (const mensaje of consoleErrorSpy.mock.calls.map((call) => call[0])) {
      expect(String(mensaje)).not.toContain('same key');
    }
    consoleErrorSpy.mockRestore();
  });

  it('renders the global semáforo (spec W2-01) with a distinct testID anchor', () => {
    mockFetchPorBucket();
    renderScreen();
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument();
    expect(
      screen.getAllByRole('img', { name: 'Verde' }).length,
    ).toBeGreaterThan(0);
  });

  it('defaults the transactions panel to the bucket with the largest total (task 30.10)', async () => {
    mockFetchPorBucket();
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );
    for (const boton of screen.getAllByRole('button', {
      name: 'Necesidades',
    })) {
      expect(boton).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('clicking a different legend/slice row switches the transactions panel to that bucket', async () => {
    mockFetchPorBucket();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );

    // Click the legend row (last of the two "Gustos" controls in DOM order —
    // pie slice, then legend).
    const botonesGustos = screen.getAllByRole('button', { name: 'Gustos' });
    fireEvent.click(botonesGustos[botonesGustos.length - 1]);

    await waitFor(() =>
      expect(screen.getByText('Movimiento de Deseos')).toBeInTheDocument(),
    );
    for (const boton of screen.getAllByRole('button', { name: 'Gustos' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'true');
    }
    for (const boton of screen.getAllByRole('button', {
      name: 'Necesidades',
    })) {
      expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('SinCategoria is selectable via the legend even though it has no pie slice', async () => {
    mockFetchPorBucket();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );

    // US-047 PR2 interim query fix (see the comment on the button-count
    // test above): the legend row's accessible name now includes its
    // `cantidadLabel`/amount (D-08), so an exact "Sin categoría" match no
    // longer resolves.
    fireEvent.click(screen.getByRole('button', { name: /^Sin categoría\b/ }));

    await waitFor(() =>
      expect(
        screen.getByText('Movimiento de SinCategoria'),
      ).toBeInTheDocument(),
    );
  });

  // FIX 5: an explicit selection must not leak into the next month — when
  // `periodo` changes, the panel resets to THAT month's own default bucket.
  it("resets the bucket selection to the new month's own default when periodo changes (FIX 5)", async () => {
    mockFetchPorBucket();
    const { rerender } = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );

    // Explicit selection away from the default.
    const botonesGustos = screen.getAllByRole('button', { name: 'Gustos' });
    fireEvent.click(botonesGustos[botonesGustos.length - 1]);
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Deseos')).toBeInTheDocument(),
    );

    // periodo changes — the new month's default bucket is Ahorro this time.
    const nuevoViewModel: ResumenViewModel = {
      ...viewModel,
      periodo: '2026-08',
      bucketPorDefecto: 'Ahorro',
    };
    rerender(
      <ResumenScreen viewModel={nuevoViewModel} onPeriodoChange={vi.fn()} />,
    );

    await waitFor(() =>
      expect(screen.getByText('Movimiento de Ahorro')).toBeInTheDocument(),
    );
    for (const boton of screen.getAllByRole('button', { name: 'Ahorro' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'true');
    }
    for (const boton of screen.getAllByRole('button', { name: 'Gustos' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
  });

  // US-030 Slice C (task 30.12): the annual grid renders below the 2-column
  // section, deriving its year from the currently selected periodo and
  // reusing the SAME period-setting path (`onPeriodoChange`) the dashboard
  // already threads from the route — no new navigation mechanism.
  it('renders the annual summary below, deriving the year from the selected periodo', async () => {
    mockFetchPorBucket();
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText('Resumen Anual 2026')).toBeInTheDocument(),
    );
  });

  // Phase 4 mobile audit (WDS-04): jsdom doesn't evaluate CSS, so this locks
  // in the responsive Tailwind classes directly — an accidental removal of
  // the mobile margin or the desktop column switch fails this test loudly,
  // same pattern PR2 used for the shell (AppShell.test.tsx).
  it('reflows single-column with 16px page margins on mobile, multi-column on lg+ (Phase 4 mobile audit, WDS-04)', () => {
    mockFetchPorBucket();
    const { container } = renderScreen();

    const paginaRaiz = container.firstElementChild as HTMLElement;
    // p-4 = 16px side margins around the whole dashboard body.
    expect(paginaRaiz.className).toMatch(/\bp-4\b/);

    const seccionDosColumnas = container.querySelector('.grid') as HTMLElement;
    expect(seccionDosColumnas).toBeInTheDocument();
    expect(seccionDosColumnas.className).toMatch(/\bgrid-cols-1\b/);
    expect(seccionDosColumnas.className).toMatch(/\blg:grid-cols-2\b/);
  });

  it('wires ResumenAnual month clicks to the same onPeriodoChange callback', async () => {
    const onPeriodoChange = vi.fn();
    mockFetchPorBucket();
    renderScreen(viewModel, onPeriodoChange);

    const boton = await screen.findByRole('button', { name: 'Ver enero 2026' });
    fireEvent.click(boton);

    expect(onPeriodoChange).toHaveBeenCalledWith('2026-01');
  });
});
