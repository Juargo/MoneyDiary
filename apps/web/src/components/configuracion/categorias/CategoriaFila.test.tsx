import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { CategoriaDto } from '@/api/types';
import { CategoriaFila } from './CategoriaFila';
import { CLASE_BOTON_ICONO } from './estilos';

/**
 * CategoriaFila (US-043, design.md §1/Q10a mecanismo 2, §1/Q10c, WCTG-02,
 * WCTG-03, WCTG-11, WCTG-13): una fila de la lista. Renderizada dentro de un
 * router sintético (`categoriaFila.test.tsx` precedent: `ConfiguracionTabs`
 * necesita un `<Link>` real) para poder resolver el `<Link>` de edición.
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
}) {
  const rootRoute = createRootRoute({
    component: () => (
      <ul>
        <CategoriaFila
          categoria={props.categoria ?? CATEGORIA}
          esDemo={props.esDemo ?? false}
        />
      </ul>
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

  it('el botón eliminar lleva aria-label desambiguado y CLASE_BOTON_ICONO', async () => {
    renderFila({});

    const eliminar = await screen.findByRole('button', {
      name: 'Eliminar categoría Supermercado',
    });
    expect(eliminar).toHaveClass(...CLASE_BOTON_ICONO.split(' '));
    expect(eliminar).not.toBeDisabled();
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
});
