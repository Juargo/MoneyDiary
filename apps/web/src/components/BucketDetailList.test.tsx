import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BucketDetailList } from './BucketDetailList';
import { QUERY_CLIENT_DEFAULTS } from '@/api/query-client-defaults';
import type { CatalogoDto, DetalleBucketDto } from '@/api/types';

// Owns the fetch (via useDetalleBucket), the {loading|error|empty|data}
// state switch (reusing the shared Loading/ErrorState/Empty from W1), and
// the flat row rendering including the SinCategoria classify CTA + the
// always-disabled inline-edit placeholder (spec W3-03, CA-02/CA-03).
const dataDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado Líder',
      cargo: '9007199254740993',
      abono: '0',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
      categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
    },
  ],
};

const sinCategoriaDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'SinCategoria',
  transacciones: [
    {
      id: 'tx-2',
      fecha: '2026-07-01T00:00:00.000Z',
      descripcion: 'Transferencia recibida',
      cargo: '0',
      abono: '50000',
      banco: 'BCI',
      tipoCuenta: 'Corriente',
      numeroCuenta: '87654321',
      categoria: null,
    },
  ],
};

const emptyDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'Ahorro',
  transacciones: [],
};

// Two rows in the SAME categoría group so both mount
// `ReclasificarCategoriaControl` — used by the catalog fetch-lifecycle
// surface tests below (WCAT-04 delta) to prove the status/alert render
// exactly ONCE per panel, not once per mounted row.
const dosFilasDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
  transacciones: [
    dataDto.transacciones[0],
    {
      id: 'tx-1b',
      fecha: '2026-07-16T00:00:00.000Z',
      descripcion: 'Supermercado Jumbo',
      cargo: '5000',
      abono: '0',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
      categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
    },
  ],
};

// `QUERY_CLIENT_DEFAULTS` (same `staleTime` as production, same fix class as
// judgment-day PR #336/#337 fix 2 on `CategoriasPanel.test.tsx`): without it,
// the test client falls back to TanStack's own default (`staleTime: 0`), and
// once `BucketDetailList` itself calls `useCategorias()` (WCAT-04 delta)
// ahead of the per-row `ReclasificarCategoriaControl` mounts, a NEW observer
// joining an already-settled, `staleTime: 0` query triggers a spurious
// refetch-on-mount that has nothing to do with the component under test —
// this bit the "no extra network request" assertion below before this fix.
// `Wrapper.queryClient` is attached (mirrors
// `ReclasificarCategoriaControl.test.tsx`'s own `crearWrapper`) so tests can
// drive a background refetch directly via `wrapper.queryClient.refetchQueries(...)`.
function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
        retry: false,
      },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  Wrapper.queryClient = queryClient;
  return Wrapper;
}

