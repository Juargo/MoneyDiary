import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import { BucketDetalleMesPage } from './BucketDetalleMesPage';
import { renderConRouter } from '@/test/router-harness';
import { resetUndoManagerParaTests } from '@/lib/undo-manager';
import type { ApiError } from '@/api/client';
import type {
  CategoriaDto,
  CatalogoDto,
  DetalleBucketMesDto,
} from '@/api/types';

// US-053 (T-08) — page-level behavior ledger (design.md §5):
// WDM-01 header · WDM-03 grouping/collapse · WDM-04 destacar · WDM-05 empty
// month · WCAT-02 BigInt-exact subtotals · WCAT-04 per-row reclassify ·
// catalog fetch-lifecycle surface (status/alert) owned once here.
//
// The page receives its transactions query via props (router-agnostic, the
// SemaforoDetallePage pattern), so only the page's own `useCategorias()`
// prefetch performs a real fetch — stubbed per test below.
//
// `renderConRouter` paints asynchronously (RouterProvider loads the tree
// before any route component mounts — see SemaforoDetallePage.test.tsx: every
// test awaits its first `findBy*`), so every test here awaits a first
// landmark before sync assertions.

const CATALOGO_FIXTURE: CatalogoDto = {
  categorias: [
    {
      id: 'categoria-supermercado',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    // A second Necesidades categoría — required for the same-bucket
    // reclassify test (T-06(d), confirmacion-reclasificar, issue #749): a
    // same-bucket move needs two categorías in the SAME bucket to pick
    // between.
    {
      id: 'categoria-combustible',
      nombre: 'Combustible',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    // Deseos categoría — required for cross-bucket confirmation tests (T-06
    // cases a/c): a row in the Necesidades page picking this triggers the
    // alertdialog (Necesidades → Deseos cross-bucket, announces "Movida a Gustos.").
    {
      id: 'categoria-paseos',
      nombre: 'Paseos',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
    },
    // Ahorro categoría — for T-06 case (c): replacement announcement test.
    {
      id: 'categoria-ahorro',
      nombre: 'Ahorro',
      bucket: 'Ahorro',
      patrones: [],
      transaccionesCount: 0,
    },
  ],
};

const dtoCompleto: DetalleBucketMesDto = {
  bucket: 'Necesidades',
  periodo: '2026-07',
  total: '500000',
  totalTransacciones: 9,
  totalCategorias: 3,
  porcentajeBp: 5500,
  metaBp: 5000,
  grupos: [
    {
      categoriaId: 'categoria-1',
      nombre: 'Ñoquis',
      subtotal: '300000',
      conteo: 3,
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-01',
          descripcion: 'Ñoquis de la abuela',
          origen: 'BCI',
          monto: '100000',
        },
        {
          id: 'tx-2',
          fecha: '2026-07-02',
          descripcion: 'Ñoquis del domingo',
          origen: 'BCI',
          monto: '100000',
        },
        {
          id: 'tx-3',
          fecha: '2026-07-03',
          descripcion: 'Ñoquis con salsa',
          origen: 'Manual',
          monto: '100000',
        },
      ],
    },
    {
      categoriaId: 'categoria-2',
      nombre: 'Zapatería',
      subtotal: '150000',
      conteo: 5,
      transacciones: [
        {
          id: 'tx-4',
          fecha: '2026-07-04',
          descripcion: 'Zapatos nuevos',
          origen: 'BCI',
          monto: '30000',
        },
        {
          id: 'tx-5',
          fecha: '2026-07-05',
          descripcion: 'Zapatillas rojas',
          origen: 'BCI',
          monto: '30000',
        },
        {
          id: 'tx-6',
          fecha: '2026-07-06',
          descripcion: 'Zapatos de cuero',
          origen: 'BCI',
          monto: '30000',
        },
        {
          id: 'tx-7',
          fecha: '2026-07-07',
          descripcion: 'Zapatos azules',
          origen: 'BCI',
          monto: '30000',
        },
        {
          id: 'tx-8',
          fecha: '2026-07-08',
          descripcion: 'Zapatos café',
          origen: 'BCI',
          monto: '30000',
        },
      ],
    },
    {
      categoriaId: null,
      nombre: 'Sin categoría',
      subtotal: '50000',
      conteo: 1,
      transacciones: [
        {
          id: 'tx-9',
          fecha: '2026-07-09',
          descripcion: 'Algo sin categorizar',
          origen: 'Manual',
          monto: '50000',
        },
      ],
    },
  ],
};

/**
 * A group with more than 10 rows, so the accordion assertions below have
 * something meaningful to prove ALL rows render on expand (no truncation
 * survives) — while `dtoCompleto` (max 5 rows/group) stays short and pins
 * "collapsed regardless of size" for a group that never needed a "ver N
 * más…" control even under the old truncation rule.
 */
const dtoGrupoLargo: DetalleBucketMesDto = {
  ...dtoCompleto,
  grupos: [
    {
      categoriaId: 'categoria-larga',
      nombre: 'Zapatería',
      subtotal: '360000',
      conteo: 12,
      transacciones: Array.from({ length: 12 }, (_, i) => ({
        id: `tx-larga-${i + 1}`,
        fecha: `2026-07-${String(i + 1).padStart(2, '0')}`,
        descripcion: `Zapatos ${i + 1}`,
        origen: 'BCI',
        monto: '30000',
      })),
    },
  ],
};

