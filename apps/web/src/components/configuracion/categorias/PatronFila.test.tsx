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
 * both `<label>`-associated, immediate per-row commits — never batched.
 * Delete fires with NO dialog (a pattern carries no impact).
 *
 * **Redesign (judgment-day, 2026-08-14, see `PatronFila`'s own docblock)**:
 * an EXISTING row (`patron` prop present) commits on blur-or-Enter, same as
 * before. A NOT-YET-CREATED row (`patron` prop absent) commits ONLY on an
 * explicit confirm (Enter, or picking `matchType` once `Patrón` already has
 * text) — `blur` never commits it, regardless of where focus goes next.
 * Several tests below were rewritten because they pinned the PREVIOUS
 * (defective) "blur creates a new row" mechanism — see each test's comment
 * for what changed and why.
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

  it('escribir texto y Tab hacia el botón eliminar SÍ commitea el PATCH en una fila EXISTENTE (judgment-day CRITICAL, redesign PR #4: Tab no es un clic — perder la edición sin avisar era el hallazgo de la ronda 2)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    await user.type(screen.getByLabelText('Patrón'), '-plus');
    await user.tab();

    expect(
      screen.getByRole('button', { name: /eliminar patrón/i }),
    ).toHaveFocus();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patron: 'netflix-plus', matchType: 'CONTAINS' }),
    });
  });

  it('escribir texto y hacer CLIC en eliminar en una fila EXISTENTE NO dispara un PATCH antes del DELETE — solo el DELETE (el clic no debe commitear una edición que el usuario está a punto de descartar junto con la fila)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    await user.type(screen.getByLabelText('Patrón'), '-plus');
    await user.click(screen.getByRole('button', { name: /eliminar patrón/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'DELETE',
    });
  });

  it('limpiar el texto de un patrón EXISTENTE a vacío y perder el foco revierte la vista al último valor comprometido, en vez de quedar vacío para siempre divergido del servidor (redesign, judgment-day PR #4)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Patrón')).toHaveValue('netflix');
  });

  it('cuando el prop patron cambia (refetch en background) SIN edición local pendiente, Patrón y Tipo de coincidencia se resincronizan a la verdad del servidor (redesign, judgment-day PR #4, causa estructural #1)', () => {
    const { rerender } = render(
      <PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />,
      { wrapper: crearWrapper() },
    );

    expect(screen.getByLabelText('Patrón')).toHaveValue('netflix');

    rerender(
      <PatronFila
        categoriaId="cat-1"
        patron={{ ...PATRON, patron: 'disney', matchType: 'STARTS_WITH' }}
        esDemo={false}
      />,
    );

    expect(screen.getByLabelText('Patrón')).toHaveValue('disney');
    expect(screen.getByLabelText('Tipo de coincidencia')).toHaveValue(
      'STARTS_WITH',
    );
  });

  it('si el usuario tiene una edición local SIN GUARDAR, un refetch en background NO la sobrescribe', () => {
    const { rerender } = render(
      <PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />,
      { wrapper: crearWrapper() },
    );

    fireEvent.change(screen.getByLabelText('Patrón'), {
      target: { value: 'en-progreso' },
    });

    rerender(
      <PatronFila
        categoriaId="cat-1"
        patron={{ ...PATRON, patron: 'disney' }}
        esDemo={false}
      />,
    );

    expect(screen.getByLabelText('Patrón')).toHaveValue('en-progreso');
  });

  it('un Enter SIN cambios (dirty-check no-op) no deja el flag de restaurar foco pegado en true: una edición real commiteada por blur DESPUÉS no roba el foco (judgment-day round 3 CRITICAL: el flag solo se limpiaba en el useEffect y en alCambiarMatchType, nunca en los early-return de commit())', async () => {
    // Deferred promise (not `mockResolvedValue`) — the mutation MUST stay
    // observably in-flight (`accionesBloqueadas` true across a render) so
    // the focus-restoration `useEffect` gets a genuine false→true→false
    // transition to react to; an already-resolved mock can collapse both
    // transitions into a single render and never exercise the effect.
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

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón') as HTMLInputElement;
    const focoSpy = vi.spyOn(input, 'focus');

    // Enter with NO edit — the dirty check in `commit()` bails BEFORE any
    // `fetch` call, so `accionesBloqueadas` never even starts cycling for
    // this press.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fetchMock).not.toHaveBeenCalled();

    // A later, real edit committed via ordinary blur — NOT Enter — DOES
    // start a mutation this time.
    fireEvent.change(input, { target: { value: 'spotify' } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(input).toBeDisabled();
    expect(focoSpy).not.toHaveBeenCalled();

    resolverFetch({ ok: true, status: 200 });

    // The fields re-enable once the blur-triggered PATCH resolves — the
    // focus-restoration effect must NOT fire, because this commit was
    // never Enter-driven.
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(focoSpy).not.toHaveBeenCalled();
  });

  it('cambiar Tipo de coincidencia mientras Patrón está vacío en una fila EXISTENTE revierte AMBOS campos al último valor comprometido, no solo el texto — y un blur posterior con el par revertido no dispara un PATCH fantasma (judgment-day round 3 CRITICAL: la guarda de valor vacío solo revertía `valor`, dejando `matchType` avanzado sin confirmar)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: '' } });

    const select = screen.getByLabelText('Tipo de coincidencia');
    fireEvent.change(select, { target: { value: 'REGEX' } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Patrón')).toHaveValue('netflix');
    expect(screen.getByLabelText('Tipo de coincidencia')).toHaveValue(
      'CONTAINS',
    );

    // The dirty-check baseline must ALSO be back to the confirmed pair —
    // otherwise the next blur sees an unchanged `valor` but a changed
    // `matchType` and fires a PATCH sending the OLD text under the NEW
    // match type, a pair the user never confirmed together.
    fireEvent.blur(input);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mousedown en Eliminar SIN que un clic real lo siga (arrastre fuera del target de 24×24) recupera y commitea la edición que el blur había dejado pendiente, en vez de perderla en silencio (judgment-day round 3 WARNING: clicEliminarEnCursoRef se limpiaba en el blur asumiendo que un clic real vendría después)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón');
    const boton = screen.getByRole('button', { name: /eliminar patrón/i });

    fireEvent.change(input, { target: { value: 'spotify' } });
    fireEvent.mouseDown(boton);
    fireEvent.blur(input);

    // The blur alone must not commit yet — a genuine click might still
    // land right after and discard the row, making the commit pointless.
    expect(fetchMock).not.toHaveBeenCalled();

    // No `click` ever follows (the pointer released elsewhere) — the
    // recovery must fire once the gesture is known to have ended.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patron: 'spotify', matchType: 'CONTAINS' }),
    });
  });

  it('un Enter que dispara un PATCH llama a input.focus() una vez que el input se re-habilita (redesign, judgment-day PR #4, causa estructural #4: un navegador real pierde el foco al deshabilitar un control enfocado; jsdom no reproduce ese auto-blur de forma confiable, así que este test verifica el fix real — la llamada a `.focus()` guiada por el ref — en vez de `document.activeElement`)', async () => {
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

    render(<PatronFila categoriaId="cat-1" patron={PATRON} esDemo={false} />, {
      wrapper: crearWrapper(),
    });

    const input = screen.getByLabelText('Patrón') as HTMLInputElement;
    const focoSpy = vi.spyOn(input, 'focus');
    fireEvent.change(input, { target: { value: 'spotify' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(input).toBeDisabled();
    expect(focoSpy).not.toHaveBeenCalled();

    resolverFetch({ ok: true, status: 200 });

    await waitFor(() => expect(input).not.toBeDisabled());
    await waitFor(() => expect(focoSpy).toHaveBeenCalledTimes(1));
  });
});

describe('PatronFila — fila nueva (sin patrón todavía creado)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('arranca vacía, y el primer commit EXPLÍCITO (Enter) dispara POST /api/patrones con categoriaId y luego llama a onDescartar (redesign, judgment-day PR #4 — blur ya NO commitea una fila sin crear, ver el test siguiente)', async () => {
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
    fireEvent.keyDown(input, { key: 'Enter' });

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

  it('blur en una fila SIN crear (el foco se va a CUALQUIER lugar, no solo al botón eliminar) NO dispara POST — la creación exige un confirm explícito (redesign, judgment-day PR #4, reemplaza el mecanismo de la ronda 2 que ató la creación a un blur ambiguo)', async () => {
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

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'uber' } });
    fireEvent.blur(input);

    // No `waitFor` timeout to eat — synchronous assertion, then confirm
    // nothing shows up async either.
    expect(fetchMock).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDescartar).not.toHaveBeenCalled();
    // The typed text stays put — the user can still confirm it with Enter,
    // or discard the whole row with Eliminar.
    expect(screen.getByLabelText('Patrón')).toHaveValue('uber');
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

  it('un segundo commit disparado mientras el PRIMER POST está en vuelo (Enter, luego cambiar Tipo de coincidencia ANTES de que resuelva) NO dispara un segundo POST — regresión del hallazgo crítico de judgment-day (trigger actualizado a Enter: blur ya no crea, redesign PR #4)', async () => {
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
    fireEvent.keyDown(input, { key: 'Enter' });

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

  it('escribir texto y luego hacer CLIC en eliminar en una fila SIN crear NO commitea el patrón: cero POST, la fila se descarta de inmediato (redesign PR #4: blur NUNCA commitea una fila sin crear, así que ni siquiera hace falta distinguir el clic del botón — reemplaza el mecanismo `relatedTarget` de la ronda 2, que resolvía esto ad-hoc solo para ESTE caso)', async () => {
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

  it('escribir texto y luego Tab hacia el botón eliminar (sin clic) tampoco commitea en una fila SIN crear — blur nunca commitea una fila sin crear, independientemente de a dónde vaya el foco (contraste: en una fila EXISTENTE, Tab SÍ commitea — ver "PatronFila — fila existente")', async () => {
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

  it('eliminar mientras el POST de creación está en vuelo (disparado por un Enter AJENO al clic de eliminar) queda bloqueado hasta que resuelve, y la fila se descarta igual al resolver — escenario distinto de la race del clic, cubierto arriba (trigger actualizado a Enter: blur ya no crea, redesign PR #4)', async () => {
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
    // An explicit Enter confirm, UNRELATED to the delete button (blur alone
    // never creates a not-yet-created row any more — see the tests above).
    fireEvent.keyDown(input, { key: 'Enter' });

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
