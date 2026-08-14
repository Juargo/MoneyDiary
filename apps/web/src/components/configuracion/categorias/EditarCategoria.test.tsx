import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CATEGORIAS_QUERY_KEY } from '@/api/use-categorias';
import { ME_QUERY_KEY } from '@/api/use-me';
import { QUERY_CLIENT_DEFAULTS } from '@/api/query-client-defaults';
import type { CatalogoDto, MeDto } from '@/api/types';
import { EditarCategoria } from './EditarCategoria';

/**
 * EditarCategoria.test.tsx (US-043 PR #3b, design.md §1/Q1d/Q1e, WCTG-01,
 * WCTG-10) — CA-02, the edit screen. This file grows across tasks 31-35 as
 * `EditarCategoria.tsx` itself grows; this batch (task 31) only covers the
 * FOUR resolution states + the breadcrumb, per Q1e — no identity form, no
 * delete, no bucket-change confirmation yet (those are tasks 32-34).
 *
 * Rendered inside a real router (breadcrumb `<Link>`s need it) AND a
 * `QueryClientProvider` with `['categorias']`/`['auth-me']` pre-populated —
 * same combined idiom as `CategoriasPanel.test.tsx`.
 */
const ME_NO_DEMO: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

const CATEGORIA_SUPERMERCADO = {
  id: 'cat-1',
  nombre: 'Supermercado',
  bucket: 'Necesidades',
  patrones: [],
  transaccionesCount: 3,
};

const CATALOGO: CatalogoDto = { categorias: [CATEGORIA_SUPERMERCADO] };

