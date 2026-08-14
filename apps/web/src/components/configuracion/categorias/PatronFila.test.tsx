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

  it('blur después de editar Patrón commitea EXACTAMENTE un PATCH /api/patrones/:id y llama a onAnunciar("Patrón guardado.") (mecanismo 2, judgment-day round 2: el aria-live vive ahora en PatronesSection — ver PatronesSection.test.tsx)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const onAnunciar = vi.fn();

    render(
      <PatronFila
        categoriaId="cat-1"
        patron={PATRON}
        esDemo={false}
        onAnunciar={onAnunciar}
      />,
      { wrapper: crearWrapper() },
    );

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
    await waitFor(() =>
      expect(onAnunciar).toHaveBeenCalledWith('Patrón guardado.'),
    );
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

    // A non-empty value here — a BLANK value must not even reach the
    // server (see "un valor vacío ... NO commitea" below), so this test
    // exercises a genuine server-side rejection instead.
    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.blur(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El patrón debe tener entre 1 y 200 caracteres.',
    );
  });

  it('un valor vacío (o solo espacios) en Patrón NO commitea: sin request, sin error (fila existente)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    // No `waitFor` timeout to eat — assert synchronously that the guard
    // never even reaches the mutation, then confirm nothing shows up async.
    expect(fetchMock).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un segundo commit disparado mientras el PRIMER PATCH está en vuelo (actualizar.isPending) NO dispara un segundo PATCH, y Patrón/Tipo de coincidencia quedan deshabilitados mientras tanto (judgment-day round 2 CRITICAL: evita perder una segunda edición en silencio)', async () => {
    let resolverFetch: (value: {
      ok: boolean;
      status: number;
    }) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolverFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onAnunciar = vi.fn();

    render(
      <PatronFila
        categoriaId="cat-1"
        patron={PATRON}
        esDemo={false}
        onAnunciar={onAnunciar}
      />,
      { wrapper: crearWrapper() },
    );

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'spotify' } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // In-flight assertion BEFORE resolving (deferred promise, not
    // `mockResolvedValue`) — both fields must be disabled while THIS row's
    // own mutation is in flight, otherwise a second edit here would update
    // local state, `commit()` would silently drop it on `filaOcupada`, and
    // the field would keep showing an unsent edit reported as "saved".
    expect(screen.getByLabelText('Patrón')).toBeDisabled();
    expect(screen.getByLabelText('Tipo de coincidencia')).toBeDisabled();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolverFetch({ ok: true, status: 200 });
    await waitFor(() =>
      expect(onAnunciar).toHaveBeenCalledWith('Patrón guardado.'),
    );
    expect(screen.getByLabelText('Patrón')).not.toBeDisabled();
    expect(screen.getByLabelText('Tipo de coincidencia')).not.toBeDisabled();
  });

  it('un blur con el MISMO valor y matchType que el último commit conocido NO dispara un PATCH (dirty check, judgment-day round 2)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    // No edit at all — blur with the value exactly as loaded from `patron`.
    fireEvent.blur(screen.getByLabelText('Patrón'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tras un PATCH exitoso, un blur posterior con el MISMO valor ya guardado no repite el PATCH (dirty check idempotente)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'spotify' } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Same value as just committed — an incidental second blur (e.g. focus
    // bounced away and back) must not repeat the request.
    fireEvent.blur(input);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('elegir un Tipo de coincidencia ANTES de escribir texto NO dispara POST (valor vacío no commitea)', async () => {
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

    const select = screen.getByLabelText('Tipo de coincidencia');
    fireEvent.change(select, { target: { value: 'REGEX' } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDescartar).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un segundo commit disparado mientras el PRIMER POST está en vuelo (blur, luego cambiar Tipo de coincidencia ANTES de que resuelva) NO dispara un segundo POST — regresión del hallazgo crítico de judgment-day', async () => {
    let resolverFetch: (value: {
      ok: boolean;
      status: number;
    }) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolverFetch = resolve;
        }),
    );
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

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'uber' } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The FIRST `POST` is still pending (`resolverFetch` not yet called) —
    // `idCreado` stays `undefined` for this whole window. Picking a
    // different `matchType` here used to fire a SECOND `POST` because
    // `commit()` had no `crear.isPending` guard.
    const select = screen.getByLabelText('Tipo de coincidencia');
    fireEvent.change(select, { target: { value: 'REGEX' } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onDescartar).not.toHaveBeenCalled();

    resolverFetch({ ok: true, status: 201 });
    await waitFor(() => expect(onDescartar).toHaveBeenCalledTimes(1));
    // Still exactly one request — `onSuccess` only ever fired once.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('escribir texto y luego hacer CLIC en eliminar (el clic dispara el blur del propio Patrón, con relatedTarget = el botón) NO commitea el patrón: cero POST, la fila se descarta de inmediato (judgment-day round 2 CRITICAL — reemplaza la versión anterior de este test, que pinneaba el estado final incorrecto: el "bloqueo" del botón hacía que el POST igual aterrizara y el patrón que el usuario quería descartar terminaba persistido)', async () => {
    const user = userEvent.setup();
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

    // `user.type` (not `fireEvent.change`) so the input genuinely holds
    // focus, matching the real "type, then click the trash icon" gesture —
    // a real click always blurs the previously-focused element first.
    await user.type(screen.getByLabelText('Patrón'), 'uber');
    await user.click(screen.getByRole('button', { name: /eliminar patrón/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDescartar).toHaveBeenCalledTimes(1);
  });

  it('escribir texto y luego Tab hacia el botón eliminar (sin clic) tampoco commitea — el mecanismo cubre teclado, no solo mouse', async () => {
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

    await user.type(screen.getByLabelText('Patrón'), 'uber');
    await user.tab();

    expect(
      screen.getByRole('button', { name: /eliminar patrón/i }),
    ).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDescartar).not.toHaveBeenCalled();
  });

  it('eliminar mientras el POST de creación está en vuelo (disparado por un blur AJENO al clic de eliminar) queda bloqueado hasta que resuelve, y la fila se descarta igual al resolver — escenario distinto de la race del clic, cubierto arriba', async () => {
    const user = userEvent.setup();
    let resolverFetch: (value: {
      ok: boolean;
      status: number;
    }) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolverFetch = resolve;
        }),
    );
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

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'uber' } });
    // A blur UNRELATED to the delete button (e.g. the user tabbed to the
    // Tipo de coincidencia select, or clicked elsewhere) — this is a
    // legitimate commit trigger, not the ambiguous race above.
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const boton = screen.getByRole('button', { name: /eliminar patrón/i });
    expect(boton).toBeDisabled();

    await user.click(boton);
    expect(onDescartar).not.toHaveBeenCalled();

    resolverFetch({ ok: true, status: 201 });
    await waitFor(() => expect(onDescartar).toHaveBeenCalledTimes(1));
    expect(onDescartar).toHaveBeenCalledTimes(1);
  });
});