// `ReclasificarCategoriaControl` (rendered per row, US-013 S6b) depends on
// `useCategorias()` since US-043 §7 — a second, independent fetch from the
// row's own `/api/detalle-bucket` one. `mockFetchOnce` routes it to a
// minimal live catalog so the select isn't stuck disabled forever (a
// mismatched-shape body fails `esCatalogoDto`'s guard and never resolves
// `data`); every other URL keeps getting the caller's own `response`.
const CATALOGO_FIXTURE: CatalogoDto = {
  categorias: [
    {
      id: 'categoria-supermercado',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
  ],
};

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/categorias') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(CATALOGO_FIXTURE),
      });
    }
    return Promise.resolve(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('BucketDetailList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the loading state with detail-appropriate copy while the query is pending', () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    expect(screen.getByText('Cargando movimientos…')).toBeInTheDocument();
    expect(screen.queryByText('Cargando resumen…')).not.toBeInTheDocument();
  });

  it('renders the error state with a retry affordance when the request fails', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();
  });

  it('renders the empty state with detail-appropriate copy when the bucket has no transactions in the period', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(emptyDto),
    });

    render(<BucketDetailList bucket="Ahorro" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() =>
      expect(
        screen.getByText('No hay movimientos en este bucket para el período.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Carga una cartola/)).not.toBeInTheDocument();
  });

  it('renders each row exact CLP amount, beyond safe-integer precision (spec W3-03)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
    );
    // The exact amount now also appears in the group's subtotal heading
    // (WCAT-02) — match the row's own "Cargo: …" span exactly so this stays
    // a precise assertion on the row rendering, not an incidental match on
    // the group header.
    expect(
      screen.getByText('Cargo: $9.007.199.254.740.993'),
    ).toBeInTheDocument();
  });

  it('groups transactions under a categoría header showing nombre · subtotal · conteo (WCAT-02)', async () => {
    const dosCategoriasDto: DetalleBucketDto = {
      periodo: '2026-07',
      bucket: 'Necesidades',
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Supermercado Líder',
          cargo: '10000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
          categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
        },
        {
          id: 'tx-2',
          fecha: '2026-07-16T00:00:00.000Z',
          descripcion: 'Supermercado Jumbo',
          cargo: '5000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
          categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
        },
        {
          id: 'tx-3',
          fecha: '2026-07-17T00:00:00.000Z',
          descripcion: 'Farmacia Cruz Verde',
          cargo: '3000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
          categoria: { id: 'categoria-farmacia', nombre: 'Farmacia' },
        },
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dosCategoriasDto),
    });

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
    );
    // Two groups, Farmacia before Supermercado — alphabetical order (es-CL),
    // not the retired fixed Categoria order (WCAT-02 delta, US-043 §7).
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Farmacia · $3.000 · 1 movimiento',
      'Supermercado · $15.000 · 2 movimientos',
    ]);
    expect(screen.getByText('Supermercado Jumbo')).toBeInTheDocument();
    expect(screen.getByText('Farmacia Cruz Verde')).toBeInTheDocument();
  });

  // WDS-06: the group header shows a visually distinct total badge — a
  // separate element from the heading text, computed client-side from
  // already-fetched data, BigInt-safe beyond Number.MAX_SAFE_INTEGER.
  it('shows an aggregated total badge next to the group header with the exact BigInt-safe amount (WDS-06)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('categoria-total-badge')).toHaveTextContent(
      '$9.007.199.254.740.993',
    );
    // The badge is additive — the group heading's own accessible text stays
    // exactly as before (no duplicated/altered content inside the heading).
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Supermercado · $9.007.199.254.740.993 · 1 movimiento',
      }),
    ).toBeInTheDocument();
  });

  // WDS-05: each group header shows a category icon (decorative,
  // aria-hidden) mapped from the categoría name, with a generic fallback for
  // "Sin categoría" — never throws, never leaves the header iconless.
  it('shows a decorative category icon beside the group header (WDS-05)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    const { container } = render(
      <BucketDetailList bucket="Necesidades" periodo="2026-07" />,
      {
        wrapper: crearWrapper(),
      },
    );

    await waitFor(() =>
      expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
    );
    expect(
      container.querySelector('svg[aria-hidden="true"]'),
    ).toBeInTheDocument();
  });

  it('groups SinCategoria rows under a "Sin categoría" header (WCAT-02)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sinCategoriaDto),
    });

    render(<BucketDetailList bucket="SinCategoria" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() =>
      expect(screen.getByText('Transferencia recibida')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Sin categoría · $0 · 1 movimiento',
      }),
    ).toBeInTheDocument();
  });

  it('demotes group headings one level below the bucket heading (h3 when headingLevel="h2", dashboard reuse)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    render(
      <BucketDetailList
        bucket="Necesidades"
        periodo="2026-07"
        headingLevel="h2"
      />,
      {
        wrapper: crearWrapper(),
      },
    );

    await waitFor(() =>
      expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Necesidades' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Supermercado · $9.007.199.254.740.993 · 1 movimiento',
      }),
    ).toBeInTheDocument();
  });

  // US-013 S6b (WCAT-04/05): the two disabled placeholders ("Clasificar" /
  // "Editar categoría") are replaced by ONE reclassify `<select>` per row —
  // see `ReclasificarCategoriaControl.test.tsx` for its own dedicated
  // coverage (optgroup contents, cross-bucket confirmation, pending/error
  // UX). These two tests just confirm `BucketDetailList` wires it in with
  // the right per-row props (accessible name, preselected value).
  it('renders an enabled reclassify select per row, accessibly named, preselected to the current categoría', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    const select = (await screen.findByLabelText(
      'Cambiar categoría de Supermercado Líder',
    )) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select.value).toBe('Supermercado');
    expect(
      screen.queryByRole('button', { name: /Editar categoría|Clasificar/ }),
    ).not.toBeInTheDocument();
  });

  it('a SinCategoria row renders the reclassify select with no categoría preselected (assign flow)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sinCategoriaDto),
    });

    render(<BucketDetailList bucket="SinCategoria" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    const select = (await screen.findByLabelText(
      'Cambiar categoría de Transferencia recibida',
    )) as HTMLSelectElement;
    // Waits for the catalog fetch to settle (like the sibling test above) —
    // asserting `select.value` beforehand only passed by coincidence: the
    // loading branch's disabled placeholder and the loaded branch's
    // "Sin categoría" placeholder both happen to render the same `''` value
    // for `categoriaActual === null`, so it never actually verified
    // post-load behaviour.
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select.value).toBe('');
  });

  // US-030 Slice B (task 30.10): the dashboard reuses this component verbatim
  // for its transactions panel, but that panel sits inside a page that
  // already has its own page-level <h1> — this component's own heading must
  // demote to <h2> there so the page keeps exactly one <h1> (ADR-018).
  // Defaults to 'h1' (unchanged) for the standalone `/buckets/:bucket` route.
  it('demotes its own heading to h2 when headingLevel="h2" is passed (US-030 dashboard reuse)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    render(
      <BucketDetailList
        bucket="Necesidades"
        periodo="2026-07"
        headingLevel="h2"
      />,
      {
        wrapper: crearWrapper(),
      },
    );

    await waitFor(() =>
      expect(screen.getByText('Necesidades')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Necesidades' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('defaults to h1 when headingLevel is not passed (standalone route, unchanged)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'Necesidades' }),
      ).toBeInTheDocument(),
    );
  });

  // Phase 4 mobile audit (WDS-04): lock in the single-column, 16px-margin
  // wrapper so an accidental removal of the responsive classes fails loudly
  // (jsdom doesn't evaluate CSS, so we assert the classes directly — same
  // pattern used across the other dashboard sections).
  it('reflows single-column with 16px page margins on mobile (Phase 4 mobile audit, WDS-04)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dataDto),
    });

    const { container } = render(
      <BucketDetailList bucket="Necesidades" periodo="2026-07" />,
      {
        wrapper: crearWrapper(),
      },
    );

    await waitFor(() =>
      expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
    );
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.className).toMatch(/\bflex-col\b/);
    expect(raiz.className).toMatch(/\bp-4\b/);
  });

  // FIX 1: the heading must show the UI label ("Gustos"), never the raw
  // domain bucket name ("Deseos") — the pie/legend already resolve this via
  // ETIQUETA_BUCKET, this component was the one place that skipped it.
  it('shows the UI label in the heading, not the raw domain bucket name (FIX 1)', async () => {
    const deseosDto: DetalleBucketDto = {
      periodo: '2026-07',
      bucket: 'Deseos',
      transacciones: [
        {
          id: 'tx-3',
          fecha: '2026-07-10T00:00:00.000Z',
          descripcion: 'Restaurante',
          cargo: '15000',
          abono: '0',
          banco: 'BCI',
          tipoCuenta: 'Corriente',
          numeroCuenta: '11111111',
          categoria: { id: 'categoria-delivery', nombre: 'Delivery' },
        },
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(deseosDto),
    });

    render(<BucketDetailList bucket="Deseos" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    });

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Gustos' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Deseos')).not.toBeInTheDocument();
  });

  // WCAT-04 delta — catalog fetch-lifecycle surface lifted here from
  // `ReclasificarCategoriaControl` (three judgment-day rounds converged on
  // this root cause: catalog-scoped state was rendered per row, duplicating
  // N times for a single shared `['categorias']` query). These tests prove
  // the lift: exactly one announcement/alert per panel regardless of row
  // count, no extra network request, and no conflation with the unrelated
  // transactions query's own Loading/ErrorState/Empty branches above.
  describe('catalog fetch-lifecycle surface (WCAT-04 delta)', () => {
    // Judgment-day fix (PR #6): the previous version of this test asserted
    // "exactly one /api/categorias call with N rows mounted" — but that
    // guarantee comes entirely from TanStack Query's per-`queryKey` dedup
    // across the row-level observers, which predates this component's own
    // `useCategorias()` call (proven empirically: reverting
    // `BucketDetailList.tsx` to the commit before it existed and re-running
    // the old assertion still passed). To isolate what THIS component's own
    // call actually adds, keep the transactions query permanently
    // `isPending` — no row (and therefore no row-level `useCategorias()`
    // observer) ever mounts — and assert the catalog request still fires.
    // This can only pass if the panel itself owns an observer independent
    // of any row. This same assertion also PINS the "prefetch is
    // unconditional" decision from the component's JSDoc (Issue 3): the
    // catalog request fires before the transactions query has resolved to
    // any state at all.
    it("BucketDetailList's own useCategorias() call fires the catalog request even when no row ever mounts (isolates the panel-level observer from the pre-existing per-row dedup; pins the unconditional prefetch)", async () => {
      const fetchMock = vi.fn((url: string) => {
        if (url === '/api/categorias') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(CATALOGO_FIXTURE),
          });
        }
        // The transactions request never resolves — `query.isPending` stays
        // `true` forever, so the component never reaches the JSX that
        // renders any row/`ReclasificarCategoriaControl`.
        return new Promise(() => {});
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
        wrapper: crearWrapper(),
      });

      expect(screen.getByText('Cargando movimientos…')).toBeInTheDocument();
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.filter(([url]) => url === '/api/categorias'),
        ).toHaveLength(1),
      );
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('with multiple rows mounted, exactly one role="status" catalog-loading announcement exists — not one per row', async () => {
      let resolverCatalogo: (value: unknown) => void = () => {};
      const fetchMock = vi.fn((url: string) => {
        if (url === '/api/categorias') {
          return new Promise((resolve) => {
            resolverCatalogo = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(dosFilasDto),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
        wrapper: crearWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
      );
      // Two rows mounted (two `ReclasificarCategoriaControl` instances, each
      // with `data === undefined` right now), but the announcement lives
      // ONCE at the panel level.
      expect(screen.getAllByRole('status')).toHaveLength(1);
      const selects = screen.getAllByRole('combobox');
      expect(selects).toHaveLength(2);
      selects.forEach((select) => expect(select).toBeDisabled());

      resolverCatalogo({
        ok: true,
        status: 200,
        json: () => Promise.resolve(CATALOGO_FIXTURE),
      });

      await waitFor(() =>
        expect(screen.queryByRole('status')).not.toBeInTheDocument(),
      );
      selects.forEach((select) => expect(select).not.toBeDisabled());
    });

    it('with multiple rows mounted, a catalog failure with no data shows exactly one role="alert" and one "Reintentar" — not one per row', async () => {
      const fetchMock = vi.fn((url: string) => {
        if (url === '/api/categorias') {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(dosFilasDto),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
        wrapper: crearWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
      );
      await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
      expect(
        screen.getAllByRole('button', { name: 'Reintentar' }),
      ).toHaveLength(1);
      // The catalog genuinely never loaded: both rows' selects stay
      // disabled, but the failure itself is announced/recoverable exactly
      // once at the panel level, not duplicated per row.
      const selects = screen.getAllByRole('combobox');
      expect(selects).toHaveLength(2);
      selects.forEach((select) => expect(select).toBeDisabled());
    });

    it('clicking "Reintentar" and resolving successfully clears the alert and enables the selects (recovery path)', async () => {
      // A boolean success flag rather than a call-count branch: with N rows
      // mounted, a query that never got data (`dataUpdatedAt === 0`) is
      // ALWAYS considered stale regardless of `staleTime` — TanStack Query
      // may legitimately fire more than one automatic refetch-on-mount
      // attempt as each row's own `useCategorias()` observer joins (all
      // still failing until this flag flips). Gating on a flag instead of a
      // fixed call number keeps the test correct regardless of exactly how
      // many of those automatic attempts happen before the user's own click.
      let catalogoOk = false;
      const fetchMock = vi.fn((url: string) => {
        if (url === '/api/categorias') {
          return Promise.resolve(
            catalogoOk
              ? {
                  ok: true,
                  status: 200,
                  json: () => Promise.resolve(CATALOGO_FIXTURE),
                }
              : { ok: false, status: 500 },
          );
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(dosFilasDto),
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
        wrapper: crearWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByText('Supermercado Líder')).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(screen.getByRole('alert')).toBeInTheDocument(),
      );

      catalogoOk = true;
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));

      await waitFor(() =>
        expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
      );
      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      await waitFor(() =>
        selects.forEach((select) => expect(select).not.toBeDisabled()),
      );
    });

    it('a background catalog refetch over already-loaded data shows neither the status nor the alert at the panel level, and does not disable the selects', async () => {
      let catalogoFetchCount = 0;
      let resolveSegundoFetch: (value: unknown) => void = () => {};
      const fetchMock = vi.fn((url: string) => {
        if (url === '/api/categorias') {
          catalogoFetchCount += 1;
          if (catalogoFetchCount === 1) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(CATALOGO_FIXTURE),
            });
          }
          return new Promise((resolve) => {
            resolveSegundoFetch = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(dataDto),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const wrapper = crearWrapper();
      render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
        wrapper,
      });

      const select = (await screen.findByLabelText(
        'Cambiar categoría de Supermercado Líder',
      )) as HTMLSelectElement;
      await waitFor(() => expect(select).not.toBeDisabled());

      void wrapper.queryClient.refetchQueries({ queryKey: ['categorias'] });
      await waitFor(() => expect(catalogoFetchCount).toBe(2));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(select).not.toBeDisabled();

      resolveSegundoFetch({ ok: false, status: 500 });

      await waitFor(() =>
        expect(
          wrapper.queryClient.getQueryState(['categorias'])?.fetchStatus,
        ).toBe('idle'),
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(select).not.toBeDisabled();
    });

    // Judgment-day fix (PR #6): the previous version of this test used
    // `mockFetchOnce`, which always resolves `/api/categorias` successfully
    // — so `categoriasFallidasSinDatos` was never `true` and the catalog's
    // own `role="alert"` branch was unreachable regardless of the assertion.
    // The test passed against a component with NO early-return guard at all
    // for the same reason: nothing ever put the catalog into its error
    // branch. Failing BOTH queries at once makes the assertion actually
    // discriminating — if a regression moved the catalog's alert markup
    // above the transactions early returns, this would observe two alerts.
    it('the catalog surface does not conflate with the transactions query — a failed transactions fetch still shows its own ErrorState, not the catalog banner, even when the catalog itself also fails', async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve({ ok: false, status: 500 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
        wrapper: crearWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByRole('alert')).toBeInTheDocument(),
      );
      // Both the transactions query AND the catalog query are failing here.
      // The transactions `ErrorState`'s early return happens before the
      // catalog's own status/alert markup is ever reached, so exactly one
      // alert renders — not two, which is what a conflation regression
      // would produce.
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(
        screen.getByRole('button', { name: 'Reintentar' }),
      ).toBeInTheDocument();
    });

    // Judgment-day finding (Judge B) — VERIFIED, and CORRECTED after
    // empirical investigation: Judge B's diagnosis was that
    // `disabled={categoriasQuery.isFetching}` would strand a keyboard
    // user's focus on retry. Reverting to the pre-fix code and forcing a
    // genuinely in-flight retry (a held/never-resolving mocked fetch)
    // proved something more specific: this whole block is gated on
    // `categoriasQuery.error !== null`, and TanStack Query resets a
    // still-dataless query's `error` to `null` (and `status` to
    // `'pending'`) at the START of every fetch — including this button's
    // own `refetch()` — so the block (button included) UNMOUNTS the
    // instant a retry begins; `categoriasQuery.isFetching` was never
    // observably `true` while the button was still mounted. `disabled`
    // was therefore dead code (same class as the dead `disabled` already
    // removed from `ReclasificarCategoriaControl` in an earlier round),
    // not a reachable, harmful binding as originally framed — this test
    // only asserts what removing it actually proves: no render of this
    // button ever carries `disabled`. It does NOT assert focus survives a
    // retry — that would be false; the real focus-stranding cause is the
    // unmount described above, which is a separate, still-open issue (see
    // the component's own JSDoc note) outside this fix's scope.
    it('the catalog banner "Reintentar" button never carries a `disabled` attribute, in any render where it is on screen (dead-code binding removed)', async () => {
      let intentos = 0;
      const fetchMock = vi.fn((url: string) => {
        if (url === '/api/categorias') {
          intentos += 1;
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(dataDto),
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
        wrapper: crearWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByRole('alert')).toBeInTheDocument(),
      );
      let boton = screen.getByRole('button', { name: 'Reintentar' });
      expect(boton).not.toBeDisabled();

      const intentosAntes = intentos;
      await user.click(boton);
      await waitFor(() => expect(intentos).toBeGreaterThan(intentosAntes));

      // The click's own retry settles back to a failure (this mock always
      // fails) — a fresh render of the same banner, still never disabled.
      await waitFor(() =>
        expect(screen.getByRole('alert')).toBeInTheDocument(),
      );
      boton = screen.getByRole('button', { name: 'Reintentar' });
      expect(boton).not.toBeDisabled();
    });
  });
});
