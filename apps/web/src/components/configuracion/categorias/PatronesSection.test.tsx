import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
