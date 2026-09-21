import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ReclasificarCategoriaControl } from './ReclasificarCategoriaControl';
import type {
  CatalogoDto,
  CategoriaDto,
  ReclasificarCategoriaDto,
} from '@/api/types';

// `Wrapper.queryClient` is attached so a handful of tests can drive a
// background refetch directly (`wrapper.queryClient.refetchQueries(...)`)
// without a UI trigger for it — React ignores the extra property when using
// `Wrapper` as the `render(..., { wrapper })` option, so every pre-existing
// `{ wrapper: crearWrapper() }` call site keeps working unchanged.
function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  Wrapper.queryClient = queryClient;
  return Wrapper;
}

// The 8 seed-template categorías (US-043 §7 retires the hardcoded web copy,
// but this is what a real `GET /api/categorias` still returns for a fresh
// user) — same names/bucket the old `domain/categoria.ts` mirror hardcoded,
// now supplied as live data so every pre-existing scenario below keeps its
// original expectations (US-013 regression net, WCAT-04).
const CATALOGO_FIXTURE: CatalogoDto = {
  categorias: [
    {
      id: 'cat-supermercado',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-combustible',
      nombre: 'Combustible',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-farmacia',
      nombre: 'Farmacia',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-salud',
      nombre: 'Salud',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-transporte',
      nombre: 'Transporte',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-streaming',
      nombre: 'Streaming',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-delivery',
      nombre: 'Delivery',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-ahorro',
      nombre: 'Ahorro',
      bucket: 'Ahorro',
      patrones: [],
      transaccionesCount: 0,
    },
  ],
};

function respuestaCatalogo(catalogo: CatalogoDto) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(catalogo),
  };
}

/**
 * mockFetch — routes `GET /api/categorias` (the `useCategorias()` catalog
 * this component now depends on) to `catalogo` and everything else (the
 * reclassify `PATCH`) to `respuestaMutacion`. Two distinct fetches per
 * render, unlike the single-fetch mock this file used before task 49.
 */
function mockFetch(
  respuestaMutacion: {
    ok: boolean;
    status: number;
    json?: () => Promise<unknown>;
  },
  catalogo: CatalogoDto = CATALOGO_FIXTURE,
) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/categorias') {
      return Promise.resolve(respuestaCatalogo(catalogo));
    }
    return Promise.resolve(respuestaMutacion);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const dtoDestino: ReclasificarCategoriaDto = {
  id: 'tx-1',
  categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
  bucket: 'Necesidades',
};

// Two categorías named "Transporte" in different buckets — the fixture the
// decisive WDM-10 tests below need. Kept separate from CATALOGO_FIXTURE so
// the pre-existing scenarios (unique names) are unaffected.
const CATALOGO_DUPLICADO: CatalogoDto = {
  categorias: [
    {
      id: 'cat-transporte-necesidades',
      nombre: 'Transporte',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-transporte-deseos',
      nombre: 'Transporte',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-ahorro',
      nombre: 'Ahorro',
      bucket: 'Ahorro',
      patrones: [],
      transaccionesCount: 0,
    },
  ],
};

