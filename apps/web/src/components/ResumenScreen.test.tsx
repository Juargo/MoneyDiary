import { afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { ResumenScreen } from './ResumenScreen';
import { renderConRouter } from '@/test/router-harness';
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
// query) instead of navigating away.
//
// US-047 T11/PR3 (design §4.4): `renderScreen` now routes through
// `renderConRouter` (T10's minimal memory-router harness) instead of a bare
// `QueryClientProvider` — the card header renders `SemaforoTag` (T9), which
// is a real `<Link>` and throws without router context. One helper change,
// not twelve per-test edits.
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
  // US-047 T11/PR3: the real 4-item ring (`BUCKETS_ANILLO`) — SinCategoria's
  // total is $0 in this fixture, so its share is 0% and the three spend
  // shares are undiluted (50/30/20 — the same values the removed PR1 shim
  // `distribucionGastoInterina` used to compute separately).
  distribucionGasto: [
    { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
    { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
    { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
    { bucket: 'SinCategoria', porcentaje: 0, fraccion: 0 },
  ],
  // Necesidades has the largest raw total among the 4 buckets — the
  // dashboard's default transactions-panel selection (task 30.10).
  bucketPorDefecto: 'Necesidades',
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
  // `leyendaPrincipal`/`leyendaComplemento` (T5, D-03) — a hand-rolled
  // view-model (not built via `aResumenViewModel`), so these are written out
  // directly; values match `distribucionGasto`/`buckets` above exactly
  // (SinCategoria's 0% share doesn't dilute the three spend percentages).
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
  return renderConRouter(
    <ResumenScreen viewModel={vm} onPeriodoChange={onPeriodoChange} />,
  );
}

describe('ResumenScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // `findByText` (not `getByText`): the router harness resolves its initial
  // match asynchronously (T10's own docblock/`SemaforoTag.test.tsx`'s
  // precedent) — the content isn't in the DOM on the synchronous first
  // render even for a loader-free route.
  it('renders totalIngreso formatted exactly as received (spec W1-01)', async () => {
    mockFetchPorBucket();
    renderScreen();
    expect(await screen.findByText('$1.000.000')).toBeInTheDocument();
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
  // `getAllByRole` here. As of T11/PR3, "Sin categoría" JOINS them: it is
  // now the ring's 4th wedge (WG5-01, `conInterior`) in addition to its
  // pre-existing legend row — 1→2, same shape as the three spend buckets.
  //
  // The pie wedge's `aria-label` stays a concise bucket name ("Necesidades"),
  // while the legend row's accessible name includes its content (D-08
  // deliberate `aria-label` removal, T7) — e.g. "Necesidades 50%
  // -$500.000". A `^Necesidades\b` prefix match counts BOTH controls
  // without hardcoding the fixture's exact percentage/amount text here.
  it('renders the "Distribución del gasto" pie + legend, with Sin categoría now selectable via both its wedge and its legend row (spec W1-02, WG5-01, task 30.9/30.10)', async () => {
    mockFetchPorBucket();
    renderScreen();
    // FIX 2 (WCAG 4.1.2): the interactive main pie is a "group", not an
    // "img" — role="img" would flatten the slice buttons below it.
    expect(
      await screen.findByRole('group', { name: 'Distribución del gasto' }),
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
    ).toHaveLength(2);
  });

  // Regression test (judgment-day PR1 fix, updated for PR2/T7 and PR3/T11):
  // a REAL `distribucionGasto` (built via `aResumenViewModel`, not the
  // hand-rolled `viewModel` fixture above) has 4 items (SinCategoria
  // included, US-047 D-05). Before the `tajadasInterinas` shim, the OLD
  // `entradasLeyenda` spread that 4-item array AND manually appended a
  // SECOND SinCategoria row — a duplicate legend row sharing the same React
  // `key`, which triggered a duplicate-key console warning. `LeyendaGasto`
  // renders 5 rows total (3 `leyendaPrincipal` + Ingresos + SinCategoria
  // from `leyendaComplemento`, T7/WG5-03) — this asserts the
  // duplicate-row/duplicate-key symptom stays gone. As of T11, the pie also
  // renders the real 4-item ring, so Sin categoría resolves to 2 buttons
  // (wedge + legend row), not 1 — see the button-count test above for the
  // same 1→2 shape on the other three buckets.
  it('renders exactly 5 legend rows (3 gasto + Ingresos + Sin categoría, no duplicate) from a REAL view model, without a React duplicate-key warning (PR1/PR2 shim regression, PR3/T11 4-wedge ring)', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockFetchPorBucket();
    const vmReal = aResumenViewModel(resumenMesDtoReal());

    renderScreen(vmReal);

    expect(await screen.findAllByTestId('leyenda-item')).toHaveLength(5);
    expect(
      screen.getAllByRole('button', { name: /^Sin categoría\b/ }),
    ).toHaveLength(2);
    for (const mensaje of consoleErrorSpy.mock.calls.map((call) => call[0])) {
      expect(String(mensaje)).not.toContain('same key');
    }
    consoleErrorSpy.mockRestore();
  });

  // US-047 T11/PR3 (design D-06/WG5-07, CA-03 composition-level proof): the
  // static `SemaforoBadge` (`role="img"`) in the card header is replaced by
  // the clickable `SemaforoTag` (`role="link"`) — the `semaforo-global`
  // testid anchor now resolves to a navigable link, not an inert image.
  it('renders the global semáforo (spec W2-01, WG5-07) as a navigable link, with a distinct testID anchor', async () => {
    mockFetchPorBucket();
    renderScreen();
    const contenedor = await screen.findByTestId('semaforo-global');
    expect(contenedor).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Semáforo: Verde/ }),
    ).toBeInTheDocument();
  });

  // Judgment-day fix: `getAllByRole('button', { name: 'Necesidades' })` uses
  // EXACT accessible-name matching, and only the pie wedge's `aria-label` is
  // the bare "Necesidades" — the legend row's name grew content (D-08, T7:
  // "Necesidades 50% -$500.000"), so the old loop silently iterated over
  // JUST the wedge, never proving the legend row's `aria-pressed` at all.
  // Query both controls explicitly instead: the wedge by its exact name, the
  // legend row by a `/^Necesidades /` regex (a trailing space only the
  // content-derived legend name has — the wedge's bare name has none, so
  // this uniquely resolves the legend row without matching the wedge too).
  it('defaults the transactions panel to the bucket with the largest total, on both the pie wedge and the legend row (task 30.10)', async () => {
    mockFetchPorBucket();
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Necesidades' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /^Necesidades / }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking the legend row switches the transactions panel to that bucket, updating aria-pressed on both the wedge and the legend row', async () => {
    mockFetchPorBucket();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );

    // Click the LEGEND ROW specifically — see the regex rationale on the
    // "defaults the transactions panel..." test above. (Previously this
    // clicked `getAllByRole(..., { name: 'Gustos' })[length - 1]`, which
    // exact-matching resolved to a single-element array — the SAME pie
    // wedge, not the legend row the comment claimed.)
    fireEvent.click(screen.getByRole('button', { name: /^Gustos / }));

    await waitFor(() =>
      expect(screen.getByText('Movimiento de Deseos')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Gustos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Gustos / })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Necesidades' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.getByRole('button', { name: /^Necesidades / }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  // US-047 T11/PR3: renamed — SinCategoria now HAS a pie wedge (the ring's
  // 4th member, WG5-01/`conInterior`), so this proves BOTH controls
  // independently trigger the same drill-down, disambiguated the same way
  // the Necesidades/Gustos/Ahorro tests above are: the wedge by its exact
  // `aria-label` ("Sin categoría"), the legend row by a trailing-space
  // regex (its accessible name grows content, D-08) — an exact-OR-loose
  // regex here would now match 2 elements and `getByRole` would throw.
  it('Sin categoría is selectable via both its pie wedge and its legend row (WG5-01)', async () => {
    mockFetchPorBucket();
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sin categoría' }));
    await waitFor(() =>
      expect(
        screen.getByText('Movimiento de SinCategoria'),
      ).toBeInTheDocument(),
    );

    // Switch away, then prove the LEGEND ROW independently drives the same
    // drill-down.
    fireEvent.click(screen.getByRole('button', { name: 'Necesidades' }));
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Sin categoría / }));
    await waitFor(() =>
      expect(
        screen.getByText('Movimiento de SinCategoria'),
      ).toBeInTheDocument(),
    );
  });

  // FIX 5: an explicit selection must not leak into the next month — when
  // `periodo` changes, the panel resets to THAT month's own default bucket.
  // Judgment-day fix: same exact-name-vs-content-derived-name query split
  // as the two tests above — the old `getAllByRole(..., { name: 'Gustos' })`
  // loops silently checked only the pie wedge.
  it("resets the bucket selection to the new month's own default when periodo changes, on both the wedge and the legend row (FIX 5)", async () => {
    mockFetchPorBucket();
    // `rerenderConRouter` (not RTL's own `rerender`, see the router
    // harness's own docblock): the harness doesn't use RTL's `wrapper`
    // option, so RTL's `rerender` would replace the whole tree — including
    // the `RouterProvider` — with just the new element, crashing
    // `SemaforoTag`'s `<Link>`.
    const { rerenderConRouter } = renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument(),
    );

    // Explicit selection away from the default — click the legend row (see
    // the regex rationale on the "defaults the transactions panel..." test).
    fireEvent.click(screen.getByRole('button', { name: /^Gustos / }));
    await waitFor(() =>
      expect(screen.getByText('Movimiento de Deseos')).toBeInTheDocument(),
    );

    // periodo changes — the new month's default bucket is Ahorro this time.
    const nuevoViewModel: ResumenViewModel = {
      ...viewModel,
      periodo: '2026-08',
      bucketPorDefecto: 'Ahorro',
    };
    rerenderConRouter(
      <ResumenScreen viewModel={nuevoViewModel} onPeriodoChange={vi.fn()} />,
    );

    await waitFor(() =>
      expect(screen.getByText('Movimiento de Ahorro')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Ahorro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Ahorro / })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Gustos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /^Gustos / })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
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
  it('reflows single-column with 16px page margins on mobile, multi-column on lg+ (Phase 4 mobile audit, WDS-04)', async () => {
    mockFetchPorBucket();
    const { container } = renderScreen();
    // Router harness resolves its initial match asynchronously — wait for
    // any rendered content before inspecting the DOM structure.
    await screen.findByText('$1.000.000');

    const paginaRaiz = container.firstElementChild as HTMLElement;
    // p-4 = 16px side margins around the whole dashboard body.
    expect(paginaRaiz.className).toMatch(/\bp-4\b/);

    const seccionDosColumnas = container.querySelector('.grid') as HTMLElement;
    expect(seccionDosColumnas).toBeInTheDocument();
    expect(seccionDosColumnas.className).toMatch(/\bgrid-cols-1\b/);
    expect(seccionDosColumnas.className).toMatch(/\blg:grid-cols-2\b/);
  });

  // Design D-08: hint text below the legend, owned by ResumenScreen.
  it('renders the hint text below the chart card body (design D-08)', async () => {
    mockFetchPorBucket();
    renderScreen();
    expect(
      await screen.findByText(
        'Toca un ítem del gráfico o la leyenda para ver su detalle del mes',
      ),
    ).toBeInTheDocument();
  });

  // Design D-09 (T1 tablet variant): SMOKE check only — jsdom does not
  // evaluate CSS/layout, so this only proves the grid container/classes
  // exist in markup. The real CA-05 proof is Playwright (T15/T16), per the
  // binding WCTG-14 anti-pattern guard (tasks.md).
  it('the chart card body carries the T1 grid container (smoke check, not the CA-05 proof)', async () => {
    mockFetchPorBucket();
    renderScreen();
    const cuerpo = await screen.findByTestId('grafico-card-body');
    expect(cuerpo.className).toMatch(/\bgrid-cols-1\b/);
    expect(cuerpo.className).toMatch(/\bmd:grid-cols-2\b/);
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
