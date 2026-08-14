import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PatronDto } from '@/api/types';
import { PatronesSection } from './PatronesSection';

/**
 * PatronesSection.test.tsx (US-043 PR #4, design.md §1/Q9a/Q9b, WCTG-06) —
 * the pattern-row list, `Agregar patrón`, and the always-rendered
 * `sin patrones` note (decision 9 — helper text, not a conditional
 * zero-state).
 *
 * **Redesign (judgment-day, 2026-08-14)**: a not-yet-created row's first
 * commit is now an explicit confirm (Enter), never `blur` — see
 * `PatronFila.test.tsx`'s docblock for the full account.
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

const PATRON_1: PatronDto = {
  id: 'pat-1',
  categoriaId: 'cat-1',
  patron: 'netflix',
  matchType: 'CONTAINS',
  prioridad: 100,
};
const PATRON_2: PatronDto = {
  id: 'pat-2',
  categoriaId: 'cat-1',
  patron: 'spotify',
  matchType: 'STARTS_WITH',
  prioridad: 100,
};

describe('PatronesSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('WCTG-06 — la nota "sin patrones" se renderiza bajo CERO patrones', () => {
    render(
      <PatronesSection categoriaId="cat-1" patrones={[]} esDemo={false} />,
      { wrapper: crearWrapper() },
    );

    expect(
      screen.getByText(
        'Sin patrones, la categoría solo se puede asignar manualmente.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByLabelText('Patrón')).toHaveLength(0);
  });

  it('WCTG-06 — la MISMA nota se renderiza también bajo VARIOS patrones (no es un zero-state)', () => {
    render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[PATRON_1, PATRON_2]}
        esDemo={false}
      />,
      { wrapper: crearWrapper() },
    );

    expect(
      screen.getByText(
        'Sin patrones, la categoría solo se puede asignar manualmente.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Patrón')).toHaveLength(2);
  });

  it('renderiza una PatronFila por cada patrón, con su valor precargado', () => {
    render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[PATRON_1, PATRON_2]}
        esDemo={false}
      />,
      { wrapper: crearWrapper() },
    );

    const inputs = screen.getAllByLabelText('Patrón');
    expect(inputs.map((i) => (i as HTMLInputElement).value)).toEqual([
      'netflix',
      'spotify',
    ]);
  });

  it('Agregar patrón agrega una fila nueva y vacía al final de la lista', async () => {
    const user = userEvent.setup();
    render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[PATRON_1]}
        esDemo={false}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Agregar patrón' }));

    const inputs = screen.getAllByLabelText('Patrón');
    expect(inputs).toHaveLength(2);
    expect((inputs[1] as HTMLInputElement).value).toBe('');
  });

  it('sesión demo: Agregar patrón queda deshabilitado', () => {
    render(<PatronesSection categoriaId="cat-1" patrones={[]} esDemo />, {
      wrapper: crearWrapper(),
    });

    expect(
      screen.getByRole('button', { name: 'Agregar patrón' }),
    ).toBeDisabled();
  });

  it('expone un role="status" aria-live, vacío al montar, FUERA de la lista de filas (judgment-day round 2 WARNING)', () => {
    render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[PATRON_1]}
        esDemo={false}
      />,
      { wrapper: crearWrapper() },
    );

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('anuncia "Patrón guardado." cuando el PATCH de una fila existente resuelve con éxito (mecanismo 2)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[PATRON_1]}
        esDemo={false}
      />,
      { wrapper: crearWrapper() },
    );

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'hulu' } });
    fireEvent.blur(input);

    expect(await screen.findByText('Patrón guardado.')).toBeInTheDocument();
  });

  it('anuncia "Patrón guardado." al crear una fila nueva, y el anuncio SOBREVIVE a que la fila se descarte del DOM (regresión del bug de unmount-antes-de-anunciar)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatronesSection categoriaId="cat-1" patrones={[]} esDemo={false} />,
      {
        wrapper: crearWrapper(),
      },
    );

    await user.click(screen.getByRole('button', { name: 'Agregar patrón' }));

    const input = screen.getByLabelText('Patrón');
    fireEvent.change(input, { target: { value: 'uber' } });
    // A not-yet-created row's first commit requires an EXPLICIT confirm
    // (Enter) — `blur` alone never commits it (PatronFila's judgment-day
    // redesign, PR #4, 2026-08-14).
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.queryAllByLabelText('Patrón')).toHaveLength(0),
    );
    expect(screen.getByText('Patrón guardado.')).toBeInTheDocument();
  });

  it('dos éxitos consecutivos con el MISMO mensaje ("Patrón guardado." dos veces) reemplazan el nodo de texto del live region en vez de dejarlo intacto — asegura que un lector de pantalla vuelva a anunciar el segundo (judgment-day redesign, PR #4, 2026-08-14)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[PATRON_1, PATRON_2]}
        esDemo={false}
      />,
      { wrapper: crearWrapper() },
    );

    const [inputUno, inputDos] = screen.getAllByLabelText('Patrón');

    fireEvent.change(inputUno, { target: { value: 'hulu' } });
    fireEvent.blur(inputUno);
    await screen.findByText('Patrón guardado.');

    const nodoTrasElPrimero = screen.getByRole('status').firstChild;

    fireEvent.change(inputDos, { target: { value: 'disney' } });
    fireEvent.blur(inputDos);

    // Same exact text both times — if React bailed on an identical
    // `setState`, the inner text node would never be replaced.
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Patrón guardado.');
      expect(screen.getByRole('status').firstChild).not.toBe(nodoTrasElPrimero);
    });
  });

  it('anuncia "Patrón eliminado." cuando el DELETE de una fila existente resuelve con éxito', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[PATRON_1]}
        esDemo={false}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /eliminar patrón/i }));

    expect(await screen.findByText('Patrón eliminado.')).toBeInTheDocument();
  });
});
