import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NuevaCategoriaForm } from './NuevaCategoriaForm';
import { MENSAJE_DEMO_CATALOGO } from './mensajes-catalogo';

/**
 * NuevaCategoriaForm.test.tsx (US-043, design.md §1/Q9a, WCTG-02, WCTG-11)
 * — `Nombre` + `Bucket (obligatorio)` + `Crear`/`Cancelar`, toggled open by
 * `CategoriasPanel`'s `Nueva categoría` button (PR #3a task 26). Closes on
 * `201` (calls `onCerrar`). Proactively demo-disabled (Q6c's
 * `MENSAJE_DEMO_CATALOGO`); the error surface is `mensajeDeErrorCatalogo`,
 * never a server-supplied string — `NOMBRE_DUPLICADO` (409) is the
 * realistic failure this screen produces.
 */
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

describe('NuevaCategoriaForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * US-063 PR #4 (maintainer extension, not WCTM-05 — that requirement
   * names only EditarCategoria's grid): mirrors EditarCategoria.test.tsx's
   * task-25 grid pin so both forms on the Categorías surface read
   * consistently between 640px and 767px. Class-name pin, not a
   * rendered-geometry assertion — jsdom performs no layout.
   */
  it('el grid de Nombre/Bucket lleva grid-cols-1 (apilado bajo md) y md:grid-cols-[1fr_220px] (lado a lado desde md)', () => {
    const { container } = render(
      <NuevaCategoriaForm esDemo={false} onCerrar={() => {}} />,
      { wrapper: crearWrapper() },
    );

    const grid = container.querySelector('form > div');
    expect(grid).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-[1fr_220px]');
  });

  it('renderiza Nombre y Bucket (obligatorio), con las tres opciones de bucket etiquetadas por A1', () => {
    render(<NuevaCategoriaForm esDemo={false} onCerrar={() => {}} />, {
      wrapper: crearWrapper(),
    });

    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    const selectBucket = screen.getByLabelText('Bucket (obligatorio)');
    expect(selectBucket).toHaveValue('Necesidades');
    expect(screen.getByRole('option', { name: 'Gustos' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Deseos' }),
    ).not.toBeInTheDocument();
  });

  it('enviar Crear llama a POST /api/categorias con el nombre y bucket elegidos, y cierra el form en 201', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'cat-nueva',
        nombre: 'Streaming',
        bucket: 'Deseos',
        patrones: [],
        transaccionesCount: 0,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCerrar = vi.fn();

    render(<NuevaCategoriaForm esDemo={false} onCerrar={onCerrar} />, {
      wrapper: crearWrapper(),
    });

    await user.type(screen.getByLabelText('Nombre'), 'Streaming');
    await user.selectOptions(
      screen.getByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Streaming', bucket: 'Deseos' }),
    });
  });

  it('Cancelar llama a onCerrar sin emitir ninguna request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onCerrar = vi.fn();

    render(<NuevaCategoriaForm esDemo={false} onCerrar={onCerrar} />, {
      wrapper: crearWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un 409 NOMBRE_DUPLICADO renderiza la copia de mensajeDeErrorCatalogo en role="alert", nunca un string del servidor', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            code: 'NOMBRE_DUPLICADO',
            message: 'a duplicate category name error from the server',
          }),
      }),
    );

    render(<NuevaCategoriaForm esDemo={false} onCerrar={() => {}} />, {
      wrapper: crearWrapper(),
    });

    await user.type(screen.getByLabelText('Nombre'), 'Streaming');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya tienes una categoría con ese nombre.',
    );
    expect(
      screen.queryByText(/a duplicate category name error/),
    ).not.toBeInTheDocument();
  });

  it('una sesión demo deshabilita Nombre, Bucket y Crear, y muestra role="note" con MENSAJE_DEMO_CATALOGO — Cancelar sigue habilitado (WCTG-11)', () => {
    render(<NuevaCategoriaForm esDemo onCerrar={() => {}} />, {
      wrapper: crearWrapper(),
    });

    expect(screen.getByLabelText('Nombre')).toBeDisabled();
    expect(screen.getByLabelText('Bucket (obligatorio)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).not.toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(MENSAJE_DEMO_CATALOGO);
  });
});
