import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { renderConRouter } from '@/test/router-harness';
import { ResumenAnual } from './ResumenAnual';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import type { ResumenAnualDto, ResumenMesDto } from '@/api/types';

// US-030 Slice C (tasks 30.11-30.13): self-contained annual grid — owns its
// own `useResumenAnual(anio)` query and renders its own Loading/Error/Empty
// states, mirroring how `BucketDetalleMesPage` owns `useDetalleBucketMes`
// (keeps the annual load independent of the main resumen query).
function mesConDatos(
  periodo: string,
  estadoGlobal: ResumenMesDto['estadoGlobal'] = 'verde',
): ResumenMesDto {
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
    estadoGlobal,
  };
}

function mesSinDatos(periodo: string): ResumenMesDto {
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

// "Today" is fixed at 2026-07-19 → the current period is 2026-07 (July).
const AHORA = new Date('2026-07-19T12:00:00.000Z');

function anioConDatosHastaJulio(): ResumenAnualDto {
  const meses = Array.from({ length: 12 }, (_, i) => {
    const periodo = `2026-${String(i + 1).padStart(2, '0')}`;
    return i < 7 ? mesConDatos(periodo) : mesSinDatos(periodo);
  });
  return { anio: 2026, meses };
}

function anioTodoSinDatos(): ResumenAnualDto {
  const meses = Array.from({ length: 12 }, (_, i) =>
    mesSinDatos(`2026-${String(i + 1).padStart(2, '0')}`),
  );
  return { anio: 2026, meses };
}

function mockFetchAnual(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ResumenAnual', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the loading state while the annual query is pending', async () => {
    // D-14: renderConRouter resolves its initial route match asynchronously,
    // so a synchronous getByText cannot observe the pending state, and a
    // resolved-but-unawaited fetch could already have settled by the time
    // the assertion runs. A never-resolving fetch keeps "pending" permanent
    // and deterministic — findByText then waits for the async router match.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    expect(
      await screen.findByText('Cargando resumen anual…'),
    ).toBeInTheDocument();
  });

  it('renders the error state with a retry affordance when the request fails', async () => {
    mockFetchAnual({ ok: false, status: 500 });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();
  });

  it('renders the empty state when every month is sinIngreso', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioTodoSinDatos()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/no hay datos/i)).toBeInTheDocument(),
    );
    // P1 design-critique fix: the annual empty state now carries a "Subir
    // cartola" CTA — its copy already told the user to upload, it just had
    // no button to act on it.
    expect(screen.getByRole('link', { name: 'Subir cartola' })).toHaveAttribute(
      'href',
      '/subir',
    );
  });

  it('renders all 12 months Ene→Dic', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    for (const mes of [
      'ENE',
      'FEB',
      'MAR',
      'ABR',
      'MAY',
      'JUN',
      'JUL',
      'AGO',
      'SEP',
      'OCT',
      'NOV',
      'DIC',
    ]) {
      await waitFor(() => expect(screen.getByText(mes)).toBeInTheDocument());
    }
  });

  it('a month with data is a clickable, accessible button that reports its periodo', async () => {
    const onSelectPeriodo = vi.fn();
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
    );

    const boton = await screen.findByRole('button', { name: 'Ver enero 2026' });
    fireEvent.click(boton);
    expect(onSelectPeriodo).toHaveBeenCalledWith('2026-01');
  });

  it('a sinIngreso/future month is disabled and not clickable', async () => {
    const onSelectPeriodo = vi.fn();
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });
    expect(
      screen.queryByRole('button', { name: /diciembre/i }),
    ).not.toBeInTheDocument();

    // FIX 3: the cell still carries role="button" so AT knows it's an
    // unavailable month cell — but it's kept OUT of the tab order (no
    // tabIndex) and has no onClick, so it stays non-activatable.
    const celdaDiciembre = screen
      .getByText('DIC')
      .closest('[aria-disabled="true"]') as HTMLElement;
    expect(celdaDiciembre).toBeInTheDocument();
    expect(celdaDiciembre).toHaveAttribute('role', 'button');
    expect(celdaDiciembre).not.toHaveAttribute('tabindex');

    fireEvent.click(celdaDiciembre);
    fireEvent.keyDown(celdaDiciembre, { key: 'Enter' });
    expect(onSelectPeriodo).not.toHaveBeenCalled();
  });

  it('highlights the current month with a visible marker', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const botonActual = await screen.findByRole('button', {
      name: 'Ver julio 2026',
    });
    expect(
      within(botonActual).getByTestId('mes-actual-marker'),
    ).toBeInTheDocument();

    const botonNoActual = await screen.findByRole('button', {
      name: 'Ver enero 2026',
    });
    expect(
      within(botonNoActual).queryByTestId('mes-actual-marker'),
    ).not.toBeInTheDocument();
  });

  it('renders the title with the year', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText('Año 2026 — vista macro por mes'),
      ).toBeInTheDocument(),
    );
  });

  // FIX 1: the current month must be exposed to assistive tech, not just
  // signalled visually (heavier border) or via an aria-hidden ✓ marker.
  it('exposes the current month via aria-current="date"; other months have none', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const botonActual = await screen.findByRole('button', {
      name: 'Ver julio 2026',
    });
    expect(botonActual).toHaveAttribute('aria-current', 'date');

    const botonNoActual = await screen.findByRole('button', {
      name: 'Ver enero 2026',
    });
    expect(botonNoActual).not.toHaveAttribute('aria-current');
  });

  // FIX 2 (WCAG 1.4.11): match the focus-visible outline already used by
  // LeyendaGasto/DistribucionPie's interactive controls.
  // Round-9 critique P3: the old "do NOT re-tint" LOCKED literal
  // (outline-slate-800, #1e293b) converges to the shared --ring token
  // (#1a1c1c) — verified DARKER, so contrast against every bucket fill
  // (the MiniDistribucionPie wedges inside each cell) can only improve
  // (see round-9 report for the computed ratios). `outline-ring` is the
  // class the rest of the app already uses for this same focus grammar
  // (was FIX 2, WCAG 1.4.11).
  it('round-9 P3: uses the shared --ring focus-visible outline, converged from the old slate-800 literal', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const boton = await screen.findByRole('button', { name: 'Ver enero 2026' });
    expect(boton.className).toContain('focus-visible:outline-2');
    expect(boton.className).toContain('focus-visible:outline-ring');
    expect(boton.className).not.toContain('focus-visible:outline-slate-800');
  });

  // FIX 4: the section's accessible name must come from the h2 via
  // aria-labelledby — not a duplicated aria-label announcing the same string
  // twice.
  it('exposes the region name via aria-labelledby pointing at the h2, with no duplicate aria-label (FIX 4)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const region = await screen.findByRole('region', {
      name: 'Año 2026 — vista macro por mes',
    });
    expect(region).not.toHaveAttribute('aria-label');
    const titulo = screen.getByText('Año 2026 — vista macro por mes');
    expect(region.getAttribute('aria-labelledby')).toBe(titulo.id);
    expect(titulo.id).toBeTruthy();
  });

  // FIX 5: locks the intended overlap so a future "cleanup" of the disabled
  // branch can't silently drop the current-month marker.
  // Phase 4 mobile audit (WDS-04): the 12-month calendar grid is a
  // deliberate exception to a literal single-column reading of WDS-04 — a
  // 12-cell month grid stacked into ONE column would be a very long
  // vertical scroll on mobile, a worse UX than the reviewed PR3 design.
  // Audited at 320-375px: 2 columns of ~150px comfortably fit the 56px
  // MiniDistribucionPie + label + semáforo badge inside each cell, no
  // horizontal overflow. `sm:grid-cols-3 lg:grid-cols-4` still satisfies
  // WDS-04's "multi-column on lg+" half. Locked here so a regression can't
  // silently change the breakpoint columns.
  it('uses a 2/3/4-column responsive grid (audited exception to literal single-column, Phase 4 mobile audit)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    const { container } = renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });
    const grid = container.querySelector('.grid') as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid.className).toMatch(/\bgrid-cols-2\b/);
    expect(grid.className).toMatch(/\bsm:grid-cols-3\b/);
    expect(grid.className).toMatch(/\blg:grid-cols-4\b/);
  });

  // Issue #778 tramo5b PR1: the mini ring no longer includes SinCategoria —
  // `calcularDistribucionGasto`'s `BUCKETS_ANILLO` default dropped it, so
  // `ResumenAnual`'s `calcularDistribucionGasto(mes.buckets)` call
  // automatically excludes it too, with no code change needed in this
  // component. Tramo5b PR5 (apps/api) later removed `Bucket.SinCategoria`
  // from the domain and the wire contract entirely — the API can no longer
  // send that bucket at all. This test simulates the DEPLOY-ORDER SAFETY
  // window (web deployed after the API contract changed, but a stale/cached
  // or not-yet-migrated response still carries the OLD 4th bucket entry)
  // and proves both halves of the contract still hold: (a) only 3 mini-pie
  // slices render, and (b) the three spend fractions are NOT distorted by
  // the legacy entry's presence — comparing wedge geometry (`d` attribute)
  // against the SAME month with no legacy entry shows byte-identical paths.
  it('renders only 3 mini-pie slices per month and ignores a legacy SinCategoria bucket entry without distorting the others (deploy-order safety, issue #778 tramo5b PR5)', async () => {
    const enero = mesConDatos('2026-01');
    const eneroConSinCategoriaLegacy: ResumenMesDto = {
      ...enero,
      buckets: [
        ...enero.buckets,
        {
          bucket: 'SinCategoria',
          total: '100000',
          porcentajeBp: 600,
          estadoSemaforo: null,
        },
      ],
    };
    const datosConSinCategoria: ResumenAnualDto = {
      anio: 2026,
      meses: anioTodoSinDatos().meses.map((mes, i) =>
        i === 0 ? eneroConSinCategoriaLegacy : mes,
      ),
    };
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(datosConSinCategoria),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });
    const slices = screen.getAllByTestId('mini-pie-slice');
    expect(slices).toHaveLength(3);
    const clasesEsperadas = ['fill-necesidades', 'fill-gustos', 'fill-ahorro'];
    const pathsConSinCategoria = slices.map((slice, i) => {
      expect(slice).toHaveClass(clasesEsperadas[i]);
      return slice.getAttribute('d');
    });

    // Same month, but with `mesConDatos` verbatim (no legacy SinCategoria
    // entry at all) — if the legacy entry were still diluting the ring,
    // the two renders' wedge geometry would differ.
    cleanup();
    const datosSinSinCategoria: ResumenAnualDto = {
      anio: 2026,
      meses: anioTodoSinDatos().meses.map((mes, i) => (i === 0 ? enero : mes)),
    };
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(datosSinSinCategoria),
    });
    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );
    await screen.findByRole('button', { name: 'Ver enero 2026' });
    const pathsSinSinCategoria = screen
      .getAllByTestId('mini-pie-slice')
      .map((slice) => slice.getAttribute('d'));

    expect(pathsConSinCategoria).toEqual(pathsSinSinCategoria);
  });

  // web-theme-switch S3 flagged item (d): the wedge edge must touch the
  // card (`bg-card`), not the `bg-ingreso` selected-month tint — dark Sin
  // categoría's fill only clears 3:1 against the card (2.85:1 against the
  // tint, `palette-measurements.md`). Unconditional ring, so it wraps the
  // pie on every cell, selected or not, without any layout shift (the pie
  // stays inside its existing h-16 w-16 box).
  it('wraps the mini pie in a rounded card ring so its edge never touches the ingreso tint (flagged item d)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-03"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const botonMarzo = await screen.findByRole('button', {
      name: 'Ver marzo 2026',
    });
    const anillo = within(botonMarzo).getByTestId('mini-pie-ring');
    expect(anillo.className).toContain('rounded-full');
    expect(anillo.className).toContain('bg-card');
    expect(anillo.className).toContain('p-0.5');
  });

  it('a sinIngreso month that is also the current month stays disabled but still carries aria-current="date" (FIX 5)', async () => {
    const onSelectPeriodo = vi.fn();
    const datos = anioConDatosHastaJulio();
    const datosConJulioSinIngreso: ResumenAnualDto = {
      ...datos,
      meses: datos.meses.map((mes) =>
        mes.periodo === '2026-07' ? mesSinDatos(mes.periodo) : mes,
      ),
    };
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(datosConJulioSinIngreso),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });
    const celdaJulio = screen
      .getByText('JUL')
      .closest('[aria-disabled="true"]') as HTMLElement;
    expect(celdaJulio).toBeInTheDocument();
    expect(celdaJulio).toHaveAttribute('aria-current', 'date');

    fireEvent.click(celdaJulio);
    expect(onSelectPeriodo).not.toHaveBeenCalled();
  });

  // US-048 design D-01/D-05/D-11 (WTA-02): the selected marker is derived
  // from the required `periodoSeleccionado` prop, exists on exactly one
  // cell, and is contained inside that cell's month control.
  it('shows the selected-month marker only on the selected cell (N-01)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-03"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const botonMarzo = await screen.findByRole('button', {
      name: 'Ver marzo 2026',
    });
    const marcadores = screen.getAllByTestId('mes-seleccionado-marker');
    expect(marcadores).toHaveLength(1);
    expect(
      within(botonMarzo).getByTestId('mes-seleccionado-marker'),
    ).toBeInTheDocument();
  });

  // US-048 design D-04 (WTA-02, R-3): today (`✓`/`aria-current="date"`) and
  // selected (`mes-seleccionado-marker`) occupy DIFFERENT visual channels —
  // when the viewed period differs from today, each channel appears on its
  // own cell only.
  it('splits the selected marker from the today marker into distinct channels (N-02)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-03"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const botonMarzo = await screen.findByRole('button', {
      name: 'Ver marzo 2026',
    });
    expect(
      within(botonMarzo).getByTestId('mes-seleccionado-marker'),
    ).toBeInTheDocument();
    expect(
      within(botonMarzo).queryByTestId('mes-actual-marker'),
    ).not.toBeInTheDocument();
    expect(botonMarzo).not.toHaveAttribute('aria-current');

    const botonJulio = await screen.findByRole('button', {
      name: 'Ver julio 2026',
    });
    expect(
      within(botonJulio).getByTestId('mes-actual-marker'),
    ).toBeInTheDocument();
    expect(botonJulio).toHaveAttribute('aria-current', 'date');
    expect(
      within(botonJulio).queryByTestId('mes-seleccionado-marker'),
    ).not.toBeInTheDocument();
  });

  // WTA-02 scenario 2: when the viewed period IS today's month, BOTH markers
  // land on the same cell — the channels are independent, not exclusive.
  it('shows the selected marker AND the today marker on the same cell when viewing the current month (WTA-02)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const botonJulio = await screen.findByRole('button', {
      name: 'Ver julio 2026',
    });
    expect(
      within(botonJulio).getByTestId('mes-seleccionado-marker'),
    ).toBeInTheDocument();
    expect(
      within(botonJulio).getByTestId('mes-actual-marker'),
    ).toBeInTheDocument();
    expect(botonJulio).toHaveAttribute('aria-current', 'date');
  });

  // US-048 design §2.2 (N-10, cross-endpoint defensive pin): the selected
  // marker lives in the shared `contenido` fragment (same discipline as FIX
  // 1's `esActual`), so it must survive on the disabled (`sinIngreso`)
  // branch without crashing — even though the production wiring never
  // selects an empty month today, the annual endpoint's per-month
  // `sinIngreso` and the monthly endpoint's `sinIngreso` are independent and
  // could disagree.
  it('renders the selected marker inside a sinIngreso disabled cell without crashing (N-10)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-12"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const celdaDiciembre = (await screen.findByText('DIC')).closest(
      '[aria-disabled="true"]',
    ) as HTMLElement;
    expect(celdaDiciembre).toBeInTheDocument();
    expect(
      within(celdaDiciembre).getByTestId('mes-seleccionado-marker'),
    ).toBeInTheDocument();
  });

  // US-048 design D-09/D-10 (WTA-06, CA-06): the caption names the ACTUALLY
  // selected month via `mesCompletoLabel(periodoSeleccionado)` — never a
  // hardcoded month — and updates when the prop changes.
  it('renders a caption naming the selected month, updating when periodoSeleccionado changes (N-07)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    const { rerenderConRouter } = renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-03"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    expect(
      await screen.findByText(
        'Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo marzo 2026.',
      ),
    ).toBeInTheDocument();

    rerenderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    expect(
      screen.getByText(
        'Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo julio 2026.',
      ),
    ).toBeInTheDocument();
  });

  // US-048 design D-01/§2.1 (WTA-05, CA-05): the restructure's MesCelda
  // sibling wiring — a semáforo link for every month, tab order, and the
  // hit-area separation it exists to prove. §6.1's structure-independence
  // audit ran first (C2a-1); the 19 tests above stayed green unchanged.

  it('renders a semáforo link for every month, each targeting that month’s own periodo (N-03)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });

    for (let mes = 1; mes <= 12; mes += 1) {
      const periodo = `2026-${String(mes).padStart(2, '0')}`;
      const enlace = screen.getByRole('link', {
        name: new RegExp(`^Semáforo de ${mesCompletoLabel(periodo)}:`),
      });
      expect(enlace).toHaveAttribute('href', `/semaforo?periodo=${periodo}`);
    }
  });

  it('keeps December (sinIngreso) non-navigable while its semáforo link stays live (N-04, D-2 asymmetry)', async () => {
    const onSelectPeriodo = vi.fn();
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
    );

    const celdaDiciembre = (await screen.findByText('DIC')).closest(
      '[aria-disabled="true"]',
    ) as HTMLElement;
    expect(celdaDiciembre).toBeInTheDocument();
    expect(celdaDiciembre).not.toHaveAttribute('tabindex');

    fireEvent.click(celdaDiciembre);
    fireEvent.keyDown(celdaDiciembre, { key: 'Enter' });
    expect(onSelectPeriodo).not.toHaveBeenCalled();

    const enlaceDiciembre = screen.getByRole('link', {
      name: /^Semáforo de diciembre 2026:/,
    });
    expect(enlaceDiciembre).toBeInTheDocument();
    expect(enlaceDiciembre.tagName).toBe('A');
  });

  it('never nests the semáforo link inside a month control, for every cell (N-05, CA-05 no-nesting)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });

    const enlaces = screen.getAllByRole('link', { name: /^Semáforo de / });
    expect(enlaces).toHaveLength(12);
    for (const enlace of enlaces) {
      expect(enlace.closest('button,[role="button"]')).toBeNull();
    }

    const controles = screen.getAllByRole('button');
    expect(controles).toHaveLength(12);
    for (const control of controles) {
      expect(within(control).queryByRole('link')).toBeNull();
    }
  });

  it('clicking a semáforo link does not select the month (N-06, D-03 sibling hit-testing)', async () => {
    const onSelectPeriodo = vi.fn();
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
    );

    const enlaceEnero = await screen.findByRole('link', {
      name: /^Semáforo de enero 2026:/,
    });
    fireEvent.click(enlaceEnero);
    expect(onSelectPeriodo).not.toHaveBeenCalled();
  });

  it('places the month control before its semáforo link in document order (N-08, D-02 tab order)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    const botonEnero = await screen.findByRole('button', {
      name: 'Ver enero 2026',
    });
    const enlaceEnero = screen.getByRole('link', {
      name: /^Semáforo de enero 2026:/,
    });

    expect(
      botonEnero.compareDocumentPosition(enlaceEnero) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('gives December’s disabled cell the exact accessible name "DIC" (N-09, D-13)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    renderConRouter(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });
    expect(screen.getByRole('button', { name: 'DIC' })).toBeInTheDocument();
  });
});
