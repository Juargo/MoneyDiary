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
// the router's `onSelectBucket(bucket, destacar?)` straight down to
// `DistribucionPie`/`LeyendaGasto` unchanged (their `onSelectBucket`
// signature stays single-arg). Issue #778 tramo5b PR1: this screen no
// longer computes a `destacar` value of its own — that flag used to be set
// only for the now-retired Sin categoría drill-down (WDM-04).
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
  // Issue #778 tramo5b PR1: the ring is now exactly the 3 spend buckets —
  // no SinCategoria member.
  distribucionGasto: [
    { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
    { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
    { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
  ],
  // Necesidades has the largest raw total among the 4 buckets — the panel-era
  // default selection (task 30.10), retired with the panel (US-053 PR3).
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
  // `leyendaPrincipal`/`leyendaComplemento` (T5, D-03) — a hand-rolled
  // view-model (not built via `aResumenViewModel`), so these are written out
  // directly; values match `distribucionGasto`/`buckets` above exactly.
  // Issue #778 tramo5b PR1: leyendaComplemento is now just [ingreso].
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
  leyendaComplemento: [{ kind: 'ingreso', montoLabel: '+$1.000.000' }],
};

/**
 * A REAL `ResumenMesDto` still carrying the LEGACY 4th bucket entry (run
 * through the actual `aResumenViewModel` mapper) — issue #778 tramo5b PR5
 * (apps/api) removed `Bucket.SinCategoria`/`cantidadSinCategoria` from the
 * domain and the wire contract entirely, so a real API response can no
 * longer send this shape. This fixture stays as a DEPLOY-ORDER SAFETY proof
 * (web and the API deploy independently from main): even if a stale/cached
 * response still carries the old nonzero SinCategoria bucket total, the
 * resulting view model's ring/legend never show it and the three spend
 * percentages are not distorted by its presence (see the test below).
 */
function resumenMesDtoConSinCategoriaLegacy(): ResumenMesDto {
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
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: null,
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
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: 'verde',
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

  // A11y (ADR-018): the document must start at a page-level <h1> instead of
  // jumping straight to <h2> — a broken heading outline confuses assistive
  // technology users navigating by heading. US-053 PR3: the transactions panel
  // (and its demoted `<h2>`) is gone, so the chart card's own subheading is
  // the only content heading left — still exactly one page-level `<h1>`.
  it('renders exactly one page-level <h1> heading', async () => {
    mockFetchAnual();
    renderScreen();
    await screen.findByTestId('semaforo-global');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // "Necesidades"/"Gustos"/"Ahorro" are each selectable in TWO places (pie
  // slice + legend row, both wired to the same `onSelectBucket`) — hence
  // `getAllByRole` here.
  //
  // The pie wedge's `aria-label` stays a concise bucket name ("Necesidades"),
  // while the legend row's accessible name includes its content (D-08
  // deliberate `aria-label` removal, T7) — e.g. "Necesidades 50%
  // -$500.000". A `^Necesidades\b` prefix match counts BOTH controls
  // without hardcoding the fixture's exact percentage/amount text here.
  //
  // Issue #778 tramo5b PR1: Sin categoría is NO LONGER navigable from this
  // screen at all — no wedge, no legend row.
  it('renders the "Distribución del gasto" pie + legend with exactly the 3 spend buckets, no Sin categoría wedge or row (spec W1-02, issue #778)', async () => {
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
      screen.queryByRole('button', { name: /Sin grupo ni categoría/ }),
    ).not.toBeInTheDocument();
  });

  // Regression test (issue #778 tramo5b PR1, extended for deploy-order
  // safety by tramo5b PR5): feeds a REAL `ResumenMesDto` still carrying the
  // LEGACY nonzero SinCategoria bucket entry (a shape the API can no longer
  // send after PR5, but a stale/cached response during the independent
  // web/API deploy window still could) through the real `aResumenViewModel`
  // mapper, and asserts the rendered screen (a) never shows a Sin categoría
  // wedge/row and (b) the three spend percentages are NOT distorted by the
  // legacy entry's presence — they read 44/28/28 (over the 900000
  // three-bucket total), not the diluted 40/25/25 a SinCategoria-inclusive
  // denominator would produce. Also guards the historical duplicate-key
  // regression (judgment-day PR1 fix): `LeyendaGasto` renders exactly 4 rows
  // (3 gasto + Ingresos), no duplicate.
  it('ignores a legacy SinCategoria bucket entry from a REAL view model — no wedge/row, spend percentages undistorted (deploy-order safety, issue #778 tramo5b PR5)', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockFetchAnual();
    const vmReal = aResumenViewModel(resumenMesDtoConSinCategoriaLegacy());

    renderScreen(vmReal);

    expect(await screen.findAllByTestId('leyenda-item')).toHaveLength(4);
    expect(
      screen.queryByRole('button', { name: /Sin grupo ni categoría/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Necesidades 44% / }),
    ).toBeInTheDocument();

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
    await screen.findByText('Distribución del gasto');

    const encabezadoGrafico = screen
      .getByText('Distribución del gasto')
      .closest('div');
    expect(encabezadoGrafico).not.toBeNull();
    expect(
      within(encabezadoGrafico as HTMLElement).queryByTestId('semaforo-global'),
    ).not.toBeInTheDocument();
  });

  // CONTRACT CHANGE (income card removed 2026-08-30): dashboard order becomes
  // h1 (sr-only) -> SemaforoHeroCard -> chart card -> ResumenAnual — the
  // verdict leads, income stays reachable from the legend's "Ingresos" row.
  it('renders SemaforoHeroCard first, then the chart card (verdict leads)', async () => {
    mockFetchAnual();
    const { container } = renderScreen();
    await screen.findByTestId('semaforo-global');

    const raiz = container.firstElementChild as HTMLElement;
    const [primeraTarjeta, segundaSeccion] = Array.from(raiz.children).slice(1);

    // `SemaforoHeroCard`'s root IS the `semaforo-global` node (a `<Link>`
    // wrapping the whole card) — checked directly, not via `within`, since
    // `within(x).getByTestId` only matches DESCENDANTS of `x`, never `x`
    // itself.
    expect(primeraTarjeta).toHaveAttribute('data-testid', 'semaforo-global');
    expect(
      within(segundaSeccion as HTMLElement).getByText('Distribución del gasto'),
    ).toBeInTheDocument();
  });

  // US-053 PR3 (D-06): the panel-era selection state is gone — the chart
  // controls now NAVIGATE. `ResumenScreen` threads the router's
  // `onSelectBucket` down to both controls; this proves the legend row
  // actually reaches it (the composed-screen half of the T6/T7 click
  // contracts, which survive unchanged — see LeyendaGasto.test.tsx /
  // DistribucionPie.test.tsx for the per-control halves).
  // Issue #778 tramo5b PR1: `onSelectBucket` is called with just the bucket
  // — this screen no longer computes a second (`destacar`) argument, since
  // the only drill-down that ever carried one (the Sin categoría wedge,
  // WDM-04) is retired.
  it('clicking a legend row calls onSelectBucket with just that bucket (D-06, issue #778)', async () => {
    mockFetchAnual();
    const onSelectBucket = vi.fn();
    renderScreen(viewModel, vi.fn(), onSelectBucket);
    await screen.findByTestId('semaforo-global');

    // The legend row, disambiguated from the wedge by its content-derived
    // accessible name (D-08, T7 — a trailing space only the legend has; the
    // wedge's bare name has none, so this uniquely resolves the row).
    // "Gustos" is the display label of the 'Deseos' bucket.
    fireEvent.click(screen.getByRole('button', { name: /^Gustos / }));

    expect(onSelectBucket).toHaveBeenCalledWith('Deseos');
  });

  // Issue #778 tramo5b PR1: there is no longer a Sin categoría wedge to
  // click at all — replaces the retired WDM-04 "clicking the Sin categoría
  // wedge calls onSelectBucket with destacar" test.
  it('there is no Sin categoría wedge in the pie to click (issue #778 tramo5b PR1)', async () => {
    mockFetchAnual();
    renderScreen();
    await screen.findByTestId('semaforo-global');

    expect(
      screen.queryByRole('button', { name: 'Sin grupo ni categoría' }),
    ).not.toBeInTheDocument();
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
  it('reflows single-column y NO pone el padding de página, que es de ResumenPage (Phase 4 mobile audit, WDS-04)', async () => {
    mockFetchAnual();
    const { container } = renderScreen();
    // Router harness resolves its initial match asynchronously — wait for
    // any rendered content before inspecting the DOM structure.
    await screen.findByTestId('semaforo-global');

    const paginaRaiz = container.firstElementChild as HTMLElement;
    // El margen lateral de 16px ya NO se pone acá: lo pone `ResumenPage`, que
    // envuelve a este componente (lo necesita igual para el `PeriodoSelector`,
    // que vive fuera del switch de estados). `ResumenPage.test.tsx` fija ese
    // lado del contrato.
    //
    // Acá se afirma lo CONTRARIO —que este contenedor no lleve padding de
    // página— y no es una aserción vacía: tenerlo en los dos lados era
    // exactamente el bug. El padding se aplicaba dos veces y empujaba el
    // contenedor 16px fuera del viewport, así que a 360px el dashboard se
    // scrolleaba de costado. Lo encontró el barrido E-10 de
    // `mobile-floor.e2e.ts` al sumar `/` a sus `SCREENS`; el margen real (16px
    // a cada lado) lo mide ese arnés, no jsdom.
    expect(paginaRaiz.className).not.toMatch(/\bp-4\b/);

    // Anchor on the page-level grid's own testid (the hero is a single-line
    // row now, no `.grid` of its own to collide with this lookup).
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
    await screen.findByTestId('semaforo-global');

    const controlesEsperados = [
      screen.getByRole('link', { name: /Semáforo: Muy Saludable/ }),
      screen.getByRole('button', { name: /^Necesidades / }),
      screen.getByRole('button', { name: /^Gustos / }),
      screen.getByRole('button', { name: /^Ahorro / }),
      // US-054 D-05: Ingresos is now a button — added to the focusable set.
      // Issue #778 tramo5b PR1: Sin categoría no longer has a row/control.
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
});
