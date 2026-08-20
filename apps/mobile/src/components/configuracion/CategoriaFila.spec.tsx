/**
 * CategoriaFila.spec.tsx — US-044 PR5b, T5b.1 (RED → GREEN)
 *
 * Tests for the categoría list row component:
 *   - renders name + etiquetaPatrones tag
 *   - navigates to /categoria/{id} on tap via router.push
 *   - NO delete control (D-12): deletion lives on the edit screen
 *   - accessible name includes the category name
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CategoriaFila } from './CategoriaFila';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

const sampleCategoria = {
  id: 'cat-abc',
  nombre: 'Supermercado',
  bucket: 'Necesidades',
  patrones: [
    {
      id: 'pat-1',
      categoriaId: 'cat-abc',
      patron: 'LIDER',
      matchType: 'CONTAINS',
      prioridad: 1,
    },
  ],
  transaccionesCount: 12,
};

const categoriaConPatrones = {
  id: 'cat-bcd',
  nombre: 'Netflix',
  bucket: 'Deseos',
  patrones: [
    {
      id: 'pat-2',
      categoriaId: 'cat-bcd',
      patron: 'NETFLIX',
      matchType: 'STARTS_WITH',
      prioridad: 1,
    },
    {
      id: 'pat-3',
      categoriaId: 'cat-bcd',
      patron: 'NFLX',
      matchType: 'CONTAINS',
      prioridad: 2,
    },
  ],
  transaccionesCount: 3,
};

const categoriasSinPatrones = {
  id: 'cat-cde',
  nombre: 'Ahorro manual',
  bucket: 'Ahorro',
  patrones: [],
  transaccionesCount: 0,
};

describe('CategoriaFila (US-044 PR5b, T5b.1/T5b.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the category name', async () => {
    await render(<CategoriaFila categoria={sampleCategoria} />);
    expect(screen.getByText('Supermercado')).toBeOnTheScreen();
  });

  it('renders etiquetaPatrones(1) → "1 patrón"', async () => {
    await render(<CategoriaFila categoria={sampleCategoria} />);
    expect(screen.getByText('1 patrón')).toBeOnTheScreen();
  });

  it('renders etiquetaPatrones(2) → "2 patrones"', async () => {
    await render(<CategoriaFila categoria={categoriaConPatrones} />);
    expect(screen.getByText('2 patrones')).toBeOnTheScreen();
  });

  it('renders etiquetaPatrones(0) → "sin patrones"', async () => {
    await render(<CategoriaFila categoria={categoriasSinPatrones} />);
    expect(screen.getByText('sin patrones')).toBeOnTheScreen();
  });

  it('calls router.push with /categoria/{id} when tapped (not a prop-identity probe)', async () => {
    await render(<CategoriaFila categoria={sampleCategoria} />);

    fireEvent.press(screen.getByRole('button', { name: 'Supermercado' }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/categoria/cat-abc');
  });

  it('has NO "Eliminar" control on the row — deletion lives on the edit screen (D-12)', async () => {
    await render(<CategoriaFila categoria={sampleCategoria} />);

    // Non-tautological: absence is real — paired with PR6a's positive "Eliminar categoría" present case
    expect(screen.queryByText('Eliminar')).toBeNull();
    expect(screen.queryByText('Eliminar categoría')).toBeNull();
  });
});
