import { render, screen, within } from '@testing-library/react';
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
import { CategoriasPanel } from './CategoriasPanel';
import { MENSAJE_DEMO_CATALOGO } from './mensajes-catalogo';

/**
 * CategoriasPanel (US-043, design.md §1/Q4a/Q8c/Q9a placeholder-free,
 * WCTG-02, WCTG-03, WCTG-11): `useCategorias()` → `agruparPorBucket` →
 * headings via `ETIQUETA_BUCKET` (A1) → `CategoriaFila` rows. Query-pending,
 * query-error, and the empty-catalog state. The demo `role="note"` banner.
 * The `Nueva categoría` button is deliberately NOT tested here — PR #3a
 * (task 26) adds it with its own form.
 *
 * Rendered inside a real router (`CategoriaFila`'s `<Link>` needs it) AND a
 * `QueryClientProvider` with `['categorias']`/`['auth-me']` pre-populated —
 * same combined idiom as `PerfilPanel.test.tsx` (router) +
 * `use-categorias.test.tsx` (query client), because this panel is the first
 * component in the feature to need both at once.
 *
 * The `Nueva categoría` button and its wiring to `NuevaCategoriaForm` (PR
 * #3a task 26) ARE tested here now — deferred from PR #2 (task 20) so no
 * dead button ever shipped. `NuevaCategoriaForm`'s own field/mutation/demo
 * behaviour is covered exhaustively by `NuevaCategoriaForm.test.tsx`; the
 * tests below only pin the open/close wiring — they would be redundant if
 * they re-asserted the form's internals.
 */
const ME_NO_DEMO: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

const ME_DEMO: MeDto = { ...ME_NO_DEMO, esDemo: true, email: null };

const CATALOGO: CatalogoDto = {
  categorias: [
    {
      id: 'cat-ahorro',
      nombre: 'Ahorro programado',
      bucket: 'Ahorro',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-necesidades',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 3,
    },
    {
      id: 'cat-deseos',
      nombre: 'Streaming',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 1,
    },
  ],
};

