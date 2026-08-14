import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CATEGORIAS_QUERY_KEY } from '@/api/use-categorias';
import { ME_QUERY_KEY } from '@/api/use-me';
import { QUERY_CLIENT_DEFAULTS } from '@/api/query-client-defaults';
import type { CatalogoDto, MeDto } from '@/api/types';
import { EditarCategoria } from './EditarCategoria';
import {
  MENSAJE_DEMO_CATALOGO,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';

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

const ME_DEMO: MeDto = { ...ME_NO_DEMO, esDemo: true, email: null };

const CATEGORIA_SUPERMERCADO = {
  id: 'cat-1',
  nombre: 'Supermercado',
  bucket: 'Necesidades',
  patrones: [],
  transaccionesCount: 3,
};

const CATALOGO: CatalogoDto = { categorias: [CATEGORIA_SUPERMERCADO] };

const CATEGORIA_STREAMING = {
  id: 'cat-2',
  nombre: 'Streaming',
  bucket: 'Deseos',
  patrones: [],
  transaccionesCount: 1,
};

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

  // A real `<Outlet/>` on the root route (unlike `CategoriasPanel.test.tsx`,
  // which never actually navigates) — `EditarCategoria`'s delete flow (task
  // 34) calls `navigate({to: '/configuracion/categorias'})` on success, and
  // that route swap must be OBSERVABLE for the navigation tests to mean
  // anything; a rootRoute that renders the edited screen directly (with no
  // `<Outlet/>`) would stay static regardless of the URL.
  const categoriaId = options.categoriaId ?? 'cat-1';
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
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
  // Reads `categoriaId` REACTIVELY off the route's own params (mirrors the
  // real `configuracion_.categorias.$categoriaId.tsx` route, `Route.
  // useParams()`), instead of closing over the outer `categoriaId` variable
  // fixed at setup — a fixed closure would never re-render this leaf on
  // navigation, defeating the "same mounted instance, categoriaId changes"
  // reproduction the `key={categoria.id}` regression test needs (below).
  // `useParams({ strict: false })` (the generic hook, not `Route.
  // useParams()`) sidesteps `editarRoute` referencing its own
  // not-yet-inferred type inside its own `component`. Named + capitalized
  // (`EditarCategoriaRouteTest`, not an anonymous arrow) so eslint's
  // `react-hooks/rules-of-hooks` recognizes it as a component.
  const editarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion/categorias/$categoriaId',
    component: EditarCategoriaRouteTest,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      configuracionRoute,
      listaRoute,
      editarRoute,
    ]),
    history: createMemoryHistory({
      initialEntries: [`/configuracion/categorias/${categoriaId}`],
    }),
  });

  render(<RouterProvider router={router} />);
  return { queryClient, router };
}

function EditarCategoriaRouteTest() {
  const params = useParams({ strict: false });
  return <EditarCategoria categoriaId={params.categoriaId as string} />;
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
        .map(([url, opciones]) => `${opciones?.method} ${url}`);

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

/**
 * Task 34 — delete from the edit screen (first of the two entry points,
 * Q6d — the second, from the list row, is PR #5). The footer's red
 * `Eliminar categoría` button opens `ConfirmarImpactoDialog` with
 * `fraseDeImpacto({tipo:'eliminar', …})`, sourced from the ALREADY-LOADED
 * `transaccionesCount` (decision 3 — never a fresh fetch); confirming calls
 * `useEliminarCategoria` and, on success, navigates back to
 * `/configuracion/categorias`.
 *
 * Also pins the in-flight-delete guard first established in task 31
 * (design.md §1/Q1e "the trap") — it can only be exercised now that the
 * actual delete TRIGGER exists (`useMutation` state is local per hook call,
 * so the guard can't be driven except through this screen's own button).
 */
describe('EditarCategoria — delete from the edit screen (Q6d, WCTG-05, WCTG-08)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('el footer trae el botón rojo "Eliminar categoría" con aria-label desambiguado, separado de Cancelar/Guardar', async () => {
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    const eliminar = await screen.findByRole('button', {
      name: 'Eliminar categoría Supermercado',
    });
    expect(eliminar).toHaveTextContent('Eliminar categoría');
    expect(eliminar).toHaveClass('text-destructive');
  });

  it('click en Eliminar categoría abre el diálogo con fraseDeImpacto(eliminar) usando el transaccionesCount YA CARGADO', async () => {
    const user = userEvent.setup();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    );

    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('Eliminar categoría')).toBeInTheDocument();
    expect(
      within(dialogo).getByText('Vas a eliminar «Supermercado».'),
    ).toBeInTheDocument();
    expect(
      within(dialogo).getByText(
        '3 transacciones quedan en Sin categoría, en todos los períodos.',
      ),
    ).toBeInTheDocument();
  });

  it('confirmar elimina (DELETE) y navega de vuelta a /configuracion/categorias en éxito', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/categorias/cat-1', {
        credentials: 'same-origin',
        method: 'DELETE',
      }),
    );
    await screen.findByText('Lista');
  });

  it('EL GUARDIÁN in-flight (Q1e "the trap", pinned desde task 31): tras un delete exitoso, "Esa categoría ya no existe." NUNCA aparece en el documento', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    await screen.findByText('Lista');
    expect(
      screen.queryByText('Esa categoría ya no existe.'),
    ).not.toBeInTheDocument();
  });

  it('un delete fallido mantiene el diálogo abierto con el error inline, sin navegar', async () => {
    // DEFERRED promise (the resolve trigger is captured, not baked into
    // `mockResolvedValue`) — deliberately, per the judgment-day finding
    // (2026-08-14): a `mockResolvedValue` promise is ALREADY resolved by
    // the time React processes the click, so React can coalesce the
    // pending→error transition into a single commit and the in-flight
    // render never actually happens in the test, even though production
    // `fetch` always has a real network round-trip. This test must observe
    // the IN-FLIGHT render (dialog still mounted, mid-request) before
    // resolving, or it does not exercise the bug it is pinning.
    let resolverFetch!: (value: { ok: boolean; status: number }) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolverFetch = resolve;
        }),
    );
    const user = userEvent.setup();
    vi.stubGlobal('fetch', fetchMock);
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    );
    const dialogo = await screen.findByRole('alertdialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    // Mid-flight: the DELETE has not resolved yet (`eliminacion.isPending`
    // is true, `isSuccess` is still false) — the dialog must stay mounted.
    // Against the old `isPending || isSuccess` guard, this assertion times
    // out because the whole `EditarCategoriaCargada` subtree — including
    // this dialog — unmounts for the duration of the request.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    resolverFetch({ ok: false, status: 500 });

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByText('Lista')).not.toBeInTheDocument();
  });
});

