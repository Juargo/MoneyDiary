import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NuevaCategoriaDesdeFilaForm } from './NuevaCategoriaDesdeFilaForm';
import { MENSAJE_DEMO_CATALOGO } from '../configuracion/categorias/mensajes-catalogo';

/**
 * NuevaCategoriaDesdeFilaForm.test.tsx (crear-categoria-desde-preview PR3,
 * design.md D-08/D-09, WEB-PRV-12..14). Inline `<form>` mounted inside a
 * preview row's `<li>` (D-08) — NOT a Radix Popover, NOT a modal. Bucket is
 * fixed (read-only text) to the row's chosen bucket; the patrones editor
 * seeds one entry from the row's own description as CONTAINS.
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

describe('NuevaCategoriaDesdeFilaForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens with Nombre focused, the bucket shown as read-only text, and one prefilled patrón entry from the row description as CONTAINS', () => {
    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    // Bucket shown as static text via ETIQUETA_BUCKET — "Deseos" -> "Gustos"
    expect(screen.getByText('Gustos')).toBeInTheDocument();
    // No control changes the bucket
    expect(screen.queryByLabelText(/bucket/i)).not.toBeInTheDocument();

    const patronInput = screen.getByDisplayValue('COMPRA PETCO');
    expect(patronInput).toBeInTheDocument();
    expect(screen.getByDisplayValue('CONTIENE')).toBeInTheDocument();
  });

  it('the prefilled patrón entry is editable and removable', async () => {
    const user = userEvent.setup();
    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    const patronInput = screen.getByDisplayValue('COMPRA PETCO');
    await user.clear(patronInput);
    await user.type(patronInput, 'PETCO');
    expect(screen.getByDisplayValue('PETCO')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /eliminar patrón/i }));
    expect(screen.queryByDisplayValue('PETCO')).not.toBeInTheDocument();
  });

  it('adding a second entry and removing the first keyed row leaves the SECOND row untouched (keyed, not by array index)', async () => {
    const user = userEvent.setup();
    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /agregar patrón/i }));
    // Two rows now: 'COMPRA PETCO' (row 1) and blank (row 2). Exact label
    // match (not a regex) — a regex like /patrón/i would also catch the
    // "Eliminar patrón…" delete buttons, which carry an aria-label too.
    const filas = screen.getAllByLabelText('Patrón');
    expect(filas).toHaveLength(2);
    await user.type(filas[1], 'SEGUNDO');

    // Remove the FIRST row via its own delete button
    const botonesEliminar = screen.getAllByRole('button', {
      name: /eliminar patrón/i,
    });
    await user.click(botonesEliminar[0]);

    // The remaining row must still show 'SEGUNDO', not inherit stale state
    // from row 1 (the classic array-index-key bug).
    expect(screen.queryByDisplayValue('COMPRA PETCO')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('SEGUNDO')).toBeInTheDocument();
  });

  it('zero patrones is a valid submission — removing the only entry still allows Crear', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'cat-nueva',
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [],
        transaccionesCount: 0,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreada = vi.fn();

    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={onCreada}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /eliminar patrón/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Mascotas');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(onCreada).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [],
    });
  });

  it('submits the payload shape { nombre, bucket, patrones: [{patron, matchType}] }, dropping blank-only rows', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'cat-nueva',
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [
          {
            id: 'p1',
            categoriaId: 'cat-nueva',
            patron: 'COMPRA PETCO',
            matchType: 'CONTAINS',
            prioridad: 100,
          },
        ],
        transaccionesCount: 0,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onCreada = vi.fn();

    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={onCreada}
      />,
      { wrapper: crearWrapper() },
    );

    // Add a second, blank-only row (whitespace) — must be dropped.
    await user.click(screen.getByRole('button', { name: /agregar patrón/i }));
    const filas = screen.getAllByLabelText(/patrón/i);
    await user.type(filas[1], '   ');

    await user.type(screen.getByLabelText('Nombre'), 'Mascotas');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(onCreada).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [{ patron: 'COMPRA PETCO', matchType: 'CONTAINS' }],
    });
    expect(onCreada).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cat-nueva' }),
    );
  });

  it('a REGEX matchType with an invalid pattern renders a non-blocking role="status" hint', async () => {
    const user = userEvent.setup();
    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    await user.selectOptions(
      screen.getByLabelText(/tipo de coincidencia/i),
      'REGEX',
    );
    const patronInput = screen.getByDisplayValue('COMPRA PETCO');
    await user.clear(patronInput);
    // An unmatched parenthesis is an invalid RegExp without needing to
    // escape userEvent's own `{}`/`[]` key-descriptor syntax.
    await user.type(patronInput, '(unterminated');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Esa expresión regular podría no ser válida.',
    );
    // Never blocks submit — Crear stays enabled.
    expect(screen.getByRole('button', { name: 'Crear' })).not.toBeDisabled();
  });

  it('an indexed server error (indice) renders role="alert" scoped to that specific patrón row, not as a form-level message', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            code: 'REGEX_INVALIDA',
            indice: 1,
            message: 'a raw server string that must never render',
          }),
      }),
    );

    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /agregar patrón/i }));
    const filas = screen.getAllByLabelText(/patrón/i);
    await user.type(filas[1], 'SEGUNDO');
    await user.type(screen.getByLabelText('Nombre'), 'Mascotas');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Esa expresión regular no es válida.');
    expect(screen.queryByText(/a raw server string/)).not.toBeInTheDocument();
    // Scoped to the SECOND row, not a form-level-only message: the alert
    // lives within the same fieldset/li as the second patrón input.
    const filaSegunda = screen.getByDisplayValue('SEGUNDO').closest('li');
    expect(filaSegunda).not.toBeNull();
    expect(filaSegunda).toContainElement(alerta);
  });

  it('a non-indexed error (e.g. duplicate nombre) renders as a single form-level role="alert"', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            code: 'NOMBRE_DUPLICADO',
            message: 'a raw server string',
          }),
      }),
    );

    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    await user.type(screen.getByLabelText('Nombre'), 'Mascotas');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    const alertas = await screen.findAllByRole('alert');
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toHaveTextContent(
      'Ya tienes una categoría con ese nombre.',
    );
  });

  it('Crear is disabled while the mutation is pending', async () => {
    const user = userEvent.setup();
    let resolverFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolverFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    await user.type(screen.getByLabelText('Nombre'), 'Mascotas');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(screen.getByRole('button', { name: 'Crear' })).toBeDisabled();
    resolverFetch({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'cat-x',
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [],
        transaccionesCount: 0,
      }),
    });
  });

  it('esDemo disables Crear but Cancelar stays enabled, with a role="note" MENSAJE_DEMO_CATALOGO', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onCancelar = vi.fn();

    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo
        onCancelar={onCancelar}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    expect(screen.getByRole('button', { name: 'Crear' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(MENSAJE_DEMO_CATALOGO);

    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancelar).not.toBeDisabled();
    await user.click(cancelar);
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Escape cancels and closes without saving, sending no request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onCancelar = vi.fn();

    render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={onCancelar}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    await user.type(screen.getByLabelText('Nombre'), 'algo sin guardar');
    await user.keyboard('{Escape}');

    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('has no axe violations while open', async () => {
    const { container } = render(
      <NuevaCategoriaDesdeFilaForm
        bucket="Deseos"
        descripcionFila="COMPRA PETCO"
        esDemo={false}
        onCancelar={() => {}}
        onCreada={() => {}}
      />,
      { wrapper: crearWrapper() },
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
