import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ReclasificarCategoriaControl } from './ReclasificarCategoriaControl';
import type { CatalogoDto, ReclasificarCategoriaDto } from '@/api/types';

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

describe('ReclasificarCategoriaControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders a select with an accessible label naming the transaction (WCAT-05)', () => {
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    expect(
      screen.getByLabelText('Cambiar categoría de Supermercado Líder'),
    ).toBeInTheDocument();
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Supermercado Líder',
    ) as HTMLSelectElement;

    // Mid-flight, genuinely: the catalog fetch is a deferred promise that
    // has not settled yet, so this assertion runs while `data` is still
    // undefined — never a same-tick-resolved mock that would coalesce past
    // the loading render.
    expect(select).toBeDisabled();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(select.value).toBe('Supermercado');

    resolverCatalogo(respuestaCatalogo(CATALOGO_FIXTURE));

    await waitFor(() => expect(select).not.toBeDisabled());
    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  it('offers all 8 categorías grouped by bucket via optgroup, current categoría preselected', async () => {
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Supermercado Líder',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    expect(select.value).toBe('Supermercado');
    expect(screen.getAllByRole('option')).toHaveLength(8);
    const necesidades = screen.getByRole('group', {
      name: 'Necesidades',
    }) as HTMLOptGroupElement;
    expect(Array.from(necesidades.children).map((o) => o.textContent)).toEqual([
      'Supermercado',
      'Combustible',
      'Farmacia',
      'Salud',
      'Transporte',
    ]);
    expect(screen.getByRole('group', { name: 'Gustos' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ahorro' })).toBeInTheDocument();
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
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Transferencia recibida',
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Supermercado Líder',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoria: 'Transporte' }),
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
        categoriaActual="Delivery"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Uber Eats',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Esto mueve $15.000 de Gustos a Necesidades',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
  });

  it('confirming the cross-bucket move commits it', async () => {
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
        categoriaActual="Delivery"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Uber Eats',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({
          body: JSON.stringify({ categoria: 'Transporte' }),
        }),
      ),
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
        categoriaActual="Delivery"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Uber Eats',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(select.value).toBe('Delivery');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Supermercado Líder',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');

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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Supermercado Líder',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Opens a cross-bucket confirmation for "Delivery" (Gustos), without confirming/cancelling.
    await user.selectOptions(select, 'Delivery');
    await screen.findByRole('alertdialog');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );

    // Then picks a same-bucket categoría ("Combustible", still Necesidades).
    await user.selectOptions(select, 'Combustible');

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
        body: JSON.stringify({ categoria: 'Combustible' }),
      }),
    );
  });

  it('a SinCategoria row shows the confirmation with source "Sin categoría" and the destination bucket, commits only on confirm', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(dtoDestino),
    });
    const user = userEvent.setup();

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-2"
        descripcion="Transferencia recibida"
        montoLabel="$7.500"
        bucketActual="SinCategoria"
        categoriaActual={null}
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Transferencia recibida',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Esto mueve $7.500 de Sin categoría a Necesidades',
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
          body: JSON.stringify({ categoria: 'Transporte' }),
        }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => url === '/api/transacciones/tx-2/categoria',
      ),
    ).toHaveLength(1);
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
        categoriaActual="Delivery"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Uber Eats',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');
    await screen.findByRole('alertdialog');

    // Focus moves to "Confirmar" when the dialog opens (WCAT-05); pressing
    // Escape from there must still bubble up to the dialog's handler.
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(select.value).toBe('Delivery');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Supermercado Líder',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    await user.selectOptions(select, 'Transporte');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(select.value).toBe('Supermercado');
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const mascotas = await screen.findByRole('option', { name: 'Mascotas' });
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
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    await screen.findByRole('option', { name: 'Ahorro' });
    expect(
      screen.queryByRole('option', { name: 'Delivery' }),
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
        categoriaActual="Transporte"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    );

    const select = screen.getByLabelText(
      'Cambiar categoría de Movimiento',
    ) as HTMLSelectElement;
    await waitFor(() => expect(select).not.toBeDisabled());

    // Under the retired static CATEGORIA_BUCKET map, "Supermercado" always
    // resolved to Necesidades — the same bucket as this transaction — so
    // this pick would have committed immediately with no confirmation, the
    // exact defect this slice closes. Its live bucket is now Deseos.
    await user.selectOptions(select, 'Supermercado');

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Esto mueve $10.000 de Necesidades a Gustos',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.anything(),
    );
  });
});