/**
 * Judgment-day fixes, 2026-08-14 (PR #3b review):
 * - the in-flight-delete guard destroyed the open confirm dialog for the
 *   FULL delete round-trip (pinned above, task 34 section);
 * - stale mutation errors bled into a freshly opened dialog (no `.reset()`
 *   on open, `EliminarIngestaControl.tsx:90-93` precedent);
 * - missing `key={categoria.id}` kept a stale identity draft across
 *   in-place navigation between two categories' edit screens;
 * - the footer's OTHER trigger stayed clickable while a dialog was open,
 *   allowing a silent dialog swap / a submit racing an in-flight delete;
 * - focus was not restored to `Guardar` after a SUCCESSFUL bucket-change
 *   confirm (only the cancel/Escape path did);
 * - `guardarIdentidad` had no `isPending` re-entrancy guard, so a rapid
 *   double-Enter in `Nombre` could fire two overlapping `PATCH` requests
 *   (a form submit bypasses the submit button's `disabled` attribute).
 */
describe('EditarCategoria — stale mutation state on dialog reopen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('un guardado directo fallido (bucket limpio) no deja un error residual visible al abrir el diálogo de cambio de bucket', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    const nombre = await screen.findByLabelText('Nombre');
    fireEvent.change(nombre, { target: { value: 'Super Jumbo' } });
    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );
    await screen.findByRole('alert');

    await user.selectOptions(
      screen.getByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );
    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );

    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un delete fallido no deja un error residual al reabrir el diálogo de eliminar', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    );
    const primerDialogo = await screen.findByRole('alertdialog');
    await user.click(
      within(primerDialogo).getByRole('button', { name: 'Eliminar' }),
    );
    await within(primerDialogo).findByRole('alert');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    );

    const segundoDialogo = await screen.findByRole('alertdialog');
    expect(within(segundoDialogo).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('EditarCategoria — key={categoria.id} evita un draft de identidad obsoleto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('navegar de una categoría a otra dentro de la MISMA instancia de ruta resiembra Nombre/Bucket con los valores de la categoría nueva', async () => {
    const catalogoDosCategorias: CatalogoDto = {
      categorias: [CATEGORIA_SUPERMERCADO, CATEGORIA_STREAMING],
    };
    const { router } = renderEditar({
      me: ME_NO_DEMO,
      categorias: catalogoDosCategorias,
    });

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Supermercado');
    expect(screen.getByLabelText('Bucket (obligatorio)')).toHaveValue(
      'Necesidades',
    );

    await router.navigate({
      to: '/configuracion/categorias/$categoriaId',
      params: { categoriaId: 'cat-2' },
    });

    await vi.waitFor(() =>
      expect(screen.getByLabelText('Nombre')).toHaveValue('Streaming'),
    );
    expect(screen.getByLabelText('Bucket (obligatorio)')).toHaveValue('Deseos');
  });
});

