import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ResumenAnual } from './ResumenAnual';
import type { ResumenAnualDto, ResumenMesDto } from '@/api/types';

// US-030 Slice C (tasks 30.11-30.13): self-contained annual grid — owns its
// own `useResumenAnual(anio)` query and renders its own Loading/Error/Empty
// states, mirroring how `BucketDetailList` owns `useDetalleBucket` (keeps the
// annual load independent of the main resumen query).
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
      {
        bucket: 'SinCategoria',
        total: '0',
        porcentajeBp: null,
        estadoSemaforo: null,
      },
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal,
    cantidadSinCategoria: 0,
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

  it('renders the loading state while the annual query is pending', () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
    );

    expect(screen.getByText('Cargando resumen anual…')).toBeInTheDocument();
  });

  it('renders the error state with a retry affordance when the request fails', async () => {
    mockFetchAnual({ ok: false, status: 500 });

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByText(/no hay datos/i)).toBeInTheDocument(),
    );
  });

  it('renders all 12 months Ene→Dic', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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
  it('uses the same focus-visible outline color as the other cards (FIX 2, WCAG 1.4.11)', async () => {
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(anioConDatosHastaJulio()),
    });

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
    );

    const boton = await screen.findByRole('button', { name: 'Ver enero 2026' });
    expect(boton.className).toContain('focus-visible:outline-2');
    expect(boton.className).toContain('focus-visible:outline-slate-800');
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    const { container } = render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      {
        wrapper: crearWrapper(),
      },
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });
    const grid = container.querySelector('.grid') as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid.className).toMatch(/\bgrid-cols-2\b/);
    expect(grid.className).toMatch(/\bsm:grid-cols-3\b/);
    expect(grid.className).toMatch(/\blg:grid-cols-4\b/);
  });

  // US-048 (design §4.1, WTA-01): the mini ring reads the full 4-item
  // BUCKETS_ANILLO default (Necesidades, Deseos, Ahorro, SinCategoria) — the
  // US-047 PR1 interim BUCKETS_5030 renormalization is retired. Reuses the
  // eneroConSinCategoria fixture verbatim (nonzero SinCategoria total is the
  // whole point — a zero-total fixture cannot distinguish diluted from
  // renormalized). Fills, not just count, prove the 4th wedge is genuinely
  // SinCategoria grey in BUCKETS_ANILLO ring order.
  it('renders 4 mini-pie slices per month, including the SinCategoria wedge (WTA-01)', async () => {
    const enero = mesConDatos('2026-01');
    const eneroConSinCategoria: ResumenMesDto = {
      ...enero,
      buckets: enero.buckets.map((b) =>
        b.bucket === 'SinCategoria'
          ? { ...b, total: '100000', porcentajeBp: 600 }
          : b,
      ),
      cantidadSinCategoria: 2,
    };
    const datos: ResumenAnualDto = {
      anio: 2026,
      meses: anioTodoSinDatos().meses.map((mes, i) =>
        i === 0 ? eneroConSinCategoria : mes,
      ),
    };
    mockFetchAnual({
      ok: true,
      status: 200,
      json: () => Promise.resolve(datos),
    });

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      {
        wrapper: crearWrapper(),
      },
    );

    await screen.findByRole('button', { name: 'Ver enero 2026' });
    const slices = screen.getAllByTestId('mini-pie-slice');
    expect(slices).toHaveLength(4);
    expect(slices.map((slice) => slice.getAttribute('fill'))).toEqual([
      '#8FA7D1',
      '#B1A7D1',
      '#E6D194',
      '#AEB4C4',
    ]);
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-07"
        onSelectPeriodo={onSelectPeriodo}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-03"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-03"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-12"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
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

    const { rerender } = render(
      <ResumenAnual
        anio={2026}
        periodoSeleccionado="2026-03"
        onSelectPeriodo={vi.fn()}
        ahora={AHORA}
      />,
      { wrapper: crearWrapper() },
    );

    expect(
      await screen.findByText(
        'Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo marzo 2026.',
      ),
    ).toBeInTheDocument();

    rerender(
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
});
