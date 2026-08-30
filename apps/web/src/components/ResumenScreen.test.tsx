import { afterEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ResumenScreen } from './ResumenScreen';
import { renderConRouter } from '@/test/router-harness';
import { aResumenViewModel } from '@/domain/resumen-view-model';
import type { ResumenViewModel } from '@/domain/resumen-view-model';
import type { ResumenAnualDto, ResumenMesDto } from '@/api/types';

// US-030 Slice B (tasks 30.9/30.10) — US-053 PR3 (D-06): the interim
// transactions panel is RETIRED. The pie + legend represent the spend split,
// and picking a bucket NAVIGATES to the month-scoped `/buckets/:bucket` page
// instead of swapping an inline panel — the selection state
// (`bucketElegido`, FIX 5 reset) is gone with it. `ResumenScreen` threads
// the router's `onSelectBucket(bucket, destacar?)` down to
// `DistribucionPie`/`LeyendaGasto` unchanged (their `onSelectBucket`
// signature stays single-arg; this screen adds the `destacar` flag for the
// Sin categoría drill-down, WDM-04).
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
  // Necesidades has the largest raw total among the 4 buckets — the panel-era
  // default selection (task 30.10), retired with the panel (US-053 PR3).
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
 * Mocks `fetch` for `/api/resumen/anual` only (US-030 Slice C — `ResumenScreen`
 * renders `ResumenAnual`, which self-fetches). The panel-era bucket stub is
 * GONE with the panel itself (US-053 PR3, D-06/D-08): this screen no longer
 * issues any `/api/buckets/:bucket` request. The annual DTO here is
 * all-`sinIngreso` except January (renders the Empty state) — this file's
 * tests are about the chart card, not the annual grid (see
 * `ResumenAnual.test.tsx` for that).
 */