describe('ReclasificarCategoriaControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── WDM-10: identity is id-keyed end-to-end, disambiguating duplicate names ──

  it('renders each duplicate-named categoría as a distinct option keyed and valued by its own id, with the bucket visible in BOTH the option text and the optgroup (WDM-10, amended for bucket-visible options)', async () => {
    mockFetch(
      { ok: true, status: 200, json: () => Promise.resolve(dtoDestino) },
      CATALOGO_DUPLICADO,
    );

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber"
        montoLabel="$5.000"
        bucketActual="Necesidades"
        categoriaActual={{
          id: 'cat-transporte-necesidades',
          nombre: 'Transporte',
        }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber: Necesidades · Transporte',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // WDM-10 amendment (reclasificar-bucket-y-categoria): the bucket prefix
    // in the option TEXT is now the primary disambiguator for a homonym
    // pair — each option's own text is already distinct ("Necesidades ·
    // Transporte" vs "Gustos · Transporte"), so `getByRole('option', {
    // name })` resolves each one uniquely without a shared-name lookup.
    const opcionNecesidades = screen.getByRole('option', {
      name: 'Necesidades · Transporte',
    }) as HTMLOptionElement;
    const opcionDeseos = screen.getByRole('option', {
      name: 'Gustos · Transporte',
    }) as HTMLOptionElement;
    expect(opcionNecesidades.value).toBe('cat-transporte-necesidades');
    expect(opcionDeseos.value).toBe('cat-transporte-deseos');

    // The <optgroup> grouping is preserved alongside the text prefix — both
    // mechanisms now make the bucket visible, not just one.
    const grupoNecesidades = screen.getByRole('group', {
      name: 'Necesidades',
    }) as HTMLOptGroupElement;
    const grupoGustos = screen.getByRole('group', {
      name: 'Gustos',
    }) as HTMLOptGroupElement;
    expect(grupoNecesidades).toContainElement(opcionNecesidades);
    expect(grupoGustos).toContainElement(opcionDeseos);
  });

  it('selecting the duplicate-named categoría in a different bucket sends its exact id and shows the correct cross-bucket confirmation (WDM-10)', async () => {
    const fetchMock = mockFetch(
      { ok: true, status: 200, json: () => Promise.resolve(dtoDestino) },
      CATALOGO_DUPLICADO,
    );
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber"
        montoLabel="$5.000"
        bucketActual="Necesidades"
        categoriaActual={{
          id: 'cat-transporte-necesidades',
          nombre: 'Transporte',
        }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber: Necesidades · Transporte',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Selects the "Deseos" duplicate by its own id — not by the shared name.
    await user.selectOptions(select, 'cat-transporte-deseos');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Esto mueve $5.000 de Necesidades a Gustos',
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Exact body string equality — never the Necesidades duplicate's id,
    // and never a `nombre` field alongside it (an extra key would produce a
    // different JSON string and fail this assertion).
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoriaId: 'cat-transporte-deseos' }),
        }),
      ),
    );
  });

  it('renders a select with an accessible label naming the transaction and the CURRENT selection (WCAT-05, Label in Name)', () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expect(
      screen.getByLabelText(
        'Categoría de Supermercado Líder: Necesidades · Supermercado',
      ),
    ).toBeInTheDocument();
  });

  // WCAG 2.5.3 Label in Name (reclasificar-bucket-y-categoria-lista-rediseño,
  // Cambio 4): the redesigned select carries NO visible label of its own
  // anymore (the "Bucket y categoría" span was removed — the column header
  // "Categoría" in `GrupoMovimientos` now says it once for the whole list).
  // The only VISIBLE text this control has is the selected `<option>`'s own
  // text, rendered by the browser on the closed `<select>` — this test
  // proves the accessible name still contains that exact visible string, not
  // that a dedicated label span does.
  it('the accessible name contains the exact visible text of the selected option (WCAG 2.5.3)', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    const opcionVisible = select.options[select.selectedIndex].textContent;
    expect(opcionVisible).toBe('Necesidades · Supermercado');
    expect(select.getAttribute('aria-label')).toContain(opcionVisible);
  });

  it('while the catalog is loading, the select renders disabled offering only the current categoría — never empty (WCAT-04 delta)', async () => {
    let resolverCatalogo: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        return new Promise((resolve) => {
          resolverCatalogo = resolve;
        });
      }
      throw new Error(`unexpected fetch to ${url} while catalog is in flight`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;

    // Mid-flight, genuinely: the catalog fetch is a deferred promise that
    // has not settled yet, so this assertion runs while `data` is still
    // undefined — never a same-tick-resolved mock that would coalesce past
    // the loading render.
    expect(select).toBeDisabled();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(select.value).toBe('cat-supermercado');
    // The single loading-state option shows the bucket prefix too (from
    // `bucketActual`) — never a bucket-less label, even before the catalog
    // resolves (reclasificar-bucket-y-categoria).
    expect(screen.getByRole('option')).toHaveTextContent(
      'Necesidades · Supermercado',
    );

    resolverCatalogo(respuestaCatalogo(CATALOGO_FIXTURE));

    await waitFor(() => expect(select).not.toBeDisabled());
    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  it('offers exactly 3 spend-bucket optgroups — Necesidades, Deseos (Gustos), Ahorro — no Otros group, no Ingresos-bucket categoría (WCAT-04/D-06)', async () => {
    const catalogoConIngresos = {
      categorias: [
        ...CATALOGO_FIXTURE.categorias,
        {
          id: 'cat-ingresos',
          nombre: 'Sueldo',
          bucket: 'Ingresos',
          patrones: [],
          transaccionesCount: 0,
        },
      ],
    };
    mockFetch(
      { ok: true, status: 200, json: () => Promise.resolve(dtoDestino) },
      catalogoConIngresos,
    );

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Exactly 3 spend-bucket optgroups — no "Otros" and no Ingresos group.
    const grupos = screen.getAllByRole('group');
    expect(grupos).toHaveLength(3);
    expect(grupos.map((g) => (g as HTMLOptGroupElement).label)).toEqual([
      'Necesidades',
      'Gustos',
      'Ahorro',
    ]);
    // The Ingresos-bucket categoría is NOT offered.
    expect(
      screen.queryByRole('option', { name: 'Sueldo' }),
    ).not.toBeInTheDocument();
    // Current categoría preselected.
    expect(select.value).toBe('cat-supermercado');
  });

  it('the selected option text shown on the CLOSED select includes the bucket label, not just the categoría name (reclasificar-bucket-y-categoria)', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // The browser renders the SELECTED option's own text when the <select>
    // is closed — asserting the selected option's textContent is the jsdom
    // equivalent of "what a closed select shows".
    const opcionSeleccionada = select.options[select.selectedIndex];
    expect(opcionSeleccionada.textContent).toBe('Necesidades · Supermercado');
  });

  it('option text for the Deseos bucket uses the "Gustos" UI label, never the raw "Deseos" domain key', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    expect(
      screen.getByRole('option', { name: 'Gustos · Delivery' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Deseos · Delivery' }),
    ).not.toBeInTheDocument();
  });

  it('a SinCategoria row starts with no categoría selected (placeholder)', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-2"
        descripcion="Transferencia recibida"
        montoLabel="$0"
        bucketActual="SinCategoria"
        categoriaActual={null}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Transferencia recibida: Sin categoría',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    expect(select.value).toBe('');
  });

  it('a same-bucket reclassify commits immediately, no confirmation', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoriaId: 'cat-transporte' }),
        }),
      ),
    );
  });

  it('a cross-bucket reclassify shows a confirmation naming the money move, does not commit yet', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Esto mueve $15.000 de Gustos a Necesidades',
    );
    // The confirmation's accessible name is now "Confirmar cambio de
    // bucket" — the money-move copy body stays untouched (reclasificar-
    // bucket-y-categoria: only this dialog's title changes, since it only
    // ever appears on a cross-bucket move).
    expect(dialog).toHaveAccessibleName('Confirmar cambio de grupo');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
  });

  it('confirming the cross-bucket move commits it and calls onMovida with the full "{bucket} · {categoría}" destination label (D-07, issue #782)', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const onMovida = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoriaId: 'cat-transporte' }),
        }),
      ),
    );
    // onMovida fires with the LABEL ('Necesidades' for Necesidades bucket) — not the raw key.
    // Deseos→Necesidades: destination bucket label is 'Necesidades'.
    expect(onMovida).toHaveBeenCalledTimes(1);
    expect(onMovida).toHaveBeenCalledWith('Necesidades · Transporte');
  });

  it('a same-bucket reclassify calls onMovida with the destination categoría name, not a bucket label (confirmacion-reclasificar)', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const onMovida = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Same-bucket reclassify: Necesidades → Transporte (still Necesidades)
    await user.selectOptions(select, 'Necesidades · Transporte');
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    // Same-bucket now reuses the SAME onMovida callback the cross-bucket
    // case uses, but with the destination CATEGORÍA's name — the page
    // formats "Movida a {label}." verbatim regardless of which caller it is
    // (confirmacion-reclasificar, issue #749).
    await waitFor(() => expect(onMovida).toHaveBeenCalledTimes(1));
    expect(onMovida).toHaveBeenCalledWith('Transporte');
  });

  // Touch-target quick win (round 2, P2): destructive/cross-bucket confirms
  // get the house default 36px control, not the 24px `xs` size. Asserted
  // via Button's own `data-size` contract, not class strings.
  it('renders Confirmar and Cancelar at the default (36px) touch target, not xs', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());
    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByRole('alertdialog');

    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveAttribute(
      'data-size',
      'default',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute(
      'data-size',
      'default',
    );
  });

  it('alertdialog has aria-describedby pointing at the money-move paragraph (D-08)', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());
    await user.selectOptions(select, 'Necesidades · Transporte');

    const dialog = await screen.findByRole('alertdialog');
    const describedById = dialog.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    // The element referenced by aria-describedby must contain the money-move sentence.
    const describedBy = document.getElementById(describedById!);
    expect(describedBy).not.toBeNull();
    expect(describedBy).toHaveTextContent(
      'Esto mueve $15.000 de Gustos a Necesidades',
    );
    // Focus is on the Confirmar button when the dialog opens (WCAT-05).
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Confirmar' }),
    );
  });

  it('cancelling reverts the select to the original categoría, never commits', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(select.value).toBe('cat-delivery');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
    // WCAT-04 focus contract: cancelar() returns focus to the select.
    expect(document.activeElement).toBe(select);
  });

  it('disables the select while the mutation is pending', async () => {
    let resolverFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve(respuestaCatalogo(CATALOGO_FIXTURE));
      }
      return new Promise((resolve) => {
        resolverFetch = resolve;
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');

    await waitFor(() => expect(select).toBeDisabled());
    resolverFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    await waitFor(() => expect(select).not.toBeDisabled());
  });

  it('picking a same-bucket categoría while a cross-bucket confirmation is pending dismisses the stale dialog and commits only the new pick (race)', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Opens a cross-bucket confirmation for "Delivery" (Gustos), without confirming/cancelling.
    await user.selectOptions(select, 'Gustos · Delivery');
    await screen.findByRole('alertdialog');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );

    // Then picks a same-bucket categoría ("Combustible", still Necesidades).
    await user.selectOptions(select, 'Necesidades · Combustible');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // Re-scoped by URL (not a bare `fetchMock` call count) because
    // `useCategorias()` also fires a `GET /api/categorias` on mount — but the
    // exactly-once guarantee on the PATCH itself must stay intact: this is
    // the whole point of the test, proving the dismissed stale confirmation
    // does not double-fire alongside the new same-bucket commit.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === '/api/transacciones/tx-1/categoria',
        ),
      ).toHaveLength(1),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.objectContaining({
        body: JSON.stringify({ categoriaId: 'cat-combustible' }),
      }),
    );
  });

  it('a SinCategoria row shows the confirmation naming source AND full "{bucket} · {categoría}" destination, commits only on confirm, calls onMovida with that same label (D-07, issue #782)', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const onMovida = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-2"
        descripcion="Transferencia recibida"
        montoLabel="$7.500"
        bucketActual="SinCategoria"
        categoriaActual={null}
        periodo="2026-07"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Transferencia recibida: Sin categoría',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');

    const dialog = await screen.findByRole('alertdialog');
    // Frase COMPLETA, con punto final: el assert anterior cortaba en
    // "…a Necesidades" y, siendo `toHaveTextContent` un match por
    // subcadena, pasaba igual con y sin la categoría — no podía ponerse
    // rojo por el bug que decía cubrir (issue #782).
    expect(dialog).toHaveTextContent(
      'Esto mueve $7.500 de Sin categoría a Necesidades · Transporte.',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-2/categoria',
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-2/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoriaId: 'cat-transporte' }),
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => url === '/api/transacciones/tx-2/categoria',
      ),
    ).toHaveLength(1);
    // onMovida fires with the FULL destination label, bucket + categoría.
    expect(onMovida).toHaveBeenCalledTimes(1);
    expect(onMovida).toHaveBeenCalledWith('Necesidades · Transporte');
  });

  it('pressing Escape while the confirmation is open cancels it, reverts the select, fires no PATCH', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByRole('alertdialog');

    // Focus moves to "Confirmar" when the dialog opens (WCAT-05); pressing
    // Escape from there must still bubble up to the dialog's handler.
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(select.value).toBe('cat-delivery');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
    // WCAT-04 focus contract: cancelar() returns focus to the select.
    expect(document.activeElement).toBe(select);
  });

  it('on a failed reclassify, reverts the select and shows an error message (WCAT-04 failed scenario)', async () => {
    mockFetch({ ok: false, status: 404 });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(select.value).toBe('cat-supermercado');
  });

  it('a just-created categoría is offered by the dropdown immediately, sourced from the live catalog with no code change (WCAT-04 delta)', async () => {
    const catalogoConNueva: CatalogoDto = {
      categorias: [
        ...CATALOGO_FIXTURE.categorias,
        {
          id: 'cat-mascotas',
          nombre: 'Mascotas',
          bucket: 'Deseos',
          patrones: [],
          transaccionesCount: 0,
        },
      ],
    };
    mockFetch(
      { ok: true, status: 200, json: () => Promise.resolve(dtoDestino) },
      catalogoConNueva,
    );

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const mascotas = await screen.findByRole('option', {
      name: 'Gustos · Mascotas',
    });
    const gustos = screen.getByRole('group', {
      name: 'Gustos',
    }) as HTMLOptGroupElement;
    expect(gustos).toContainElement(mascotas as HTMLElement);
  });

  it('a deleted categoría is no longer offered — the dropdown never falls back to a hardcoded list (WCAT-04 delta)', async () => {
    const catalogoSinDelivery: CatalogoDto = {
      categorias: CATALOGO_FIXTURE.categorias.filter(
        (c) => c.nombre !== 'Delivery',
      ),
    };
    mockFetch(
      { ok: true, status: 200, json: () => Promise.resolve(dtoDestino) },
      catalogoSinDelivery,
    );

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    await screen.findByRole('option', { name: 'Ahorro · Ahorro' });
    expect(
      screen.queryByRole('option', { name: 'Gustos · Delivery' }),
    ).not.toBeInTheDocument();
  });

  it('a re-bucketed categoría triggers the cross-bucket confirmation against its REAL live bucket, not a stale map (WCAT-04 delta)', async () => {
    const catalogoConSupermercadoEnDeseos: CatalogoDto = {
      categorias: CATALOGO_FIXTURE.categorias.map((c) =>
        c.nombre === 'Supermercado' ? { ...c, bucket: 'Deseos' } : c,
      ),
    };
    const fetchMock = mockFetch(
      { ok: true, status: 200, json: () => Promise.resolve(dtoDestino) },
      catalogoConSupermercadoEnDeseos,
    );
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Movimiento"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-transporte', nombre: 'Transporte' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Movimiento: Necesidades · Transporte',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Under the retired static CATEGORIA_BUCKET map, "Supermercado" always
    // resolved to Necesidades — the same bucket as this transaction — so
    // this pick would have committed immediately with no confirmation, the
    // exact defect this slice closes. Its live bucket is now Deseos.
    await user.selectOptions(select, 'Gustos · Supermercado');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Esto mueve $10.000 de Necesidades a Gustos',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
  });

  it('when the catalog fetch fails with no cached data, the select stays disabled and this component renders no banner/retry of its own — that surface now lives once in BucketDetalleMesPage (WCAT-04 delta)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve({ ok: false, status: 500 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;

    // The catalog genuinely never loads (no cached data, the fetch fails),
    // so the select stays disabled with only the current categoría offered
    // — but THIS component must not render its own alert/Reintentar for
    // that failure anymore (discriminates against the pre-fix code, which
    // rendered both here).
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url === '/api/categorias'),
      ).toBe(true),
    );
    expect(select).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reintentar' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('a cross-bucket FAILED PATCH does NOT call onMovida and the error copy renders (Fix 1 falsifiability)', async () => {
    // Falsifiability: with the old synchronous onMovida() call inside confirmar()
    // (before mutation settles), this test fails — onMovida fires even on a
    // 404 response. With onMovida moved into mutation onSuccess, it must NOT
    // fire when the PATCH rejects.
    mockFetch({ ok: false, status: 404 });
    const onMovida = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Cross-bucket: Deseos → Necesidades opens the confirmation dialog.
    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    // The mutation rejects with a 404: the error copy must appear and
    // onMovida must NOT have been called.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onMovida).not.toHaveBeenCalled();
    // The select reverts to the original categoría (existing error path behavior).
    expect(select.value).toBe('cat-delivery');
  });

  it('an unresolved categoría (not found in the live catalog) is rejected as an error, never auto-committed as if same-bucket (ADR-015 fail-safe direction)', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Simulates `alCambiar` receiving a value the live catalog snapshot
    // cannot resolve to a bucket — unreachable via `userEvent.selectOptions`
    // (it only picks real rendered `<option>`s, which always match `data`),
    // so a raw DOM `<option>` is appended to stand in for the edge case
    // (e.g. a stale option surviving a concurrent catalog change). Guards
    // the fail-safe direction: this must error, never silently commit as
    // "same bucket".
    const fantasma = document.createElement('option');
    fantasma.value = 'Fantasma';
    select.appendChild(fantasma);
    fireEvent.change(select, { target: { value: 'Fantasma' } });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(select.value).toBe('cat-supermercado');
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => url === '/api/transacciones/tx-1/categoria',
      ),
    ).toHaveLength(0);
  });

  it('the catalog-loading state marks the select aria-busy, with NO per-row live-region announcement (a11y — one shared query, N mounted rows would otherwise announce N times)', async () => {
    let resolverCatalogo: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        return new Promise((resolve) => {
          resolverCatalogo = resolve;
        });
      }
      throw new Error(`unexpected fetch to ${url} while catalog is in flight`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;

    expect(select).toHaveAttribute('aria-busy', 'true');
    // `role="status"` is a shared live region — with `useCategorias()`
    // fanning one `['categorias']` fetch out to every mounted row
    // (use-categorias.ts), a per-row `role="status"` would announce the
    // same sentence once per transaction row on every normal page load.
    // `aria-busy` on the `<select>` is the correct per-row signal instead:
    // it is state, not an announcement.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    resolverCatalogo(respuestaCatalogo(CATALOGO_FIXTURE));

    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('a background catalog refetch over already-loaded data never marks the select aria-busy, disables it, or shows a banner — aria-busy gates to initial load only (WCAT-04 delta, judged both by Judge A and Judge B)', async () => {
    let resolveSegundoFetch: (value: unknown) => void = () => {};
    let catalogoFetchCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        catalogoFetchCount += 1;
        if (catalogoFetchCount === 1) {
          return Promise.resolve(respuestaCatalogo(CATALOGO_FIXTURE));
        }
        return new Promise((resolve) => {
          resolveSegundoFetch = resolve;
        });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = crearWrapper();
    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(screen.getAllByRole('option')).toHaveLength(8);

    // Simulates the failure mode this test exists for: a background refetch
    // (e.g. `refetchOnReconnect`, TanStack's default `true`, left untouched
    // in `main.tsx` unlike `refetchOnWindowFocus`) over data that is already
    // loaded and still valid. `data !== undefined` for this entire window —
    // under bare `isFetching` gating (the bug both judges independently
    // flagged, verified against `@tanstack/query-core`'s `fetchState()`)
    // this WOULD flip `aria-busy` to `'true'` right here; gated to initial
    // load only, it must not, while the fetch is genuinely in flight.
    void wrapper.queryClient.refetchQueries({ queryKey: ['categorias'] });
    await waitFor(() => expect(catalogoFetchCount).toBe(2));
    expect(select).not.toHaveAttribute('aria-busy', 'true');
    expect(select).not.toBeDisabled();

    resolveSegundoFetch({ ok: false, status: 500 });

    // The control keeps working after the background refetch settles (even
    // though it failed): still no banner of its own (this component never
    // renders one for the catalog — see the sibling failure test above),
    // select stays enabled with the previously-loaded catalog, never busy.
    // Waits on the query's own fetch status, not a proxy timer, so this
    // observes the actual settle rather than an arbitrary tick.
    await waitFor(() =>
      expect(
        wrapper.queryClient.getQueryState(['categorias'])?.fetchStatus,
      ).toBe('idle'),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(select).not.toBeDisabled();
    expect(select).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  // ── crear categoría desde el selector (issue #744) ──

  /**
   * Discriminates by HTTP method (unlike `mockFetch`, which only looks at
   * the URL — `GET /api/categorias` and `POST /api/categorias` share the
   * same URL). `crearRespuesta` is required so every test in this block is
   * explicit about what the creation POST returns.
   *
   * `categoriaCreada` (only relevant when `crearRespuesta.ok`) is appended
   * to the mocked catalog SYNCHRONOUSLY the moment the POST branch runs —
   * before its own response promise even resolves — because
   * `useCrearCategoria`'s `onSuccess` both seeds the cache directly AND
   * invalidates `['categorias']` (profile B), and an active query
   * invalidation triggers an immediate background refetch. A real backend
   * would obviously return the just-created row on that refetch too; a
   * naive mock that always serves the original fixture would make that
   * background refetch silently erase the seed, which is a test-double gap,
   * not a product bug.
   */
  function mockFetchConCreacion({
    catalogo = CATALOGO_FIXTURE,
    crearRespuesta,
    categoriaCreada,
    reclasificarRespuesta = {
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    },
  }: {
    catalogo?: CatalogoDto;
    crearRespuesta: {
      ok: boolean;
      status: number;
      json?: () => Promise<unknown>;
    };
    categoriaCreada?: CategoriaDto;
    reclasificarRespuesta?: {
      ok: boolean;
      status: number;
      json?: () => Promise<unknown>;
    };
  }) {
    let categorias = catalogo.categorias;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/categorias' && init?.method === 'POST') {
        if (crearRespuesta.ok && categoriaCreada) {
          categorias = [...categorias, categoriaCreada];
        }
        return Promise.resolve(crearRespuesta);
      }
      if (url === '/api/categorias') {
        return Promise.resolve(respuestaCatalogo({ categorias }));
      }
      return Promise.resolve(reclasificarRespuesta);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('renders a "+" trigger beside the select that opens a creation form with an editable bucket field, preset to the row\'s current bucket', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    const trigger = screen.getByRole('button', {
      name: 'Nueva categoría para Supermercado Líder',
    });
    // Not an <option> inside the <select> — a separate, always-keyboard-
    // reachable control (issue #744 a11y decision).
    expect(trigger.tagName).toBe('BUTTON');

    await user.click(trigger);

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    const bucketField = screen.getByLabelText('Grupo') as HTMLSelectElement;
    expect(bucketField.value).toBe('Necesidades');
  });

  it('creating a category in the SAME bucket selects it for the row and commits the reclassify immediately, no confirmation', async () => {
    const categoriaCreada: CategoriaDto = {
      id: 'cat-libros-necesidades',
      nombre: 'Libros',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    };
    const fetchMock = mockFetchConCreacion({
      crearRespuesta: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(categoriaCreada),
      },
      categoriaCreada,
    });
    const onMovida = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Librería Central"
        montoLabel="$8.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Librería Central: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.click(
      screen.getByRole('button', {
        name: 'Nueva categoría para Librería Central',
      }),
    );
    await user.type(screen.getByLabelText('Nombre'), 'Libros');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoriaId: 'cat-libros-necesidades' }),
        }),
      ),
    );
    expect(onMovida).toHaveBeenCalledWith('Libros');
    // The categoría-created cache seed (`useCrearCategoria`) and this
    // control's own `setValor` land in the same synchronous callback, but
    // the query cache's subscriber notification can settle a tick later —
    // `waitFor` (not a bare assert) tolerates that without weakening what's
    // proven: the row ends up pointed at the newly created categoría.
    await waitFor(() => expect(select.value).toBe('cat-libros-necesidades'));
  });

  it('creating a category in a DIFFERENT bucket opens the same cross-bucket confirmation as picking an existing categoría, and does not commit until confirmed', async () => {
    const categoriaCreada: CategoriaDto = {
      id: 'cat-libros-deseos',
      nombre: 'Libros',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
    };
    const fetchMock = mockFetchConCreacion({
      crearRespuesta: {
        ok: true,
        status: 201,
        json: () => Promise.resolve(categoriaCreada),
      },
      categoriaCreada,
    });
    const onMovida = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Librería Central"
        montoLabel="$8.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Librería Central: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.click(
      screen.getByRole('button', {
        name: 'Nueva categoría para Librería Central',
      }),
    );
    // The user picks a DIFFERENT bucket than the row's own before creating —
    // the exact usability finding this issue fixes (wanting "Libros" under
    // Gustos while sitting on a Necesidades row).
    await user.selectOptions(screen.getByLabelText('Grupo'), 'Deseos');
    await user.type(screen.getByLabelText('Nombre'), 'Libros');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Esto mueve $8.000 de Necesidades a Gustos',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoriaId: 'cat-libros-deseos' }),
        }),
      ),
    );
    expect(onMovida).toHaveBeenCalledWith('Gustos · Libros');
  });

  it('a duplicate-name creation error renders inline in the creation form (mensajeDeErrorCatalogo), never silently drops the row selection', async () => {
    mockFetchConCreacion({
      crearRespuesta: {
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: 'NOMBRE_DUPLICADO', message: 'x' }),
      },
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Librería Central"
        montoLabel="$8.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Librería Central: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.click(
      screen.getByRole('button', {
        name: 'Nueva categoría para Librería Central',
      }),
    );
    await user.type(screen.getByLabelText('Nombre'), 'Supermercado');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // The row's own selection is untouched by the failed creation attempt.
    expect(select.value).toBe('cat-supermercado');
  });

  // ── patrón desde movimiento (issue #745) ──

  /**
   * Routes `/api/patrones` (the offer's own POST) alongside the existing
   * `/api/categorias` (catalog) and reclassify-PATCH routing `mockFetch`
   * already does — a dedicated helper because none of the existing ones
   * discriminate a third URL.
   */
  function mockFetchConPatron({
    catalogo = CATALOGO_FIXTURE,
    reclasificarRespuesta = {
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    },
    patronRespuesta = { ok: true, status: 201 },
  }: {
    catalogo?: CatalogoDto;
    reclasificarRespuesta?: {
      ok: boolean;
      status: number;
      json?: () => Promise<unknown>;
    };
    patronRespuesta?: {
      ok: boolean;
      status: number;
      json?: () => Promise<unknown>;
    };
  } = {}) {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve(respuestaCatalogo(catalogo));
      }
      if (url === '/api/patrones') {
        return Promise.resolve(patronRespuesta);
      }
      return Promise.resolve(reclasificarRespuesta);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('after a same-bucket reclassify commits, offers to create a pattern from the movement', async () => {
    mockFetchConPatron();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');

    expect(await screen.findByText(/próximas cartolas/i)).toBeInTheDocument();
  });

  it('dismissing the pattern offer leaves the reclassification intact and fires no pattern request', async () => {
    const fetchMock = mockFetchConPatron();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByText(/próximas cartolas/i);

    await user.click(screen.getByRole('button', { name: 'Ahora no' }));

    expect(screen.queryByText(/próximas cartolas/i)).not.toBeInTheDocument();
    // The reclassify PATCH already happened and is untouched.
    expect(select.value).toBe('cat-transporte');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/patrones',
      expect.anything(),
    );
  });

  it("confirming the offer POSTs to /api/patrones with the ROW'S NEWLY ASSIGNED categoriaId, the literal selected words, and CONTAINS, and announces the created pattern via onPatronCreado", async () => {
    const fetchMock = mockFetchConPatron();
    const onPatronCreado = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
        onPatronCreado={onPatronCreado}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByText(/próximas cartolas/i);
    await user.click(screen.getByRole('button', { name: 'Crear patrón' }));
    await user.click(screen.getByRole('button', { name: 'Líder' }));
    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/patrones',
        expect.objectContaining({
          body: JSON.stringify({
            categoriaId: 'cat-transporte',
            patron: 'Líder',
            matchType: 'CONTAINS',
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(onPatronCreado).toHaveBeenCalledExactlyOnceWith('Líder'),
    );
    // The offer closes once the pattern is created.
    expect(screen.queryByText(/próximas cartolas/i)).not.toBeInTheDocument();
  });

  it('a failed pattern creation surfaces inline and does not undo the reclassification', async () => {
    mockFetchConPatron({
      patronRespuesta: {
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: 'PATRON_DUPLICADO', message: 'x' }),
      },
    });
    const onPatronCreado = vi.fn();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual={{ id: 'cat-supermercado', nombre: 'Supermercado' }}
        periodo="2026-07"
        onMovida={vi.fn()}
        onPatronCreado={onPatronCreado}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Supermercado Líder: Necesidades · Supermercado',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByText(/próximas cartolas/i);
    await user.click(screen.getByRole('button', { name: 'Crear patrón' }));
    await user.click(screen.getByRole('button', { name: 'Líder' }));
    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya tienes un patrón con ese texto.',
    );
    expect(onPatronCreado).not.toHaveBeenCalled();
    // The reclassify commit from before is completely unaffected.
    expect(select.value).toBe('cat-transporte');
  });

  it('after confirming a CROSS-BUCKET reclassify, the pattern offer targets the DESTINATION categoría, not the original', async () => {
    const fetchMock = mockFetchConPatron();
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual={{ id: 'cat-delivery', nombre: 'Delivery' }}
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Categoría de Uber Eats: Gustos · Delivery',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Necesidades · Transporte');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await screen.findByText(/próximas cartolas/i);
    await user.click(screen.getByRole('button', { name: 'Crear patrón' }));
    await user.click(screen.getByRole('button', { name: 'Uber' }));
    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/patrones',
        expect.objectContaining({
          body: JSON.stringify({
            categoriaId: 'cat-transporte',
            patron: 'Uber',
            matchType: 'CONTAINS',
          }),
        }),
      ),
    );
  });
});
