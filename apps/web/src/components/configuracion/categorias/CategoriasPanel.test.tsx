import { render, screen } from '@testing-library/react';
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

  it('una sesión demo ve el banner role="note" con MENSAJE_DEMO_CATALOGO — y el catálogo igual renderiza (WCTG-11)', async () => {
    renderPanel({ me: ME_DEMO, categorias: CATALOGO });

    expect(await screen.findByRole('note')).toHaveTextContent(
      MENSAJE_DEMO_CATALOGO,
    );
    expect(screen.getByText('Supermercado')).toBeInTheDocument();
  });

  it('una sesión NO demo no muestra el banner role="note"', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await screen.findByText('Supermercado');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('la frase del footer trae las dos variantes responsivas (lg y below-lg), ambas con el copy verbatim de §8c', async () => {
    renderPanel({ me: ME_NO_DEMO, categorias: CATALOGO });

    await screen.findByText('Supermercado');
    const corta = screen.getByText(
      'Eliminar en uso: advertencia, transacciones a Sin categoría.',
    );
    const larga = screen.getByText(
      'Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría.',
    );
    expect(corta).toHaveClass('lg:hidden');
    expect(larga).toHaveClass('hidden', 'lg:inline');
  });

  it('el botón Nueva categoría tiene nombre accesible estable con las dos variantes responsivas (§8c)', async () => {
    renderPanel({
      me: ME_NO_DEMO,
      categorias: CATALOGO,
      fetchMock: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(CATALOGO),
      }),
    });

    const boton = await screen.findByRole('button', {
      name: 'Nueva categoría',
    });
    expect(boton.querySelector('.lg\\:hidden')).toHaveTextContent('Nueva');
    expect(boton.querySelector('.hidden.lg\\:inline')).toHaveTextContent(
      'Nueva categoría',
    );
  });

  it("hacer click en Nueva categoría abre NuevaCategoriaForm (task 26 closes WCTG-02's button clause)", async () => {
    const user = userEvent.setup();
    renderPanel({
      me: ME_NO_DEMO,
      categorias: CATALOGO,
      fetchMock: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(CATALOGO),
      }),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Bucket (obligatorio)')).toBeInTheDocument();
  });

  it('Cancelar en el form recién abierto lo cierra y vuelve a mostrar el botón Nueva categoría', async () => {
    const user = userEvent.setup();
    renderPanel({
      me: ME_NO_DEMO,
      categorias: CATALOGO,
      fetchMock: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(CATALOGO),
      }),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Nueva categoría' }),
    ).toBeInTheDocument();
  });
});
