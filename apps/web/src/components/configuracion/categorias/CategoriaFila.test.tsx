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
import { QUERY_CLIENT_DEFAULTS } from '@/api/query-client-defaults';
import type { CategoriaDto } from '@/api/types';
import { CategoriaFila } from './CategoriaFila';
import { CLASE_BOTON_ICONO } from '../estilos';

/**
 * CategoriaFila (US-043, design.md §1/Q10a mecanismo 2, §1/Q10c, §1/Q6d,
 * WCTG-02, WCTG-03, WCTG-08, WCTG-11, WCTG-13): una fila de la lista.
 * Renderizada dentro de un router sintético (`ConfiguracionTabs` necesita un
 * `<Link>` real) para poder resolver el `<Link>` de edición, y DENTRO de un
 * `QueryClientProvider` (PR #5, task 44) porque el botón eliminar ahora
 * cablea `useEliminarCategoria()`, que necesita un `QueryClient` en
 * contexto — hasta PR #4 esta fila no montaba ningún hook de mutación.
 */
const CATEGORIA: CategoriaDto = {
  id: 'cat-1',
  nombre: 'Supermercado',
  bucket: 'Necesidades',
  patrones: [
    {
      id: 'pat-1',
      categoriaId: 'cat-1',
      patron: 'JUMBO',
      matchType: 'CONTAINS',
      prioridad: 100,
    },
  ],
  transaccionesCount: 3,
};

function renderFila(props: {
  readonly categoria?: CategoriaDto;
  readonly esDemo?: boolean;
  readonly fetchMock?: ReturnType<typeof vi.fn>;
  readonly onEliminado?: (nombre: string) => void;
}) {
  if (props.fetchMock) {
    vi.stubGlobal('fetch', props.fetchMock);
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
        retry: false,
      },
      mutations: { retry: false },
    },
  });

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ul>
          <CategoriaFila
            categoria={props.categoria ?? CATEGORIA}
            esDemo={props.esDemo ?? false}
            onEliminado={props.onEliminado ?? (() => {})}
          />
        </ul>
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
}