describe('EditarCategoria — los triggers del footer se bloquean con un diálogo abierto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Eliminar categoría se deshabilita mientras el diálogo de cambio de bucket está abierto', async () => {
    const user = userEvent.setup();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    await user.selectOptions(
      await screen.findByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );
    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );
    await screen.findByRole('alertdialog');

    expect(
      screen.getByRole('button', { name: 'Eliminar categoría Supermercado' }),
    ).toBeDisabled();
  });

  it('Guardar se deshabilita mientras el diálogo de eliminar está abierto, y reenviar el formulario NO emite un PATCH', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    );
    await screen.findByRole('alertdialog');
    vi.stubGlobal('fetch', fetchMock);

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    fireEvent.submit(
      document.getElementById('form-identidad') as HTMLFormElement,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('EditarCategoria — foco tras un confirm exitoso (SUGGESTION)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('un cambio de bucket confirmado con éxito restaura el foco a Guardar', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_url: string, opciones?: RequestInit) =>
      opciones?.method === 'PATCH'
        ? Promise.resolve({ ok: true, status: 200 })
        : Promise.resolve({
            ok: true,
            status: 200,
            json: async () => CATALOGO,
          }),
    );
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
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });
});

describe('EditarCategoria — guardarIdentidad no reentra mientras está pendiente', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reenviar el formulario (vía fireEvent.submit, bypaseando disabled) mientras el PATCH está en vuelo NO emite un segundo PATCH', async () => {
    let resolverFetch!: (value: { ok: boolean; status: number }) => void;
    const fetchMock = vi.fn(
      (_url: string, _opciones?: RequestInit) =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolverFetch = resolve;
        }),
    );
    renderEditar({ me: ME_NO_DEMO, categorias: CATALOGO });
    const nombre = await screen.findByLabelText('Nombre');
    fireEvent.change(nombre, { target: { value: 'Super Jumbo' } });
    vi.stubGlobal('fetch', fetchMock);
    const form = document.getElementById('form-identidad') as HTMLFormElement;

    fireEvent.submit(form);
    // `actualizacion.isPending` flips to `true` only once the mutation's
    // internal state update actually commits — a microtask away, not
    // synchronously inside `fireEvent.submit`'s `act()` wrapper. Waiting for
    // the FIRST fetch call mirrors two real, separately-dispatched Enter
    // keydowns (each its own browser task, with the microtask queue drained
    // in between) rather than two submits crammed into one synchronous tick,
    // which `isPending` cannot observe in time either way.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    resolverFetch({ ok: true, status: 200 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const patches = fetchMock.mock.calls.filter(
      ([, opciones]) =>
        (opciones as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patches).toHaveLength(1);
  });
});

/**
 * Task 35 — demo (WCTG-11, all 3 scenarios for this screen's controls).
 * Proactively disables `Guardar`, both dialogs' confirm buttons, and the
 * mutating fields, with a `role="note"` explanation (`MENSAJE_DEMO_CATALOGO`).
 * The `403 DEMO_SOLO_LECTURA` mapping is asserted directly on the
 * translator (already covered exhaustively by `mensajes-catalogo.test.ts`'s
 * `it.each` table, Q6c/D-05) — the read path (edit-by-id from the list)
 * still renders normally for a demo session.
 */
describe('EditarCategoria — demo (WCTG-11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('una sesión demo deshabilita Nombre, Bucket, Guardar y Eliminar categoría, y muestra role="note" con MENSAJE_DEMO_CATALOGO', async () => {
    renderEditar({ me: ME_DEMO, categorias: CATALOGO });

    expect(await screen.findByLabelText('Nombre')).toBeDisabled();
    expect(screen.getByLabelText('Bucket (obligatorio)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Eliminar categoría Supermercado' }),
    ).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(MENSAJE_DEMO_CATALOGO);
  });

  it('Cancelar sigue habilitado en demo — no es un control de mutación', async () => {
    renderEditar({ me: ME_DEMO, categorias: CATALOGO });

    expect(
      await screen.findByRole('button', {
        name: 'Cancelar cambios de nombre y bucket',
      }),
    ).not.toBeDisabled();
  });

  it('el catálogo (Nombre/Bucket pre-poblados) sigue renderizando normalmente para una sesión demo — solo lectura, no vacío ni roto', async () => {
    renderEditar({ me: ME_DEMO, categorias: CATALOGO });

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Supermercado');
    expect(screen.getByLabelText('Bucket (obligatorio)')).toHaveValue(
      'Necesidades',
    );
  });

  it('el mapeo defensivo 403 DEMO_SOLO_LECTURA está disponible en el traductor — no solo detrás de un botón deshabilitado (Q6c/D-05)', () => {
    expect(
      mensajeDeErrorCatalogo({
        tag: 'server',
        status: 403,
        code: 'DEMO_SOLO_LECTURA',
        message: 'ignored',
      }),
    ).toBe(MENSAJE_DEMO_CATALOGO);
  });
});
