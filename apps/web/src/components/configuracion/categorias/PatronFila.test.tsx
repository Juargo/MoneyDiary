import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PatronDto } from '@/api/types';
import { PatronFila } from './PatronFila';

/**
 * PatronFila.test.tsx (US-043 PR #4, design.md §1/Q9b, WCTG-04, WCTG-09,
 * WCTG-13) — one pattern row. `matchType` `<select>` + `patron` `<input>`,
 * both `<label>`-associated; commits on blur-or-Enter, immediate, per row —
 * never batched. Delete fires with NO dialog (a pattern carries no impact).
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

const PATRON: PatronDto = {
  id: 'pat-1',
  categoriaId: 'cat-1',
  patron: 'netflix',
  matchType: 'CONTAINS',
  prioridad: 100,
};

describe('PatronFila — fila existente', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renderiza patrón y tipo de coincidencia, ambos label-associated', () => {
    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    expect(screen.getByLabelText('Patrón')).toHaveValue('netflix');
    expect(screen.getByLabelText('Tipo de coincidencia')).toHaveValue(
      'CONTAINS',
    );
    expect(
      screen.getByRole('option', { name: 'CONTIENE' }),
    ).toBeInTheDocument();
  });

  it('blur después de editar Patrón commitea EXACTAMENTE un PATCH /api/patrones/:id y anuncia "Patrón guardado." (mecanismo 2)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'spotify' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
        credentials: 'same-origin',
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patron: 'spotify', matchType: 'CONTAINS' }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Patrón guardado.')).toBeInTheDocument();
  });

  it('Enter (sin blur previo) también commitea', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'disney' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patron: 'disney', matchType: 'CONTAINS' }),
    });
  });

  it('elegir un nuevo Tipo de coincidencia commitea inmediatamente, sin esperar blur', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    await user.selectOptions(
      screen.getByLabelText('Tipo de coincidencia'),
      'REGEX',
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patron: 'netflix', matchType: 'REGEX' }),
    });
  });

  it('REGEX pre-validation es un HINT, no un gate: una regex inválida muestra role="status" pero blur SIGUE commiteando', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    await user.selectOptions(
      screen.getByLabelText('Tipo de coincidencia'),
      'REGEX',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockClear();

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: '(unclosed' } });

    expect(await screen.findByRole('status')).toBeInTheDocument();

    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patron: '(unclosed', matchType: 'REGEX' }),
    });
  });

  it('el icono de eliminar dispara DELETE /api/patrones/:id sin diálogo', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /eliminar patrón/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
        credentials: 'same-origin',
        method: 'DELETE',
      }),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('un error de commit (400 PATRON_INVALIDO) renderiza mensajeDeErrorCatalogo en role="alert"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'PATRON_INVALIDO' }),
      }),
    );

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El patrón debe tener entre 1 y 200 caracteres.',
    );
  });

  it('sesión demo: Patrón, Tipo de coincidencia y el botón eliminar quedan deshabilitados (WCTG-11)', () => {
    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo />, {
      wrapper: crearWrapper(),
    });

    expect(screen.getByLabelText('Patrón')).toBeDisabled();
    expect(screen.getByLabelText('Tipo de coincidencia')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /eliminar patrón/i }),
    ).toBeDisabled();
  });
});

describe('PatronFila — fila nueva (sin patrón todavía creado)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('arranca vacía, y el primer commit (blur) dispara POST /api/patrones con categoriaId y luego llama a onDescartar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);
    const onDescartar = vi.fn();

    render(
      <PatronFila
        categoriaId="cat-1"
        esDemo={false}
        onDescartar={onDescartar}
      />,
      { wrapper: crearWrapper() },
    );

    expect(screen.getByLabelText('Patrón')).toHaveValue('');

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'uber' } });
    fireEvent.blur(input);

    await waitFor(() => expect(onDescartar).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        categoriaId: 'cat-1',
        patron: 'uber',
        matchType: 'CONTAINS',
      }),
    });
  });

  it('eliminar una fila NO creada todavía llama a onDescartar sin emitir ninguna request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onDescartar = vi.fn();

    render(
      <PatronFila
        categoriaId="cat-1"
        esDemo={false}
        onDescartar={onDescartar}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /eliminar patrón/i }));

    expect(onDescartar).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