const dtoMesVacio: DetalleBucketMesDto = {
  ...dtoCompleto,
  total: '0',
  totalTransacciones: 0,
  totalCategorias: 0,
  porcentajeBp: null,
  metaBp: 5000,
  grupos: [],
};

const dtoBigInt: DetalleBucketMesDto = {
  ...dtoCompleto,
  total: '9007199254740993',
  totalTransacciones: 1,
  totalCategorias: 1,
  grupos: [
    {
      categoriaId: 'categoria-1',
      nombre: 'Ñoquis',
      subtotal: '9007199254740993',
      conteo: 1,
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-01',
          descripcion: 'Ñoquis de la abuela',
          origen: 'BCI',
          monto: '9007199254740993',
        },
      ],
    },
  ],
};

function mockQuery(
  overrides: Partial<UseQueryResult<DetalleBucketMesDto, ApiError>>,
): UseQueryResult<DetalleBucketMesDto, ApiError> {
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as UseQueryResult<DetalleBucketMesDto, ApiError>;
}

// The page's own `useCategorias()` prefetch (WCAT-04 lifecycle, unconditional
// by design) is the only real fetch the page performs — its transactions query
// arrives via props. `pending = true` keeps the catalog fetch in flight
// forever (pins the `role="status"` surface); otherwise every call resolves
// with `response`.
function stubFetch(
  response: { ok: boolean; status: number; json?: () => Promise<unknown> },
  { pending = false }: { readonly pending?: boolean } = {},
) {
  const fetchMock = vi.fn(() =>
    pending
      ? new Promise<Response>(() => {})
      : Promise.resolve({
          ok: response.ok,
          status: response.status,
          json: response.json ?? (() => Promise.reject(new Error('no body'))),
        } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Stub for interaction tests that drive a real reclassify mutation:
// routes GET /api/categorias to the catalog fixture and PATCH
// /api/transacciones/*/categoria to a 200 success. All other requests
// (e.g. TanStack Query background refetches) are served with the catalog.
function stubFetchInteraccion(catalogo: CatalogoDto = CATALOGO_FIXTURE) {
  const reclasificarDto = {
    id: 'tx-1',
    categoria: { id: 'cat-1', nombre: 'Paseos' },
    bucket: 'Deseos',
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH' && url.includes('/categoria')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(reclasificarDto),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(catalogo),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderData(ui: React.ReactElement) {
  // Default '/' initial path (like every other harness consumer): the page's
  // back-link href comes from its `search={{ periodo }}` prop, not the URL.
  return renderConRouter(ui);
}

// First landmark for any data-state test: the first group heading appears
// only after the router paints AND the catalog prefetch settles. Scoped to
// the heading role — a bare `/Ñoquis/` text match would hit BOTH the heading
// and the 'Ñoquis de la abuela' row description (multiple-match retry loop).
async function verPrimerGrupo() {
  return screen.findByRole('heading', { level: 2, name: /Ñoquis/ });
}

// Accordion helper: groups collapse by default (WDM-03), so any test that
// queries or interacts with a row/control must expand the owning group
// first — clicking the heading trigger reveals its `hidden` row list.
async function expandirGrupo(nombreExpr: RegExp) {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: nombreExpr,
  });
  fireEvent.click(within(heading).getByRole('button'));
  return heading;
}

describe('BucketDetalleMesPage', () => {
  afterEach(() => {
    // Design-hardening change (undo grace window): `undo-manager.ts` is a
    // module singleton — a delete scheduled in one test stays pending
    // (hiding its row via `usePendingIds()`) into the next test otherwise.
    resetUndoManagerParaTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the loading state with detail-appropriate copy while the query is pending', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ isPending: true })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    expect(
      await screen.findByText('Cargando movimientos…'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Cargando resumen…')).not.toBeInTheDocument();
  });

  it('renders the error state with a retry affordance that refetches', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });
    const refetch = vi.fn();
    const error: ApiError = {
      tag: 'invalid',
      message: 'No se pudo cargar el detalle.',
    };

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ isError: true, error, refetch })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the empty month with zeroed totals, the WDM-05 copy, and a still-operable month selector (WDM-05)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });
    const onPeriodoChange = vi.fn();

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoMesVacio })}
        periodo="2026-07"
        onPeriodoChange={onPeriodoChange}
        destacar={false}
      />,
    );

    // Header keeps the zeroed totals-strip + selector (WDM-05: navigation
    // survives). The strip is two separate cells now, not one combined
    // sentence — "Total del mes" / "$0" and "Movimientos" / "0" — scoped via
    // each label's own cell so a stray "0" elsewhere can't false-match.
    const totalCell = (await screen.findByText('Total del mes'))
      .parentElement as HTMLElement;
    expect(within(totalCell).getByText('$0')).toBeInTheDocument();
    const movimientosCell = screen.getByText('Movimientos')
      .parentElement as HTMLElement;
    expect(within(movimientosCell).getByText('0')).toBeInTheDocument();
    expect(
      await screen.findByText('Sin movimientos en julio 2026'),
    ).toBeInTheDocument();
    // issue #750 — "bucket" es jerga interna; el empty state dice "grupo".
    expect(
      screen.getByText('No hay movimientos en este grupo para el período.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('ver 2 más…')).not.toBeInTheDocument();
    // No group sections render for an empty month.
    expect(screen.queryAllByTestId('grupo-movimientos')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06');
  });

  it('renders the full header: breadcrumb, selector and the totals strip (WDM-01, bucket-detalle-lista-rediseño)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    const breadcrumb = await screen.findByRole('navigation', { name: 'Ruta' });
    expect(within(breadcrumb).getByText('Dashboard')).toBeInTheDocument();
    expect(within(breadcrumb).getByText('Necesidades')).toBeInTheDocument();

    expect(
      await screen.findByRole('button', { name: /julio 2026/ }),
    ).toBeInTheDocument();

    // Totals strip replaces the retired %/meta tag + usage bar (Cambio 2):
    // "Total del mes" / "$500.000" and "Movimientos" / "9", each its own
    // labeled cell instead of one combined sentence.
    const totalCell = screen.getByText('Total del mes')
      .parentElement as HTMLElement;
    expect(within(totalCell).getByText('$500.000')).toBeInTheDocument();
    const movimientosCell = screen.getByText('Movimientos')
      .parentElement as HTMLElement;
    expect(within(movimientosCell).getByText('9')).toBeInTheDocument();
  });

  // bucket-detalle-lista-rediseño (Cambio 2): the %/meta tag and the usage
  // bar are RETIRED regardless of the DTO's porcentajeBp/metaBp — the view
  // model no longer maps those fields at all (Cambio 1c), so this holds for
  // every shape, not just the null ones the old WDM-04/D-02 tests exercised.
  //
  // THIS is the single home of that contract. `bucket-detalle-mes.e2e.ts`
  // carried two bare `getByTestId('usage-bar')).toHaveCount(0)` lines until
  // the fixture-cleanup change removed them: with the bar gone from every
  // source file, a testid-absence assertion can only ever pass, so it read
  // like coverage while asserting a string literal against nothing. The two
  // CONTENT assertions below are what actually hold the line — they match the
  // rendered text, so they catch a re-introduction whatever markup or testid
  // it arrives in. The testid check stays only as a third, cheap belt on the
  // same waist, never as the contract itself.
  it('never renders the retired %/meta tag or usage bar, for any porcentajeBp/metaBp shape', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    expect(screen.queryByText(/Meta:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+% ·/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('usage-bar')).not.toBeInTheDocument();
  });

  it('renders groups verbatim in payload order (WDM-03/2)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    const encabezados = await screen.findAllByRole('heading', { level: 2 });
    expect(encabezados.map((h) => h.textContent)).toEqual([
      'Ñoquis $300.000 3 movimientos',
      'Zapatería $150.000 5 movimientos',
      'Sin categoría $50.000 1 movimiento',
    ]);
  });

  // bucket-detalle-lista-rediseño (Cambio 2, point 3): `periodoLabel` is
  // derived from `viewModel.periodo` (always present), never the router's
  // own `periodo` prop (can be `undefined` on first paint) — passed to
  // every `GrupoMovimientos`, surfacing as that group's column header.
  it('passes mesAbreviadoConAnio(viewModel.periodo) as periodoLabel to every group column header', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await expandirGrupo(/Ñoquis/);
    expect(screen.getAllByText('JUL 2026').length).toBeGreaterThan(0);
  });

  it('renders group subtotals exactly beyond safe-integer precision (WCAT-02)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoBigInt })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    // Totals strip (Cambio 2) — scoped to its own cell (see the header test
    // above for why a bare `getByText` on the combined sentence is gone).
    const totalCell = (await screen.findByText('Total del mes'))
      .parentElement as HTMLElement;
    expect(
      within(totalCell).getByText('$9.007.199.254.740.993'),
    ).toBeInTheDocument();
    // Queried by ROLE, not by text: the Tecno-Analítico pass (2026-09-02)
    // wraps the group heading's figures in `font-mono tabular-nums` spans, and
    // `getByText` reads `getNodeText`, which joins only an element's DIRECT
    // text-node children — a figure inside a child <span> becomes invisible to
    // it. A heading's ACCESSIBLE NAME concatenates across descendants, so this
    // still asserts exactly what it always did (the BigInt-exact CLP label
    // rendered verbatim, WCAT-02) and no longer depends on the heading being
    // one flat text node.
    expect(
      screen.getByRole('heading', {
        name: 'Ñoquis $9.007.199.254.740.993 1 movimiento',
      }),
    ).toBeInTheDocument();
  });

  it('a category group is collapsed by default; activating its heading trigger reveals ALL rows, with no truncation control anywhere (WDM-03/1)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoGrupoLargo })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: /Zapatería/,
    });
    const trigger = within(heading).getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: the rows stay mounted (D-04, undo-grace precedent) but are
    // NOT visible — `hidden` on the panel, asserted via `toBeVisible`, not
    // `toBeInTheDocument` (which only checks DOM presence).
    expect(screen.getByText('Zapatos 1')).not.toBeVisible();
    expect(screen.getByText('Zapatos 12')).not.toBeVisible();

    fireEvent.click(trigger);

    // Expanded: ALL 12 rows show — no 10-row slice, no "ver N más…" control.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Zapatos 1')).toBeVisible();
    expect(screen.getByText('Zapatos 12')).toBeVisible();
    expect(screen.queryByText(/ver \d+ más/i)).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Zapatos 1')).not.toBeVisible();
  });

  it('a short group (≤10 rows) is ALSO collapsed by default — the accordion applies regardless of size', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    // Every `dtoCompleto` group sits under the old 10-row threshold — Ñoquis
    // (3), Zapatería (5) and Sin categoría (1) — but none of their rows are
    // VISIBLE before the group is expanded (they stay mounted, D-04).
    expect(screen.getByText('Ñoquis de la abuela')).not.toBeVisible();
    expect(screen.getByText('Zapatos nuevos')).not.toBeVisible();
    expect(screen.getByText('Algo sin categorizar')).not.toBeVisible();
    // No leftover "ver N más…"/"Ver menos" control exists anywhere.
    expect(
      screen.queryAllByRole('button', { name: /más|Ver menos/ }),
    ).toHaveLength(0);
  });

  it("wires aria-expanded and aria-controls on the heading trigger, pointing at the group's row list", async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoGrupoLargo })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    const grupoZapateria = (
      await screen.findAllByTestId('grupo-movimientos')
    )[0];
    const heading = within(grupoZapateria).getByRole('heading', { level: 2 });
    const toggle = within(heading).getByRole('button');
    // The row list stays in the DOM (hidden), so it is queryable directly —
    // role-based queries exclude it, `querySelector` does not (D-04).
    const lista = grupoZapateria.querySelector(
      `#${toggle.getAttribute('aria-controls')}`,
    );
    expect(lista).not.toBeNull();
    expect(lista).toHaveAttribute('hidden');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', lista?.id);

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(lista).not.toHaveAttribute('hidden');
  });

  it('highlights the Sin categoría group only when destacar is true (WDM-04/1)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    const { rerenderConRouter } = renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    const gruposSinDestacar = screen.getAllByTestId('grupo-movimientos');
    expect(
      gruposSinDestacar.every(
        (g) => g.getAttribute('data-destacado') !== 'true',
      ),
    ).toBe(true);
    // No highlight means no current-item signal either (a11y, WDM-04).
    expect(
      gruposSinDestacar.every((g) => g.getAttribute('aria-current') !== 'true'),
    ).toBe(true);
    // Without `destacar`, every group starts collapsed — including Sin
    // categoría (accordion default applies uniformly, WDM-03).
    expect(screen.getByText('Algo sin categorizar')).not.toBeVisible();

    rerenderConRouter(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar
      />,
    );

    await waitFor(() => {
      const grupos = screen.getAllByTestId('grupo-movimientos');
      // Identified by its OWN heading name, not a bare `queryByText` match:
      // the redesigned row (Cambio 3) puts a "Sin categoría" PLACEHOLDER
      // `<option>` inside `ReclasificarCategoriaControl` for any row with no
      // categoría — same exact string as the group's own (now standalone)
      // truncate span, so an unscoped `queryByText('Sin categoría')` would
      // ambiguously match both once the row is present.
      const sinCategoria = grupos.find((g) =>
        within(g).queryByRole('heading', { name: /^Sin categoría/ }),
      );
      expect(sinCategoria).toHaveAttribute('data-destacado', 'true');
      expect(sinCategoria).toHaveAttribute('aria-current', 'true');
      // The highlighted section is labelled by its own heading (a11y, WDM-04).
      const titulo = within(sinCategoria as HTMLElement).getByRole('heading', {
        level: 2,
      });
      expect(sinCategoria).toHaveAttribute('aria-labelledby', titulo.id);
      const conCategoria = grupos.filter((g) => g !== sinCategoria);
      expect(
        conCategoria.every((g) => g.getAttribute('data-destacado') !== 'true'),
      ).toBe(true);
      expect(
        conCategoria.every((g) => g.getAttribute('aria-current') !== 'true'),
      ).toBe(true);
    });
  });

  it('a fresh arrival with destacar starts the Sin categoría group EXPANDED while the others stay collapsed (WDM-03/WDM-04)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    // A real `?destacar=` arrival is a FRESH page mount (deep link), not a
    // live prop flip on an already-mounted group — `GrupoMovimientos`
    // reads `destacar` only once, as its `expandido` initial state.
    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar
      />,
    );

    const tituloSinCategoria = await screen.findByRole('heading', {
      level: 2,
      name: /Sin categoría/,
    });
    expect(within(tituloSinCategoria).getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Algo sin categorizar')).toBeVisible();

    const tituloNoquis = screen.getByRole('heading', {
      level: 2,
      name: /Ñoquis/,
    });
    expect(within(tituloNoquis).getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('Ñoquis de la abuela')).not.toBeVisible();
  });

  it('wires a reclassify control per visible row (WCAT-04)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    // Every group starts collapsed (WDM-03) — expand all three so their
    // rows (Ñoquis 3 + Zapatería 5 + Sin categoría 1 = 9) become queryable.
    await expandirGrupo(/Ñoquis/);
    await expandirGrupo(/Zapatería/);
    await expandirGrupo(/Sin categoría/);

    await waitFor(() =>
      expect(screen.getAllByRole('combobox')).toHaveLength(9),
    );
  });

  it('reports the previous month via onPeriodoChange', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });
    const onPeriodoChange = vi.fn();

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={onPeriodoChange}
        destacar={false}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Mes anterior' }),
    );
    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06');
  });

  it('back link preserves the current periodo (D-09)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    const back = await screen.findByRole('link', { name: 'Volver al resumen' });
    expect(back).toHaveAttribute('href', '/?periodo=2026-07');
  });

  /**
   * SC 2.5.8 (WCAG 2.2 AA): a standalone back link is a TARGET, not inline
   * text constrained by a sentence's line-height, so the *Inline* exception
   * does not reach it. `mobile-floor.e2e.ts`'s E-11 sweep measured this link
   * at 20px tall the moment `/buckets/Deseos` joined its `SCREENS` list —
   * the same 20px its sibling `Volver a Categorías` was caught at.
   *
   * Mirrors that screen's own assertion (`EditarCategoria.test.tsx`, "lleva
   * padding real"): jsdom does not lay out, so real geometry is NOT testable
   * here — the E-11 e2e owns that. What this test pins is the MECHANISM: the
   * link is rendered through `Button asChild`, whose `sm` size carries the
   * 32px height. A refactor back to a bare `<Link>` with text classes turns
   * this red without waiting for a Playwright run.
   */
  // issue #752 — "volver" debe volver a la pantalla real de origen, no
  // siempre a "/". Cuando SÍ hay historial de navegación dentro de la app
  // (empujado por el propio router, no por el navegador), el control deja
  // de ser un `<Link to="/">` y pasa a ser un botón real que llama a
  // `router.history.back()` — la MISMA mecánica que `useVolverAtras.test.ts`
  // prueba de forma aislada, aquí verificada dentro de la página real.
  it('con historial de navegación in-app, "Volver" es un botón real que llama a router.history.back() (issue #752)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    const { router } = renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    // Sin esto, el historial de memoria arranca con UNA sola entrada — el
    // mismo estado "llegué por URL directa" que el resto de esta suite ya
    // cubre. Empujar una segunda entrada simula haber llegado navegando
    // desde el dashboard.
    act(() => {
      router.history.push('/');
    });

    const boton = await screen.findByRole('button', { name: 'Volver' });
    expect(
      screen.queryByRole('link', { name: 'Volver al resumen' }),
    ).not.toBeInTheDocument();

    const backSpy = vi.spyOn(router.history, 'back');
    fireEvent.click(boton);
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('el link "Volver al resumen" se renderiza como Button (variante link, tamaño sm) para cumplir el piso de 24px de SC 2.5.8', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    const back = await screen.findByRole('link', { name: 'Volver al resumen' });
    expect(back).toHaveAttribute('data-slot', 'button');
    expect(back).toHaveAttribute('data-variant', 'link');
    expect(back).toHaveAttribute('data-size', 'sm');
  });

  it('renders exactly one h1 (the bucket title)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Necesidades');
  });

  it('announces the catalog load exactly once while it is in flight (D-07: 2 status regions total — anuncio empty + catalog loading)', async () => {
    stubFetch({ ok: true, status: 200 }, { pending: true });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    // 2 role="status" nodes: the page-owned anuncio region (initially empty)
    // + the catalog loading "Cargando categorías…" region.
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('Cargando categorías…')).toBeInTheDocument();
  });

  it('anuncio role=status region is a page-level sibling of grupo-movimientos (D-07)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    // Wait for the catalog to settle so only the anuncio region remains —
    // the catalog-loading "Cargando categorías…" region unmounts once the
    // fetch resolves (catalogoCargandoInicial becomes false).
    // `findByRole` retries until exactly one match (or timeout).
    const statusRegion = await screen.findByRole('status');

    // Initially empty — no cross-bucket move has happened yet.
    expect(statusRegion).toHaveTextContent('');

    // The anuncio region must NOT be inside a grupo-movimientos section:
    // it is a page-level sibling, surviving any moved row's unmount (D-07).
    expect(
      statusRegion.closest('[data-testid="grupo-movimientos"]'),
    ).toBeNull();
  });

  it('anuncio region is empty before any reclassify interaction (D-07)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    // Wait for catalog to settle → only 1 status region (the anuncio one).
    const anuncioRegion = await screen.findByRole('status');
    // No user interaction at all: the region must stay empty.
    expect(anuncioRegion).toHaveTextContent('');
  });

  it('shows the catalog failure surface once and retries on demand', async () => {
    const fetchMock = stubFetch({ ok: false, status: 500 });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  // T-06 case (a): Falsifiability: if ReclasificarCategoriaControl fires
  // onMovida synchronously (before the PATCH settles), the text would appear
  // regardless of mutation result. With the fix, onMovida fires only on
  // mutation success. The exact label 'Movida a Gustos.' (not raw 'Deseos')
  // pins the ETIQUETA_BUCKET mapping.
  it('T-06(a): cross-bucket reclassify from a Necesidades row to a Deseos categoría surfaces "Movida a Gustos." in the page-owned role=status region; region is not inside any grupo (D-07)', async () => {
    stubFetchInteraccion();
    const user = userEvent.setup();

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    // Groups collapse by default (WDM-03) — expand Ñoquis so its rows are
    // queryable/interactable.
    await expandirGrupo(/Ñoquis/);

    // Wait for catalog to settle — the select must be enabled before we
    // can interact with it (all selects share the ['categorias'] query).
    const selects = await screen.findAllByRole('combobox');
    // The first visible row belongs to the Ñoquis group (Necesidades bucket
    // in dtoCompleto). Wait for the first select to be enabled.
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // Cross-bucket: Necesidades row → Paseos (Deseos) triggers the dialog.
    await user.selectOptions(primerSelect, 'Gustos · Paseos');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    // The page-owned status region must update to the exact literal.
    const statusRegion = await screen.findByRole(
      'status',
      {},
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(statusRegion).toHaveTextContent('Movida a Gustos.'),
    );

    // The region must NOT be inside a grupo-movimientos section (page-level
    // sibling, survives the moved row's unmount — D-07, ListaIngestas class).
    expect(
      statusRegion.closest('[data-testid="grupo-movimientos"]'),
    ).toBeNull();
  });

  // T-06 case (c): a second cross-bucket move replaces the prior announcement
  // (last-move-wins, not appended).
  it('T-06(c): a subsequent cross-bucket move to an Ahorro categoría replaces the prior announcement with "Movida a Ahorro." (D-07, replacement not append)', async () => {
    stubFetchInteraccion();
    const user = userEvent.setup();

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    // Both selects used below (rows tx-1 and tx-2) belong to the Ñoquis
    // group — expand it once (WDM-03 accordion default is collapsed).
    await expandirGrupo(/Ñoquis/);

    const selects = await screen.findAllByRole('combobox');
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // First cross-bucket move: Necesidades → Deseos → "Movida a Gustos."
    await user.selectOptions(primerSelect, 'Gustos · Paseos');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    const statusRegion = await screen.findByRole(
      'status',
      {},
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(statusRegion).toHaveTextContent('Movida a Gustos.'),
    );

    // Second cross-bucket move: pick a second select (different row) and
    // move to Ahorro — the announcement must be replaced, not appended.
    // Re-query selects after the first move settles.
    const selectsDopo = screen.getAllByRole('combobox');
    const segundoSelect = selectsDopo[1] as HTMLSelectElement;
    await waitFor(() => expect(segundoSelect).not.toBeDisabled());

    await user.selectOptions(segundoSelect, 'Ahorro · Ahorro');
    const dialog2 = await screen.findByRole('alertdialog');
    expect(dialog2).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(statusRegion).toHaveTextContent('Movida a Ahorro.'),
    );
    // The text is replaced, not appended — must not contain the first announcement.
    expect(statusRegion).not.toHaveTextContent('Gustos');
  });

  // T-06 case (d): same-bucket reclassify reuses the SAME page-owned status
  // region/mechanism as the cross-bucket case (confirmacion-reclasificar,
  // issue #749) — the message names the destination CATEGORÍA, not a bucket.
  it('T-06(d): a same-bucket reclassify surfaces "Movida a Combustible." in the SAME page-owned role=status region as the cross-bucket case (confirmacion-reclasificar)', async () => {
    stubFetchInteraccion();
    const user = userEvent.setup();

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await expandirGrupo(/Ñoquis/);

    const selects = await screen.findAllByRole('combobox');
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // Same-bucket: the Ñoquis row (Necesidades) picks another Necesidades
    // categoría — no confirmation dialog, straight commit.
    await user.selectOptions(primerSelect, 'Necesidades · Combustible');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    const statusRegion = await screen.findByRole(
      'status',
      {},
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(statusRegion).toHaveTextContent('Movida a Combustible.'),
    );

    // Same page-level sibling contract as the cross-bucket case (D-07).
    expect(
      statusRegion.closest('[data-testid="grupo-movimientos"]'),
    ).toBeNull();
  });

  // ── "patrón desde movimiento" offer (issue #745) ──

  it('creating a pattern from the post-reclassify offer announces it in the SAME shared anuncio region as "Movida a…" (issue #745)', async () => {
    stubFetchInteraccion();
    const user = userEvent.setup();

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await expandirGrupo(/Ñoquis/);

    const selects = await screen.findAllByRole('combobox');
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // Same-bucket reclassify (no confirmation) — the offer to create a
    // pattern appears right after this commits.
    await user.selectOptions(primerSelect, 'Necesidades · Combustible');

    const statusRegion = await screen.findByRole(
      'status',
      {},
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(statusRegion).toHaveTextContent('Movida a Combustible.'),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Crear patrón' }),
    );
    // "Ñoquis de la abuela" is the row's own descripcion (GRUPO_FIXTURE
    // above).
    await user.click(screen.getByRole('button', { name: 'Ñoquis' }));
    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    // Reuses the SAME page-level `anuncio` region — one status line for
    // every mutation this screen can trigger, not a new one per affordance
    // (same discipline as `alMovida`/`alEliminarMovimiento`/
    // `alReevaluarPatrones`/`alCategoriaCreada`).
    await waitFor(() =>
      expect(statusRegion).toHaveTextContent(
        'Patrón «Ñoquis» creado. Se usará en tus próximas importaciones.',
      ),
    );
  });

  // Fix 5: periodo change clears the announcement.
  it('Fix-5: announcement clears when periodo prop changes (periodoAnterior setState-during-render, D-07)', async () => {
    stubFetchInteraccion();
    const user = userEvent.setup();

    const { rerenderConRouter } = renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await expandirGrupo(/Ñoquis/);

    const selects = await screen.findAllByRole('combobox');
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // Set the announcement via a cross-bucket move.
    await user.selectOptions(primerSelect, 'Gustos · Paseos');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    const statusRegion = await screen.findByRole(
      'status',
      {},
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(statusRegion).toHaveTextContent('Movida a Gustos.'),
    );

    // Change the periodo prop — the announcement must clear.
    rerenderConRouter(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoCompleto })}
        periodo="2026-06"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await waitFor(() => expect(statusRegion).toHaveTextContent(''));
  });

  // ── WEB-DEL-01: delete affordance (SDD correccion-movimientos-manuales PR 3) ──

  describe('delete affordance (WEB-DEL-01)', () => {
    it('confirming a delete on the manual row (tx-9, "Sin categoría" group) announces success in the SHARED anuncio region and moves focus to the heading (D-03 reuse)', async () => {
      stubFetchInteraccion();
      const user = userEvent.setup();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      // Sin categoría starts collapsed (destacar is false here) — expand it
      // to reach the delete control on tx-9.
      await expandirGrupo(/Sin categoría/);

      await user.click(
        await screen.findByRole('button', {
          name: /Eliminar movimiento Algo sin categorizar/i,
        }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      const statusRegion = screen.getByTestId('anuncio-reclasificar');
      await waitFor(() =>
        expect(statusRegion).toHaveTextContent('Movimiento eliminado.'),
      );
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });

    it('renders no delete control on BCI rows, only on the Manual row', async () => {
      stubFetchInteraccion();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      await expandirGrupo(/Sin categoría/);
      await expandirGrupo(/Ñoquis/);

      await screen.findByRole('button', {
        name: /Eliminar movimiento Algo sin categorizar/i,
      });
      expect(
        screen.queryByRole('button', {
          name: /Eliminar movimiento Ñoquis de la abuela/i,
        }),
      ).not.toBeInTheDocument();
    });

    it('esDemo disables the delete trigger and shows an explanatory note', async () => {
      stubFetchInteraccion();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
          esDemo
        />,
      );

      await expandirGrupo(/Sin categoría/);
      expect(
        await screen.findByRole('button', {
          name: /Eliminar movimiento Algo sin categorizar/i,
        }),
      ).toBeDisabled();
      // Two `role="note"` elements coexist in `esDemo` (this page's own
      // MENSAJE_DEMO_ELIMINAR, plus `ReevaluarPatronesControl`'s own demo
      // note) — `getAllByRole` + a text match scopes to THIS one, unlike
      // the pre-`ReevaluarPatronesControl` version of this test.
      const notas = screen.getAllByRole('note');
      expect(
        notas.some((nota) =>
          /eliminar movimientos/i.test(nota.textContent ?? ''),
        ),
      ).toBe(true);
    });

    it('esDemo=false (default) renders no explanatory note', async () => {
      stubFetchInteraccion();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      await expandirGrupo(/Sin categoría/);
      await screen.findByRole('button', {
        name: /Eliminar movimiento Algo sin categorizar/i,
      });
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });
  });

  describe('ReevaluarPatronesControl integration (WEB-REEV-01)', () => {
    function stubFetchReevaluar(
      dto: {
        transaccionesEvaluadas: number;
        transaccionesActualizadas: number;
      },
      catalogo: CatalogoDto = CATALOGO_FIXTURE,
    ) {
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (
          init?.method === 'POST' &&
          url.includes('/transacciones/reevaluar')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(dto),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(catalogo),
        } as Response);
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('renders the trigger in the header, next to the period selector', async () => {
      stubFetchInteraccion();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      expect(
        await screen.findByRole('button', { name: /Reevaluar categorías/i }),
      ).toBeInTheDocument();
    });

    it('a confirmed reevaluation announces the outcome via the shared page-level status region', async () => {
      const fetchMock = stubFetchReevaluar({
        transaccionesEvaluadas: 12,
        transaccionesActualizadas: 5,
      });
      const user = userEvent.setup();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      const trigger = await screen.findByRole('button', {
        name: /Reevaluar categorías/i,
      });
      await user.click(trigger);
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Reevaluar' }));

      const statusRegion = screen.getByTestId('anuncio-reclasificar');
      await waitFor(() =>
        expect(statusRegion).toHaveTextContent(
          'Se reevaluaron 12 movimientos: 5 actualizados.',
        ),
      );
      expect(fetchMock).toHaveBeenCalledWith('/api/transacciones/reevaluar', {
        method: 'POST',
      });
    });

    it('esDemo disables the reevaluate trigger', async () => {
      stubFetchInteraccion();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
          esDemo
        />,
      );

      expect(
        await screen.findByRole('button', { name: /Reevaluar categorías/i }),
      ).toBeDisabled();
    });
  });

  // ── AgregarCategoriaControl integration (issue #743) ──
  //
  // The usability finding: a tester opened a bucket's detail screen and
  // looked for an "add category" affordance right there, instead of leaving
  // to Configuración → Categorías. `AgregarCategoriaControl` mounts a
  // "Agregar categoría" trigger in this page's header (same slot as
  // `ReevaluarPatronesControl`) that reuses `NuevaCategoriaDesdeFilaForm`
  // (crear-categoria-desde-preview precedent) with the bucket FIXED to
  // `viewModel.bucket` — never a user choice on this screen. Hidden on
  // `SinCategoria` (BUCKETS_ASIGNABLES gate) since that bucket cannot own a
  // categoría. `useCrearCategoria`'s own `onSuccess` seeds the shared
  // `['categorias']` query BEFORE invalidating (see that hook's own
  // docblock) — this is what makes the created categoría selectable in
  // `ReclasificarCategoriaControl` without a reload, no extra plumbing
  // needed here.
  describe('AgregarCategoriaControl integration (issue #743)', () => {
    // A successful POST also grows the GET fixture (mutable local state) —
    // the mutation's own onSuccess (useCrearCategoria) seeds the cache
    // BEFORE invalidating, but the invalidation's refetch still hits this
    // same mock: a stub that always answered the ORIGINAL fixture would
    // stomp that seed the instant TanStack Query's background refetch
    // resolves, undoing the very freshness this feature exists to prove.
    function stubFetchConCrearCategoria(
      respuestaCrear: {
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
      },
      catalogoInicial: CatalogoDto = CATALOGO_FIXTURE,
    ) {
      let catalogoActual = catalogoInicial;
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url === '/api/categorias') {
          if (respuestaCrear.ok) {
            const creada = (await respuestaCrear.json()) as CategoriaDto;
            catalogoActual = {
              categorias: [...catalogoActual.categorias, creada],
            };
          }
          return {
            ok: respuestaCrear.ok,
            status: respuestaCrear.status,
            json: respuestaCrear.json,
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(catalogoActual),
        } as Response;
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('renders the "Agregar categoría" trigger in the header for an assignable bucket (Necesidades)', async () => {
      stubFetchInteraccion();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      expect(
        await screen.findByRole('button', { name: 'Agregar categoría' }),
      ).toBeInTheDocument();
    });

    it('does NOT render the trigger on the SinCategoria bucket detail screen (not assignable)', async () => {
      stubFetchInteraccion();
      const dtoSinCategoria: DetalleBucketMesDto = {
        ...dtoCompleto,
        bucket: 'SinCategoria',
      };

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoSinCategoria })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      await verPrimerGrupo();
      expect(
        screen.queryByRole('button', { name: 'Agregar categoría' }),
      ).not.toBeInTheDocument();
    });

    it('esDemo disables the trigger', async () => {
      stubFetchInteraccion();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
          esDemo
        />,
      );

      expect(
        await screen.findByRole('button', { name: 'Agregar categoría' }),
      ).toBeDisabled();
    });

    it('creating a category closes the form, announces success in the shared anuncio region, and the new category becomes selectable in the reclassify control without a reload', async () => {
      const fetchMock = stubFetchConCrearCategoria({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'categoria-mascotas',
            nombre: 'Mascotas',
            bucket: 'Necesidades',
            patrones: [],
            transaccionesCount: 0,
          }),
      });
      const user = userEvent.setup();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      await user.click(
        await screen.findByRole('button', { name: 'Agregar categoría' }),
      );
      await user.type(screen.getByLabelText('Nombre'), 'Mascotas');
      await user.click(screen.getByRole('button', { name: 'Crear' }));

      const statusRegion = screen.getByTestId('anuncio-reclasificar');
      await waitFor(() =>
        expect(statusRegion).toHaveTextContent('Categoría «Mascotas» creada.'),
      );
      // The form closed on success — its own "Crear" button is gone.
      expect(
        screen.queryByRole('button', { name: 'Crear' }),
      ).not.toBeInTheDocument();

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/categorias',
        expect.objectContaining({ method: 'POST' }),
      );

      // The new categoría must be selectable in the SAME screen's reclassify
      // control right away — no reload, no re-mount.
      await expandirGrupo(/Ñoquis/);
      const selects = await screen.findAllByRole('combobox');
      const primerSelect = selects[0] as HTMLSelectElement;
      await waitFor(() => expect(primerSelect).not.toBeDisabled());
      expect(
        within(primerSelect).getByRole('option', {
          name: 'Necesidades · Mascotas',
        }),
      ).toBeInTheDocument();
    });

    it('a duplicate-name error from the server renders inline as a form-level alert, using the existing catalog error copy', async () => {
      stubFetchConCrearCategoria({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            code: 'NOMBRE_DUPLICADO',
            message: 'a raw server string that must never render',
          }),
      });
      const user = userEvent.setup();

      renderData(
        <BucketDetalleMesPage
          query={mockQuery({ data: dtoCompleto })}
          periodo="2026-07"
          onPeriodoChange={() => {}}
          destacar={false}
        />,
      );

      await user.click(
        await screen.findByRole('button', { name: 'Agregar categoría' }),
      );
      await user.type(screen.getByLabelText('Nombre'), 'Ñoquis');
      await user.click(screen.getByRole('button', { name: 'Crear' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ya tienes una categoría con ese nombre en ese grupo.',
      );
      expect(screen.queryByText(/a raw server string/)).not.toBeInTheDocument();
    });
  });
});