function mockFetchAnual() {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/resumen/anual')) {
      const dto: ResumenAnualDto = {
        anio: 2026,
        // Only January has data — enough to exercise the clickable-month
        // path without adding noise to this file's chart-card tests.
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
    return Promise.reject(new Error(`fetch inesperado: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderScreen(
  vm: ResumenViewModel = viewModel,
  onPeriodoChange: (periodo: string) => void = vi.fn(),
  onSelectBucket: (bucket: string, destacar?: boolean) => void = vi.fn(),
  onSelectIngresos: () => void = vi.fn(),
) {
  return renderConRouter(
    <ResumenScreen
      viewModel={vm}
      onPeriodoChange={onPeriodoChange}
      onSelectBucket={onSelectBucket}
      onSelectIngresos={onSelectIngresos}
    />,
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
    mockFetchAnual();
    renderScreen();
    expect(await screen.findByText('$1.000.000')).toBeInTheDocument();
  });

  // A11y (ADR-018): the document must start at a page-level <h1> instead of
  // jumping straight to <h2> — a broken heading outline confuses assistive
  // technology users navigating by heading. US-053 PR3: the transactions panel
  // (and its demoted `<h2>`) is gone, so the chart card's own subheading is
  // the only content heading left — still exactly one page-level `<h1>`.
  it('renders exactly one page-level <h1> heading', async () => {
    mockFetchAnual();
    renderScreen();
    await screen.findByText('$1.000.000');
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
  it('renders the "Distribución del gasto" pie + legend, with Sin categoría now navigable via both its wedge and its legend row (spec W1-02, WG5-01, task 30.9/30.10)', async () => {
    mockFetchAnual();
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
    mockFetchAnual();
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
  // testid anchor resolves to a navigable link, not an inert image.
  //
  // CONTRACT CHANGE (design critique P0 fix): `semaforo-global` no longer
  // lives inside the chart card's header — it moved to `SemaforoHeroCard`,
  // the new FIRST card on the dashboard (verdict leads, PRODUCT.md
  // principle 1). The single `getByRole` lookup below still doubles as a
  // no-duplication guard: it throws if both the hero AND the (now-dropped)
  // chart-header copy rendered at once.
  it('renders the global semáforo (spec W2-01, WG5-07) as a navigable link, with a distinct testID anchor, now on the hero card', async () => {
    mockFetchAnual();
    renderScreen();
    const contenedor = await screen.findByTestId('semaforo-global');
    expect(contenedor).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Semáforo: Muy Saludable/ }),
    ).toBeInTheDocument();
  });

  // CONTRACT CHANGE (design critique P0 fix): the chart card's header used
  // to carry its OWN `semaforo-global` (`SemaforoTag`) — now redundant with
  // the hero directly above it, so it's dropped entirely (not duplicated).
  it('drops the semáforo tag from the chart card header (redundant with the hero above it)', async () => {
    mockFetchAnual();
    renderScreen();
    await screen.findByText('$1.000.000');

    const encabezadoGrafico = screen
      .getByText('Distribución del gasto')
      .closest('div');
    expect(encabezadoGrafico).not.toBeNull();
    expect(
      within(encabezadoGrafico as HTMLElement).queryByTestId('semaforo-global'),
    ).not.toBeInTheDocument();
  });

  // CONTRACT CHANGE (design critique P0 fix): dashboard order becomes
  // h1 (sr-only) -> SemaforoHeroCard -> IngresoCard -> chart card ->
  // ResumenAnual — the verdict leads, income supports (PRODUCT.md
  // principle 1). Rewritten (new assertion, no prior equivalent existed).
  it('renders SemaforoHeroCard first, then IngresoCard, then the chart card (verdict leads, income supports)', async () => {
    mockFetchAnual();
    const { container } = renderScreen();
    await screen.findByText('$1.000.000');

    const raiz = container.firstElementChild as HTMLElement;
    const [primeraTarjeta, segundaTarjeta, terceraSeccion] = Array.from(
      raiz.children,
    ).slice(1);

    // `SemaforoHeroCard`'s root IS the `semaforo-global` node (a `<Link>`
    // wrapping the whole card) — checked directly, not via `within`, since
    // `within(x).getByTestId` only matches DESCENDANTS of `x`, never `x`
    // itself.
    expect(primeraTarjeta).toHaveAttribute('data-testid', 'semaforo-global');
    expect(
      within(segundaTarjeta as HTMLElement).getByText('$1.000.000'),
    ).toBeInTheDocument();
    expect(
      within(terceraSeccion as HTMLElement).getByText('Distribución del gasto'),
    ).toBeInTheDocument();
  });

  // US-053 PR3 (D-06): the panel-era selection state is gone — the chart
  // controls now NAVIGATE. `ResumenScreen` threads the router's
  // `onSelectBucket` down to both controls; this proves the legend row
  // actually reaches it (the composed-screen half of the T6/T7 click
  // contracts, which survive unchanged — see LeyendaGasto.test.tsx /
  // DistribucionPie.test.tsx for the per-control halves).
  it('clicking a legend row calls onSelectBucket with that bucket (D-06)', async () => {
    mockFetchAnual();
    const onSelectBucket = vi.fn();
    renderScreen(viewModel, vi.fn(), onSelectBucket);
    await screen.findByText('$1.000.000');

    // The legend row, disambiguated from the wedge by its content-derived
    // accessible name (D-08, T7 — a trailing space only the legend has; the
    // wedge's bare name has none, so this uniquely resolves the row).
    // "Gustos" is the display label of the 'Deseos' bucket.
    fireEvent.click(screen.getByRole('button', { name: /^Gustos / }));

    expect(onSelectBucket).toHaveBeenCalledWith('Deseos', false);
  });

  // US-053 PR3 (WDM-04): the Sin categoría wedge carries the `destacar`
  // flag — the route turns it into `?destacar=sin-categoria`, so the
  // month-scoped page arrives with the unassigned group highlighted (e2e
  // case 4). Every other bucket drills down without it (see above).
  it('clicking the Sin categoría wedge calls onSelectBucket with destacar (WDM-04)', async () => {
    mockFetchAnual();
    const onSelectBucket = vi.fn();
    renderScreen(viewModel, vi.fn(), onSelectBucket);
    await screen.findByText('$1.000.000');

    // The wedge, by its exact bare `aria-label` ("Sin categoría").
    fireEvent.click(screen.getByRole('button', { name: 'Sin categoría' }));

    expect(onSelectBucket).toHaveBeenCalledWith('SinCategoria', true);
  });

  // US-030 Slice C (task 30.12): the annual grid renders below the chart
  // card, deriving its year from the currently selected periodo and
  // reusing the SAME period-setting path (`onPeriodoChange`) the dashboard
  // already threads from the route — no new navigation mechanism.
  it('renders the annual summary below, deriving the year from the selected periodo', async () => {
    mockFetchAnual();
    renderScreen();

    await screen.findByText('Año 2026 — vista macro por mes');
  });

  // Phase 4 mobile audit (WDS-04), US-053 PR3 (D-06): the panel is retired, so
  // the page-level grid is SINGLE-column at every breakpoint (no
  // `lg:grid-cols-2` to switch to). jsdom doesn't evaluate CSS, so this locks
  // in the responsive Tailwind classes directly — an accidental removal of
  // the mobile margin or a resurrected 2-column switch fails this test
  // loudly, same pattern PR2 used for the shell (AppShell.test.tsx).
  it('reflows single-column with 16px page margins at every breakpoint (Phase 4 mobile audit, WDS-04)', async () => {
    mockFetchAnual();
    const { container } = renderScreen();
    // Router harness resolves its initial match asynchronously — wait for
    // any rendered content before inspecting the DOM structure.
    await screen.findByText('$1.000.000');

    const paginaRaiz = container.firstElementChild as HTMLElement;
    // p-4 = 16px side margins around the whole dashboard body.
    expect(paginaRaiz.className).toMatch(/\bp-4\b/);

    // Anchor on the page-level grid's own testid — the hero's decorative
    // 3-segment scale (redesign 2026-08-30) is also a `.grid` and renders
    // first in DOM order.
    const seccionUnica = screen.getByTestId('dashboard-page-grid');
    expect(seccionUnica).toBeInTheDocument();
    expect(seccionUnica.className).toMatch(/\bgrid-cols-1\b/);
    expect(seccionUnica.className).not.toMatch(/\blg:grid-cols-2\b/);
  });

  // Design D-08: hint text below the legend, owned by ResumenScreen.
  it('renders the hint text below the chart card body (design D-08)', async () => {
    mockFetchAnual();
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
    mockFetchAnual();
    renderScreen();
    const cuerpo = await screen.findByTestId('grafico-card-body');
    expect(cuerpo.className).toMatch(/\bgrid-cols-1\b/);
    expect(cuerpo.className).toMatch(/\bmd:grid-cols-2\b/);
  });

  // T14 (design §6, WG5-12 — US-054 D-05): the composition-level a11y
  // sign-off. The Ingresos row is NOW a button (US-054 T-14 flip: the US-047
  // interim is retired, the endpoint exists). Every clickable legend row
  // including Ingresos is reachable and operable on the SAME composed screen.
  it('the semáforo tag and every clickable legend row including Ingresos are keyboard-focusable together (T14, WG5-12, US-054 D-05)', async () => {
    mockFetchAnual();
    renderScreen();
    await screen.findByText('$1.000.000');

    const controlesEsperados = [
      screen.getByRole('link', { name: /Semáforo: Muy Saludable/ }),
      screen.getByRole('button', { name: /^Necesidades / }),
      screen.getByRole('button', { name: /^Gustos / }),
      screen.getByRole('button', { name: /^Ahorro / }),
      screen.getByRole('button', { name: /^Sin categoría / }),
      // US-054 D-05: Ingresos is now a button — added to the focusable set.
      screen.getByRole('button', { name: /Ingresos/ }),
    ];
    for (const control of controlesEsperados) {
      control.focus();
      expect(control).toHaveFocus();
    }

    // Composed-screen keyboard activation of the semáforo tag (mouse-click
    // navigation is already proven by the "renders the global semáforo..."
    // test above) — Enter is the anchor's native activation.
    const user = userEvent.setup();
    const semaforoTag = screen.getByRole('link', {
      name: /Semáforo: Muy Saludable/,
    });
    semaforoTag.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  it('wires ResumenAnual month clicks to the same onPeriodoChange callback', async () => {
    const onPeriodoChange = vi.fn();
    mockFetchAnual();
    renderScreen(viewModel, onPeriodoChange);

    const boton = await screen.findByRole('button', { name: 'Ver enero 2026' });
    fireEvent.click(boton);

    expect(onPeriodoChange).toHaveBeenCalledWith('2026-01');
  });

  // US-048 design §2.4/D-11 (S-01): `ResumenScreen` threads
  // `viewModel.periodo` — not today, not a locally tracked click — into
  // `ResumenAnual`'s required `periodoSeleccionado` prop end-to-end.
  // `mockFetchPorBucket`'s annual fixture is not modified: January already
  // has data, which is all this test needs.
  it('threads viewModel.periodo into the annual grid as the selected month (S-01)', async () => {
    mockFetchAnual();
    const vmEnero: ResumenViewModel = { ...viewModel, periodo: '2026-01' };
    renderScreen(vmEnero);

    const botonEnero = await screen.findByRole('button', {
      name: 'Ver enero 2026',
    });
    const marcadores = screen.getAllByTestId('mes-seleccionado-marker');
    expect(marcadores).toHaveLength(1);
    expect(
      within(botonEnero).getByTestId('mes-seleccionado-marker'),
    ).toBeInTheDocument();
  });

  // Integration seam (review finding): the unit tests for
  // `construirVeredictoSemaforo` and `SemaforoHeroCard` each exercise their
  // own layer with hand-built inputs — neither proves that THIS screen's
  // `BUCKETS_5030`/`ETIQUETA_BUCKET` mapping glue actually feeds the real
  // pipeline correctly end to end. This test renders the composed screen
  // with a realistic rojo month and asserts the verbatim copy from the
  // matrix in `veredicto-semaforo.ts`'s `detalleRojo`.
  it('threads a realistic rojo month through the real veredicto pipeline into the hero card copy (integration seam)', async () => {
    mockFetchAnual();
    const viewModelRojo: ResumenViewModel = {
      ...viewModel,
      estadoGlobal: 'rojo',
      buckets: [
        {
          bucket: 'Necesidades',
          total: '$600.000',
          porcentajeLabel: '60%',
          estadoSemaforo: 'rojo',
        },
        {
          bucket: 'Deseos',
          total: '$200.000',
          porcentajeLabel: '20%',
          estadoSemaforo: 'verde',
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
    };
    renderScreen(viewModelRojo);
    await screen.findByText('$1.000.000');

    const contenedor = screen.getByTestId('semaforo-global');
    const veredictoParrafo = contenedor.querySelector('p');
    expect(veredictoParrafo).not.toBeNull();
    expect(veredictoParrafo?.textContent).toBe(
      'Tu veredicto es En peligro. Aunque Gustos y Ahorro están en rango, Necesidades queda fuera de rango y define el estado global de este mes siguiendo la lógica de mayor riesgo.',
    );
  });

  // Income card redesign (2026-08-30): integration test for the REAL annual
  // pipeline — the screen's own `useResumenAnual` query (deduped with
  // `ResumenAnual`'s by queryKey) feeds `calcularVariacionIngreso`/
  // `calcularBarrasIngreso`, whose outputs the card renders. This pins the
  // glue the pure-function tests bypass (prop-injected `variacion`/`barras`).
  it('derives the trend pill and sparkline from the annual payload (integration)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/resumen/anual')) {
        const dto: ResumenAnualDto = {
          anio: 2026,
          // June 1.000.000 -> July 1.120.000: exactly the mock's +12%.
          meses: Array.from({ length: 12 }, (_, i) => {
            const periodo = `2026-${String(i + 1).padStart(2, '0')}`;
            if (periodo === '2026-06') {
              return mesConDatos(periodo);
            }
            if (periodo === '2026-07') {
              return { ...mesConDatos(periodo), totalIngreso: '1120000' };
            }
            return mesSinDatos(periodo);
          }),
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(dto),
        });
      }
      return Promise.reject(new Error(`fetch inesperado: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderScreen();

    expect(await screen.findByText('+12% vs mes anterior')).toBeInTheDocument();
    const sparkline = await screen.findByTestId('ingreso-sparkline');
    // Window: June + July only (earlier months are sinIngreso but still in
    // the 7-month slice — they render as stubs), current month highlighted.
    const barras = sparkline.querySelectorAll('[data-barra]');
    expect(barras).toHaveLength(7);
    expect(barras[barras.length - 1]).toHaveClass('bg-ingreso-foreground');

    // FIX 1 (review): pins the TanStack queryKey dedupe between this
    // screen's own `useResumenAnual` call and `ResumenAnual`'s internal
    // one — both share the same queryKey (`['resumen-anual', anio]`), so
    // exactly one network request should reach `fetch` despite two
    // consumers mounting the query.
    const llamadasAnual = fetchMock.mock.calls.filter(([url]) =>
      url.startsWith('/api/resumen/anual'),
    );
    expect(llamadasAnual).toHaveLength(1);
  });

  // FIX 2 (review): the annual query never GATES the income card — a
  // failed `/api/resumen/anual` fetch degrades `IngresoCard` to its base
  // render (amount + eyebrow + period), never a spinner or a blank card.
  // The month resumen itself is a prop here (not fetched by this screen),
  // so "the month resumen succeeds" is represented by rendering with the
  // default `viewModel` fixture while only the annual endpoint fails.
  it('keeps IngresoCard on its base render when the annual fetch fails (annual never gates the income card)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/resumen/anual')) {
        return Promise.reject(new Error('fetch anual inesperadamente falló'));
      }
      return Promise.reject(new Error(`fetch inesperado: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderScreen();

    expect(await screen.findByText('$1.000.000')).toBeInTheDocument();
    expect(screen.getByText('INGRESOS TOTALES')).toBeInTheDocument();
    expect(screen.getByText('julio 2026')).toBeInTheDocument();
    expect(
      screen.queryByText(/vs mes anterior|Sin cambio/),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('ingreso-sparkline')).not.toBeInTheDocument();
  });
});