describe('CategoriaFila', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renderiza el nombre y el tag de patrones (plural.ts)', async () => {
    renderFila({});

    expect(await screen.findByText('Supermercado')).toBeInTheDocument();
    expect(screen.getByText('1 patrón')).toBeInTheDocument();
  });

  it('el nombre lleva min-w-0 truncate dentro de una fila flex flex-wrap items-center gap-2 (Q10a mecanismo 2)', async () => {
    renderFila({});

    const nombre = await screen.findByText('Supermercado');
    const fila = nombre.closest('li');
    expect(fila).toHaveClass('flex', 'flex-wrap', 'items-center', 'gap-2');
    expect(nombre).toHaveClass('min-w-0', 'truncate');
  });

  it('el botón editar es un Link real hacia /configuracion/categorias/$categoriaId con aria-label desambiguado', async () => {
    renderFila({});

    const editar = await screen.findByRole('link', {
      name: 'Editar categoría Supermercado',
    });
    expect(editar).toHaveAttribute('href', '/configuracion/categorias/cat-1');
    expect(editar).toHaveClass(...CLASE_BOTON_ICONO.split(' '));
  });

  it('el botón eliminar lleva aria-label desambiguado y las clases de CLASE_BOTON_ICONO no relacionadas con display (US-063 D-09: display lo reemplaza `hidden md:inline-flex`, ver el test dedicado abajo)', async () => {
    renderFila({});

    const eliminar = await screen.findByRole('button', {
      name: 'Eliminar categoría Supermercado',
    });
    const clasesSinDisplay = CLASE_BOTON_ICONO.split(' ').filter(
      (clase) => clase !== 'inline-flex',
    );
    expect(eliminar).toHaveClass(...clasesSinDisplay);
    expect(eliminar).not.toBeDisabled();
  });

  it('el botón eliminar es hidden md:inline-flex, nunca un inline-flex a secas (US-063 D-09 mechanical note, WCTM-03) — mecanismo, la geometría real es de e2e/list-surface.e2e.ts', async () => {
    renderFila({});

    const eliminar = await screen.findByRole('button', {
      name: 'Eliminar categoría Supermercado',
    });
    expect(eliminar).toHaveClass('hidden', 'md:inline-flex');
    // tailwind-merge trata `display` como un solo grupo: `hidden` (agregado
    // SEGUNDO en cn(), después de CLASE_BOTON_ICONO) gana sobre el
    // `inline-flex` sin prefijo de CLASE_BOTON_ICONO, mientras que la
    // variante `md:` sobrevive como grupo aparte. Invertir el orden de los
    // argumentos produciría en silencio un `inline-flex` a secas — sin este
    // test, nada lo detectaría.
    expect(eliminar.className.split(' ')).not.toContain('inline-flex');
  });

  it('el botón eliminar está proactivamente disabled en una sesión demo (WCTG-11) — el editar Link sigue activo', async () => {
    renderFila({ esDemo: true });

    expect(
      await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Editar categoría Supermercado' }),
    ).toBeInTheDocument();
  });

  it('sin patrones renderiza el tag "sin patrones" (WCTG-03 forma cero)', async () => {
    renderFila({ categoria: { ...CATEGORIA, patrones: [] } });

    expect(await screen.findByText('sin patrones')).toBeInTheDocument();
  });

  /**
   * Second delete entry point (§1/Q6d, task 44, WCTG-08): the SAME
   * `ConfirmarImpactoDialog`/`useEliminarCategoria()` PR #3b's edit-screen
   * footer button already uses. `transaccionesCount` comes from the row's
   * own already-loaded `categoria` prop — never a fresh fetch (decision 3).
   * Unlike the edit screen's version, a successful confirm here does NOT
   * navigate — it only closes this row's own dialog; the row disappears
   * from the list via the same profile-B invalidation every other category
   * mutation triggers.
   */
  describe('eliminar desde la fila de la lista (Q6d, WCTG-08)', () => {
    it('click en el icono eliminar abre ConfirmarImpactoDialog con fraseDeImpacto(eliminar) usando el transaccionesCount YA CARGADO en la fila', async () => {
      const user = userEvent.setup();
      renderFila({});

      await user.click(
        await screen.findByRole('button', {
          name: 'Eliminar categoría Supermercado',
        }),
      );

      const dialogo = await screen.findByRole('alertdialog');
      expect(
        within(dialogo).getByText('Eliminar categoría'),
      ).toBeInTheDocument();
      expect(
        within(dialogo).getByText('Vas a eliminar «Supermercado».'),
      ).toBeInTheDocument();
      expect(
        within(dialogo).getByText(
          '3 transacciones quedan en Sin categoría, en todos los períodos.',
        ),
      ).toBeInTheDocument();
    });

    /**
     * judgment-day ROUND 1 fix 2 (WARNING, BOTH judges, WCAG 4.1.2): the
     * VISIBLE title stays the fixed `'Eliminar categoría'` (assertion
     * above), but the accessible name must carry the row's own category
     * name — this is what lets two simultaneously open, non-modal dialogs
     * (one per row, `CategoriasPanel.test.tsx`) stay distinguishable to a
     * screen reader.
     *
     * judgment-day ROUND 2 issue 3 (WARNING, Judge B): round 1's dialog
     * label exactly duplicated the trigger button's own `aria-label`
     * (`Eliminar categoría {nombre}`), so even the NORMAL single-row case —
     * one open dialog, one still-visible trigger — had two elements sharing
     * one accessible name. The dialog's label must now differ from the
     * trigger's while still carrying the category name.
     */
    it('el aria-label del diálogo incluye el nombre de la categoría, distinto del título visible', async () => {
      const user = userEvent.setup();
      renderFila({});

      await user.click(
        await screen.findByRole('button', {
          name: 'Eliminar categoría Supermercado',
        }),
      );

      const dialogo = await screen.findByRole('alertdialog');
      expect(dialogo).toHaveAttribute(
        'aria-label',
        'Confirmar eliminación de categoría Supermercado',
      );
    });

    it('el aria-label del diálogo difiere del aria-label del botón trigger, incluso con una sola fila (WCAG 4.1.2, issue 3)', async () => {
      const user = userEvent.setup();
      renderFila({});

      const trigger = await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      });
      await user.click(trigger);

      const dialogo = await screen.findByRole('alertdialog');
      // El trigger sigue montado y habilitado mientras el diálogo está
      // abierto (no es modal) — si compartieran nombre accesible, un
      // usuario de lector de pantalla enumerando botones y luego diálogos
      // vería un nombre ambiguo duplicado.
      expect(trigger).toBeInTheDocument();
      expect(trigger).not.toBeDisabled();
      expect(dialogo.getAttribute('aria-label')).not.toBe(
        trigger.getAttribute('aria-label'),
      );
    });

    /**
     * judgment-day fix 1 (WARNING, WCAG 2.4.3): `CategoriaFila` cannot
     * restore focus to its own trigger on success (the row unmounts via the
     * profile-B refetch) — it delegates the choice of a stable focus target
     * to its caller via `onEliminado`. This is the unit-level half of the
     * fix; `CategoriasPanel.test.tsx` covers the actual focus landing on a
     * real, still-mounted element.
     */
    it('confirmar elimina exitosamente invoca onEliminado con el nombre de la categoría', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      const onEliminado = vi.fn();
      renderFila({ fetchMock, onEliminado });

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
        expect(onEliminado).toHaveBeenCalledWith('Supermercado'),
      );
    });

    it('confirmar elimina (DELETE) y cierra el diálogo de la fila SIN navegar', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      renderFila({ fetchMock });

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
      await vi.waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      );
      // No navigation happens from this entry point (design.md §1/Q6d) — the
      // synthetic router here only knows the edit route, so a navigation
      // attempt away from the row would leave nothing rendered at all.
      expect(
        screen.getByRole('link', { name: 'Editar categoría Supermercado' }),
      ).toBeInTheDocument();
    });

    it('Escape cierra el diálogo sin eliminar y restaura el foco al botón eliminar', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn();
      renderFila({ fetchMock });

      const eliminar = await screen.findByRole('button', {
        name: 'Eliminar categoría Supermercado',
      });
      await user.click(eliminar);
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(eliminar).toHaveFocus();
    });

    it('un delete fallido mantiene el diálogo de la fila abierto con el error inline, sin navegar', async () => {
      // Deferred promise, not `mockResolvedValue` (judgment-day finding
      // recorded on `EditarCategoria.test.tsx`'s equivalent case): an
      // already-resolved promise lets React coalesce pending→error into one
      // commit, so the in-flight render this test needs to observe never
      // actually happens.
      let resolverFetch!: (value: { ok: boolean; status: number }) => void;
      const fetchMock = vi.fn(
        () =>
          new Promise<{ ok: boolean; status: number }>((resolve) => {
            resolverFetch = resolve;
          }),
      );
      const user = userEvent.setup();
      renderFila({ fetchMock });

      await user.click(
        await screen.findByRole('button', {
          name: 'Eliminar categoría Supermercado',
        }),
      );
      const dialogo = await screen.findByRole('alertdialog');
      await user.click(
        within(dialogo).getByRole('button', { name: 'Eliminar' }),
      );

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      resolverFetch({ ok: false, status: 500 });

      expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
        'Ocurrió un error inesperado. Intenta nuevamente.',
      );
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });
});
