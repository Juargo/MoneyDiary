import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import { BucketDetalleMesPage } from './BucketDetalleMesPage';
import { renderConRouter } from '@/test/router-harness';
import { resetUndoManagerParaTests } from '@/lib/undo-manager';
import type { ApiError } from '@/api/client';
import type { CatalogoDto, DetalleBucketMesDto } from '@/api/types';

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

const dtoSinMeta: DetalleBucketMesDto = {
  ...dtoCompleto,
  porcentajeBp: null,
  metaBp: null,
};

const dtoSinIngreso: DetalleBucketMesDto = {
  ...dtoCompleto,
  porcentajeBp: null,
  metaBp: 5000,
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

    // Header keeps the zeroed totals + selector (WDM-05: navigation survives).
    expect(
      await screen.findByText('Total $0 · 0 movimientos'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Sin movimientos en julio 2026'),
    ).toBeInTheDocument();
    expect(screen.queryByText('ver 2 más…')).not.toBeInTheDocument();
    // No group sections render for an empty month.
    expect(screen.queryAllByTestId('grupo-movimientos')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06');
  });

  it('renders the full header: breadcrumb, selector, %/meta tag, usage bar and totals line (WDM-01)', async () => {
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
    expect(screen.getByText('55% · Meta: 50%')).toBeInTheDocument();
    expect(screen.getByTestId('usage-bar')).toBeInTheDocument();
    expect(
      screen.getByText('Total $500.000 · 9 movimientos'),
    ).toBeInTheDocument();
  });

  it('renders no %/meta tag and no usage bar for SinCategoria (metaBp and porcentajeBp null)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoSinMeta })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    expect(screen.queryByText(/Meta:/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('usage-bar')).not.toBeInTheDocument();
  });

  it('renders the "—" usage tag but hides the bar for a no-income month (D-02)', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });

    renderData(
      <BucketDetalleMesPage
        query={mockQuery({ data: dtoSinIngreso })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
        destacar={false}
      />,
    );

    await verPrimerGrupo();
    expect(screen.getByText('— · Meta: 50%')).toBeInTheDocument();
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
      'Ñoquis · $300.000 · 3 movimientos',
      'Zapatería · $150.000 · 5 movimientos',
      'Sin categoría · $50.000 · 1 movimiento',
    ]);
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

    await screen.findByText('Total $9.007.199.254.740.993 · 1 movimiento');
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
        name: 'Ñoquis · $9.007.199.254.740.993 · 1 movimiento',
      }),
    ).toBeInTheDocument();
  });

  it('collapses groups to 3 rows and expands via "ver N más…" / "Ver menos" (WDM-03/1)', async () => {
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

    await screen.findByText('Zapatos de cuero');
    // Collapsed: 5th Zapatería row is NOT rendered at all (slice, not CSS).
    expect(screen.queryByText('Zapatos café')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ver 2 más/ }));

    expect(await screen.findByText('Zapatos café')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ver menos' }),
    ).toBeInTheDocument();
  });

  it('renders no expand control for groups with ≤3 rows', async () => {
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
    // Only Zapatería (5 rows) gets the control; Ñoquis (3) and Sin categoría
    // (1) do not — exactly one control in the whole document.
    expect(
      screen.getAllByRole('button', { name: /más|Ver menos/ }),
    ).toHaveLength(1);
  });

  it('wires aria-expanded and aria-controls on the expand toggle', async () => {
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

    const grupoZapateria = (
      await screen.findAllByTestId('grupo-movimientos')
    )[1];
    const toggle = within(grupoZapateria).getByRole('button', {
      name: /ver 2 más/,
    });
    const lista = within(grupoZapateria).getByRole('list');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', lista.id);

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        within(grupoZapateria).getByRole('button', { name: 'Ver menos' }),
      ).toHaveAttribute('aria-expanded', 'true'),
    );
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

    await screen.findByText('Algo sin categorizar');
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
      const sinCategoria = grupos.find((g) =>
        within(g).queryByText('Sin categoría'),
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

    // Collapsed: Ñoquis 3 + Zapatería 3 + Sin categoría 1 = 7 visible rows.
    await waitFor(() =>
      expect(screen.getAllByRole('combobox')).toHaveLength(7),
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

  it('anuncio region is empty before any cross-bucket move (same-bucket path never sets it, D-07)', async () => {
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
    // No user interaction: the region must stay empty (D-07 invariant: only
    // a cross-bucket confirm sets it; same-bucket commits skip onMovida).
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

    // Wait for catalog to settle — the select must be enabled before we
    // can interact with it (all selects share the ['categorias'] query).
    const selects = await screen.findAllByRole('combobox');
    // The first visible row belongs to the Ñoquis group (Necesidades bucket
    // in dtoCompleto). Wait for the first select to be enabled.
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // Cross-bucket: Necesidades row → Paseos (Deseos) triggers the dialog.
    await user.selectOptions(primerSelect, 'Paseos');
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

    const selects = await screen.findAllByRole('combobox');
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // First cross-bucket move: Necesidades → Deseos → "Movida a Gustos."
    await user.selectOptions(primerSelect, 'Paseos');
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

    await user.selectOptions(segundoSelect, 'Ahorro');
    const dialog2 = await screen.findByRole('alertdialog');
    expect(dialog2).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(statusRegion).toHaveTextContent('Movida a Ahorro.'),
    );
    // The text is replaced, not appended — must not contain the first announcement.
    expect(statusRegion).not.toHaveTextContent('Gustos');
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

    const selects = await screen.findAllByRole('combobox');
    const primerSelect = selects[0] as HTMLSelectElement;
    await waitFor(() => expect(primerSelect).not.toBeDisabled());

    // Set the announcement via a cross-bucket move.
    await user.selectOptions(primerSelect, 'Paseos');
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

      expect(
        await screen.findByRole('button', {
          name: /Eliminar movimiento Algo sin categorizar/i,
        }),
      ).toBeDisabled();
      expect(screen.getByRole('note')).toHaveTextContent(/demostraci[oó]n/i);
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

      await screen.findByRole('button', {
        name: /Eliminar movimiento Algo sin categorizar/i,
      });
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });
  });
});