function renderEditar(options: {
  readonly categoriaId?: string;
  readonly me?: MeDto;
  readonly categorias?: CatalogoDto;
  readonly fetchMock?: ReturnType<typeof vi.fn>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
        retry: false,
      },
    },
  });
  if (options.me !== undefined) {
    queryClient.setQueryData(ME_QUERY_KEY, options.me);
  }
  if (options.categorias !== undefined) {
    queryClient.setQueryData(CATEGORIAS_QUERY_KEY, options.categorias);
  }
  if (options.fetchMock) {
    vi.stubGlobal('fetch', options.fetchMock);
  }

  const categoriaId = options.categoriaId ?? 'cat-1';
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <EditarCategoria categoriaId={categoriaId} />
      </QueryClientProvider>
    ),
  });
  const configuracionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion',
    component: () => <p>Perfil</p>,
  });
  const listaRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion/categorias',
    component: () => <p>Lista</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([configuracionRoute, listaRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  render(<RouterProvider router={router} />);
  return { queryClient, router };
}

describe('EditarCategoria — resolution states (Q1e)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mientras la query está pendiente, renderiza role="status" "Cargando…"', async () => {
    renderEditar({
      me: ME_NO_DEMO,
      fetchMock: vi.fn(() => new Promise(() => {})),
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…');
  });

  it('si la query falla, renderiza mensajeDeErrorCatalogo en role="alert" + link Volver a Categorías', async () => {
    renderEditar({
      me: ME_NO_DEMO,
      fetchMock: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
    expect(
      screen.getByRole('link', { name: 'Volver a Categorías' }),
    ).toHaveAttribute('href', '/configuracion/categorias');
  });

  it('si el id no existe en el catálogo cargado (stale/deleted), renderiza role="status" "Esa categoría ya no existe." + link', async () => {
    renderEditar({
      categoriaId: 'cat-borrada',
      me: ME_NO_DEMO,
      categorias: CATALOGO,
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Esa categoría ya no existe.',
    );
    expect(
      screen.getByRole('link', { name: 'Volver a Categorías' }),
    ).toHaveAttribute('href', '/configuracion/categorias');
  });

  it('con id presente, renderiza el h1 "Editar categoría" y la breadcrumb con aria-current en la hoja', async () => {
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Editar categoría',
      }),
    ).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' });
    expect(
      within(nav).getByRole('link', { name: 'Configuración' }),
    ).toHaveAttribute('href', '/configuracion');
    expect(
      within(nav).getByRole('link', { name: 'Categorías' }),
    ).toHaveAttribute('href', '/configuracion/categorias');
    expect(within(nav).getByText('Supermercado')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

/**
 * Task 32 — the identity form: `Nombre` + `CampoSelect` inside
 * `#form-identidad`; `Cancelar`/`Guardar` associated via the HTML `form`
 * ATTRIBUTE (not nesting), per design.md §1/Q3b mechanism 1. Driven with
 * `fireEvent.submit(form)` — the `PerfilForm` idiom (design's explicit
 * jsdom note, §1/Q3d): jsdom's `form=`-attribute submit-button activation
 * on a plain `userEvent.click` is not something to bet a suite on.
 */
describe('EditarCategoria — identity form (Q3b mechanism 1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Nombre y Bucket llegan pre-poblados con los valores cargados de la categoría', async () => {
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Supermercado');
    expect(screen.getByLabelText('Bucket (obligatorio)')).toHaveValue(
      'Necesidades',
    );
  });

  it('Guardar tiene form="form-identidad" — el mecanismo, no una captura de pantalla', async () => {
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    const guardar = await screen.findByRole('button', { name: 'Guardar' });
    expect(guardar).toHaveAttribute('form', 'form-identidad');
  });

  it('un envío limpio (solo Nombre cambia, Bucket intacto) emite EXACTAMENTE una mutación — PATCH a /api/categorias/cat-1, nunca a /api/patrones', async () => {
    // El refetch de fondo de ['categorias'] que dispara la invalidación del
    // perfil B tras el éxito también pasa por `fetch` (un GET, sin `method`
    // en las opciones) — se filtra por presencia de `method` para aislar
    // SOLO las mutaciones, que es lo que la aserción "exactamente un PATCH"
    // (design.md §1/Q3d) realmente pide: ningún POST/PATCH/DELETE extra a
    // /api/patrones se filtra, no que la red entera sea un único request.
    // El GET de ese refetch recibe un body válido (no solo `{ok:true}`) para
    // que no degrade a `tag: 'parse'` y dispare un update fuera de `act`.
    const fetchMock = vi.fn((_url: string, opciones?: RequestInit) =>
      opciones?.method === 'PATCH'
        ? Promise.resolve({ ok: true, status: 200 })
        : Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              categorias: [
                { ...CATEGORIA_SUPERMERCADO, nombre: 'Super Jumbo' },
              ],
            }),
          }),
    );
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    const nombre = await screen.findByLabelText('Nombre');
    fireEvent.change(nombre, { target: { value: 'Super Jumbo' } });
    vi.stubGlobal('fetch', fetchMock);
    const mutaciones = () =>
      fetchMock.mock.calls
        .filter(([, opciones]) => opciones?.method !== undefined)
        .map(([url, opciones]) => `${opciones.method} ${url}`);

    const form = document.getElementById('form-identidad') as HTMLFormElement;
    fireEvent.submit(form);

    await vi.waitFor(() =>
      expect(mutaciones()).toEqual(['PATCH /api/categorias/cat-1']),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias/cat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Super Jumbo', bucket: 'Necesidades' }),
    });
  });

  it('Cancelar (disambiguado "Cancelar cambios de nombre y bucket") descarta el draft sin emitir ninguna request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    const nombre = await screen.findByLabelText('Nombre');
    await user.clear(nombre);
    await user.type(nombre, 'Cambio sin guardar');
    vi.stubGlobal('fetch', fetchMock);

    await user.click(
      screen.getByRole('button', {
        name: 'Cancelar cambios de nombre y bucket',
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Supermercado');
  });
});

/**
 * Task 33 — the bucket-change impact confirmation, in the SAME task as the
 * `PATCH` that can trigger it (non-negotiable #3). When `Bucket` is dirty
 * relative to the loaded value, `Guardar`'s submit handler opens
 * `ConfirmarImpactoDialog` with `fraseDeImpacto({tipo:'cambiar-bucket', …})`
 * instead of calling `useActualizarCategoria` directly (design.md §1/Q3b,
 * task 33, WCTG-07).
 */
describe('EditarCategoria — bucket-change impact confirmation (WCTG-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('un Bucket sucio abre el diálogo de confirmación en vez de emitir el PATCH directamente', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    await user.selectOptions(
      await screen.findByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );
    vi.stubGlobal('fetch', fetchMock);

    const form = document.getElementById('form-identidad') as HTMLFormElement;
    fireEvent.submit(form);

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('el diálogo muestra fraseDeImpacto para cambiar-bucket — título, ambos buckets vía A1, y el conteo de transacciones cargado', async () => {
    const user = userEvent.setup();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    await user.selectOptions(
      await screen.findByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );

    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );

    expect(await screen.findByText('Cambiar el bucket')).toBeInTheDocument();
    expect(
      screen.getByText('«Supermercado» pasa de Necesidades a Gustos.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Esto mueve 3 transacciones en TODOS los períodos, incluidos los meses ya cerrados.',
      ),
    ).toBeInTheDocument();
  });

  it('confirmar el diálogo llama a la mutación PATCH con el nuevo bucket', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    await user.selectOptions(
      await screen.findByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );
    vi.stubGlobal('fetch', fetchMock);
    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );

    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cambiar bucket',
      }),
    );

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/categorias/cat-1', {
        credentials: 'same-origin',
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: 'Supermercado', bucket: 'Deseos' }),
      }),
    );
  });

  it('Escape cierra el diálogo, restaura el foco a Guardar y NO emite ninguna request — Bucket sigue sucio en pantalla', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    await user.selectOptions(
      await screen.findByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );
    vi.stubGlobal('fetch', fetchMock);
    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );
    await screen.findByRole('alertdialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
    expect(screen.getByLabelText('Bucket (obligatorio)')).toHaveValue('Deseos');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un confirm fallido mantiene el diálogo abierto con el error inline (no se cierra en falla)', async () => {
    const user = userEvent.setup();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    await user.selectOptions(
      await screen.findByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );
    const dialogo = await screen.findByRole('alertdialog');

    await user.click(
      within(dialogo).getByRole('button', { name: 'Cambiar bucket' }),
    );

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