function renderPanel(options: {
  readonly me?: MeDto;
  readonly categorias?: CatalogoDto;
  readonly fetchMock?: ReturnType<typeof vi.fn>;
}) {
  // `QUERY_CLIENT_DEFAULTS` (mismo `staleTime` que producción, judgment-day
  // PR #336/#337 fix 2): sin esto, el cliente de test caía al default de
  // TanStack (`staleTime: 0`), y la caché pre-poblada de `['categorias']`
  // disparaba un refetch instantáneo al montar — de ahí el `fetchMock` ad
  // hoc que varios tests de interacción tenían que stubear solo para no
  // reventar. `retry: false` se mantiene: los tests sí lo necesitan.
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

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <CategoriasPanel />
      </QueryClientProvider>
    ),
  });
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion/categorias/$categoriaId',
    component: () => <p>Editar</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([editRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  render(<RouterProvider router={router} />);
  return queryClient;
}

describe('CategoriasPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renderiza el título y el subtítulo verbatim (§8)', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Categorías y patrones',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tu catálogo propio: toda categoría pertenece a un bucket. Los patrones permiten la auto-categorización.',
      ),
    ).toBeInTheDocument();
  });

  it('agrupa en orden fijo Necesidades, Gustos, Ahorro — el heading del medio lee "Gustos", no "Deseos" (A1)', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Necesidades',
      'Gustos',
      'Ahorro',
    ]);
    expect(screen.queryByText('Deseos')).not.toBeInTheDocument();
  });

  it('cada grupo renderiza sus categorías vía CategoriaFila (nombre + Link de edición)', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    expect(await screen.findByText('Supermercado')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Editar categoría Supermercado' }),
    ).toBeInTheDocument();
  });

  it('un catálogo vacío renderiza un empty state, no una lista rota o en blanco', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: { categorias: [] } });

    expect(
      await screen.findByText('Todavía no tienes categorías'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('muestra el estado de carga (role="status") mientras la query está pendiente', async () => {
    renderPanel({
      me: ME_NO_DEMO,
      fetchMock: vi.fn(() => new Promise(() => {})),
    });

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('muestra el estado de error (role="alert") cuando la query falla', async () => {
    renderPanel({
      me: ME_NO_DEMO,
      fetchMock: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
  });

  it('el error de la lista usa mensajeDeErrorCatalogo, no el error.message crudo — misma copia que la pantalla de edición (WCTG-12)', async () => {
    // Un 2xx cuyo body falla `esCatalogoDto` produce `tag: 'parse'`, cuyo
    // `error.message` ('Respuesta inesperada del servidor.') difiere de la
    // copia del catálogo. Es el caso que distingue las dos superficies: para
    // `network` y para un 500 sin `code` ambas tablas coinciden por
    // casualidad, así que un test sobre esos sería vacuo.
    renderPanel({
      me: ME_NO_DEMO,
      fetchMock: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ categorias: 'no es un array' }),
      }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
    );
  });

  it('una sesión demo ve el banner role="note" con MENSAJE_DEMO_CATALOGO — y el catálogo igual renderiza (WCTG-11)', async () => {
    renderPanel({ me: ME_DEMO, categorias: CATALOGO });

    expect(await screen.findByRole('note')).toHaveTextContent(
      MENSAJE_DEMO_CATALOGO,
    );
    expect(screen.getByText('Supermercado')).toBeInTheDocument();
  });

  it('esDemo + form de creación abierto: el banner role="note" aparece UNA sola vez, no duplicado (judgment-day PR #336/#337, fix 3)', async () => {
    const user = userEvent.setup();
    renderPanel({ me: ME_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );

    // getByRole ya lanzaría si hubiera 0 o >1 coincidencias — getAllByRole
    // + toHaveLength(1) deja la aserción explícita para el discrimination
    // proof (romper el fix debe fallar exactamente aquí).
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(screen.getByRole('note')).toHaveTextContent(MENSAJE_DEMO_CATALOGO);
  });

  it('una sesión NO demo no muestra el banner role="note"', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await screen.findByText('Supermercado');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('la frase del footer trae las TRES variantes responsivas (US-063 D-03/WCTM-06), todas con el copy verbatim', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await screen.findByText('Supermercado');
    const movil = screen.getByText(
      'Toca una categoría para editarla o eliminarla.',
    );
    const tablet = screen.getByText(
      'Eliminar en uso: advertencia, transacciones a Sin categoría.',
    );
    const escritorio = screen.getByText(
      'Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría.',
    );
    expect(movil).toHaveClass('md:hidden');
    expect(tablet).toHaveClass('hidden', 'md:inline', 'lg:hidden');
    expect(escritorio).toHaveClass('hidden', 'lg:inline');
  });

  it('el botón Nueva categoría tiene nombre accesible estable con las TRES variantes responsivas no-monótonas (US-063 D-04/WCTM-06)', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    const boton = await screen.findByRole('button', {
      name: 'Nueva categoría',
    });
    // `movil` y `escritorio` comparten literalmente el mismo texto ("Nueva
    // categoría" — la fila no-monótona de WCTM-06) — se distinguen por su
    // clase de banda, nunca por el texto, que es ambiguo entre ambas.
    expect(boton.querySelector('.md\\:hidden')).toHaveTextContent(
      'Nueva categoría',
    );
    expect(
      boton.querySelector('.hidden.md\\:inline.lg\\:hidden'),
    ).toHaveTextContent('Nueva');
    expect(boton.querySelector('.hidden.lg\\:inline')).toHaveTextContent(
      'Nueva categoría',
    );
  });

  it('el botón Nueva categoría es w-full md:w-auto (US-063 CA-01, mecanismo — la geometría real es de e2e/list-surface.e2e.ts)', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    const boton = await screen.findByRole('button', {
      name: 'Nueva categoría',
    });
    expect(boton).toHaveClass('w-full', 'md:w-auto');
  });

  it('el header es flex-col md:flex-row (US-063 WCTM-02, mecanismo)', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Categorías y patrones',
    });
    const header = heading.parentElement?.parentElement;
    expect(header).toHaveClass('flex-col', 'md:flex-row');
  });

  it('el subtítulo Tu catálogo propio… se omite bajo md (US-063 CA-05, mecanismo — hidden md:block)', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await screen.findByText('Supermercado');
    const subtitulo = screen.getByText(
      'Tu catálogo propio: toda categoría pertenece a un bucket. Los patrones permiten la auto-categorización.',
    );
    expect(subtitulo).toHaveClass('hidden', 'md:block');
  });

  it("hacer click en Nueva categoría abre NuevaCategoriaForm (task 26 closes WCTG-02's button clause)", async () => {
    const user = userEvent.setup();
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Bucket (obligatorio)')).toBeInTheDocument();
  });

  it('Cancelar en el form recién abierto lo cierra y vuelve a mostrar el botón Nueva categoría', async () => {
    const user = userEvent.setup();
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Nueva categoría' }),
    ).toBeInTheDocument();
  });

  /**
   * judgment-day fix 1 (WARNING, both judges verified by orchestrator):
   * `ConfirmarImpactoDialog` moves focus onto its own confirm button on
   * mount and states its contract is that the CALLER restores focus after.
   * `CategoriaFila`'s cancel/Escape path already does that
   * (`eliminarRef.current?.focus()`), but the success path did not — and
   * unlike the edit screen's own delete (which navigates and resets focus
   * context), this list entry point deliberately stays on the same screen,
   * so nothing was restoring focus on a successful delete: it fell to
   * `<body>`. The row's own trigger cannot be the target either — the row
   * unmounts via the profile-B `['categorias']` refetch this same DELETE
   * triggers — so focus must land on a target that survives the row's
   * removal, here the panel's own `Categorías y patrones` heading.
   *
   * This assertion proves `document.activeElement` is a real, still-mounted
   * element (the heading) after the row disappears — not that any specific
   * ARIA announcement happened (no `disabled` transition is involved here,
   * so `document.activeElement` is a legitimate proof).
   */
  it('un delete exitoso desde la fila mueve el foco al heading del panel (WCAG 2.4.3), no lo deja en <body>', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_url: string, opciones?: RequestInit) => {
      if (opciones?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            categorias: CATALOGO.categorias.filter(
              (c) => c.id !== 'cat-necesidades',
            ),
          }),
      });
    });
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO, fetchMock });

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
      expect(screen.queryByText('Supermercado')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Categorías y patrones' }),
    ).toHaveFocus();
  });

  /**
   * judgment-day fix 2 (WARNING, BOTH judges): `ConfirmarImpactoDialog` sets
   * `aria-label={titulo}`, and `fraseDeImpacto`'s `titulo` for a delete is
   * the FIXED string `'Eliminar categoría'` — never the row's own category
   * name. That was harmless with a single-instance caller (the edit
   * screen), but this panel renders one `CategoriaFila` per category, each
   * with its own independent `dialogoAbierto` state and no cross-row
   * coordination, and the dialog is deliberately non-modal (no focus trap)
   * so other rows' triggers stay reachable — a user can leave row A's
   * dialog open and open row B's too, producing two `role="alertdialog"`
   * elements with the IDENTICAL accessible name. `CategoriaFila`
   * disambiguates via `ariaLabel` the same way its own icon buttons already
   * do (`Eliminar categoría {nombre}`).
   */
  it('dos filas con su ConfirmarImpactoDialog abiertos a la vez tienen accessible names distintos (WCAG 4.1.2)', async () => {
    const user = userEvent.setup();
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Ahorro programado',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Eliminar categoría Supermercado' }),
    );

    const dialogos = screen.getAllByRole('alertdialog');
    expect(dialogos).toHaveLength(2);
    // Ambos siguen mostrando el mismo título VISIBLE — solo el nombre
    // accesible se desambigua.
    expect(
      within(dialogos[0]).getByText('Eliminar categoría'),
    ).toBeInTheDocument();
    expect(
      within(dialogos[1]).getByText('Eliminar categoría'),
    ).toBeInTheDocument();
    const nombresAccesibles = dialogos.map((d) => d.getAttribute('aria-label'));
    expect(new Set(nombresAccesibles).size).toBe(2);
  });

  /**
   * judgment-day ROUND 2, issue 1 (WARNING, both judges): the heading gets
   * `focus:outline-none` with no replacement, so the WCAG 2.4.3 focus-restore
   * fix above lands on an invisible target for a sighted keyboard user.
   * jsdom performs no layout/paint, so this assertion can only prove the
   * `focus-visible:outline-*` classes are present on the element — it does
   * NOT prove a ring actually renders on screen.
   */
  it('el heading tiene las clases focus-visible:outline-* (mismo idioma que ListaIngestas/SubirCartola) — prueba la clase, no el render visual', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Categorías y patrones',
    });
    expect(heading).toHaveClass(
      'focus-visible:outline',
      'focus-visible:outline-2',
      'focus-visible:outline-ring',
    );
    expect(heading).not.toHaveClass('focus:outline-none');
  });

  /**
   * judgment-day ROUND 2, issue 2 (WARNING, both judges): the same
   * successful delete that focuses `tituloRef` also triggers profile B's
   * background refetch of `['categorias']`. If THAT refetch fails, the
   * unconditional `if (query.isError && !creando) return <ErrorState/>`
   * unmounts the whole panel — including the just-focused heading — so
   * focus silently drops to `<body>` and the user never sees confirmation
   * the delete itself worked. Deferred promise for the background GET
   * (not `mockResolvedValue`) so the test can assert the mid-flight/
   * post-failure render, not just the final settled state.
   */
  it('un refetch fallido de ["categorias"] tras un delete exitoso NO destruye el heading recién enfocado', async () => {
    const user = userEvent.setup();
    let resolverRefetch!: (value: {
      readonly ok: boolean;
      readonly status: number;
    }) => void;
    const fetchMock = vi.fn((_url: string, opciones?: RequestInit) => {
      if (opciones?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return new Promise<{ ok: boolean; status: number }>((resolve) => {
        resolverRefetch = resolve;
      });
    });
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO, fetchMock });

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
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Categorías y patrones',
        }),
      ).toHaveFocus(),
    );

    resolverRefetch({ ok: false, status: 500 });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Categorías y patrones' }),
    ).toHaveFocus();
  });

  /**
   * judgment-day PR #5 (WARNING, both judges): the round-2 test above proves
   * `eliminadoRecientemente` protects THIS delete's own refetch settling.
   * This test proves the OTHER half — that the guard does not silently
   * outlive that window. `dataUpdatedAt` only advances on a fetch that
   * SUCCEEDS: the delete's own background refetch below is stubbed to
   * succeed, which must clear the guard; a LATER, unrelated `['categorias']`
   * failure (simulated via a manual `refetchQueries` after swapping the
   * `fetch` stub) must then take the full-page `ErrorState` path again — not
   * the softened inline one. A boolean latch that is only ever set `true`
   * and never reset (the pre-fix shape) fails this assertion: the heading
   * would still be mounted because `eliminadoRecientemente` never went back
   * to `false`.
   */
  it('tras un refetch exitoso posterior al delete, un fallo NUEVO Y NO relacionado sí vuelve al ErrorState de página completa (el guard no es un ratchet)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_url: string, opciones?: RequestInit) => {
      if (opciones?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            categorias: CATALOGO.categorias.filter(
              (c) => c.id !== 'cat-necesidades',
            ),
          }),
      });
    });
    const queryClient = renderPanel({
      me: ME_NO_DEMO,
      categorias: CATALOGO,
      fetchMock,
    });

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

    // La refetch propia del delete (profile B) tuvo éxito: dataUpdatedAt
    // avanzó y el guard ya se auto-limpió.
    await vi.waitFor(() =>
      expect(screen.queryByText('Supermercado')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Un fallo posterior, sin relación con el delete (p.ej. un refetch por
    // window refocus horas después), debe caer en la página completa de
    // error — no en el guard inline que protegía el delete.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await queryClient.refetchQueries({ queryKey: CATEGORIAS_QUERY_KEY });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        level: 2,
        name: 'Categorías y patrones',
      }),
    ).not.toBeInTheDocument();
  });

  /**
   * judgment-day PR #5 (SUGGESTION, Judge B): while the inline error path
   * (`eliminadoRecientemente`) is up, the catalog fetch is genuinely
   * failing — offering `Nueva categoría` in that state is confusing even
   * though nothing crashes (`NuevaCategoriaForm` doesn't read `query.data`).
   * Same deferred-promise idiom as the round-2 test: assert the button is
   * gone only AFTER the background refetch has actually settled as a
   * failure, not merely mid-flight.
   */
  it('mientras el ErrorState inline está activo por un delete cuyo refetch falló, el botón Nueva categoría no se muestra', async () => {
    const user = userEvent.setup();
    let resolverRefetch!: (value: {
      readonly ok: boolean;
      readonly status: number;
    }) => void;
    const fetchMock = vi.fn((_url: string, opciones?: RequestInit) => {
      if (opciones?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return new Promise<{ ok: boolean; status: number }>((resolve) => {
        resolverRefetch = resolve;
      });
    });
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO, fetchMock });

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
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'Categorías y patrones',
        }),
      ).toHaveFocus(),
    );

    resolverRefetch({ ok: false, status: 500 });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Nueva categoría' }),
    ).not.toBeInTheDocument();
  });

  it('un refetch fallido de ["categorias"] con el form abierto NO destruye el draft en progreso (judgment-day PR #336/#337, fix 1)', async () => {
    const user = userEvent.setup();
    const queryClient = renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await user.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );
    await user.type(screen.getByLabelText('Nombre'), 'Categoría en progreso');

    // Simula el refetch de fondo (p.ej. window refocus) fallando mientras el
    // usuario sigue escribiendo — no un fallo del `fetch` inicial.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await queryClient.refetchQueries({ queryKey: CATEGORIAS_QUERY_KEY });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue(
      'Categoría en progreso',
    );
  });
});
