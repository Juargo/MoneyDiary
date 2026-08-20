/**
 * app/categoria/[id].spec.tsx — US-044 PR6a, T6a.1
 *
 * Tests the edit-route's fetch lifecycle and the 4 states from design §1.11:
 *   loading · error (+back link) · id absent (status, NOT role="alert") · loaded
 *
 * The route owns its OWN GET /api/categorias fetch and resolves by id (D-09).
 * «Volver a Categorías» renders and calls router.back() (D-03).
 *
 * Non-tautological absence: the loaded state renders 'Eliminar categoría'
 * (see EditarCategoria — PR6a's positive cross-reference for PR5b's absence
 * assertion, judgment-anticipated class 3).
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import type { ApiResult } from '../../src/domain/api-error';
import type { CatalogoDto } from '../../src/domain/catalogo.types';

import EditRouteCategoriaId from './[id]';

const mockBack = jest.fn();
const mockPush = jest.fn();

// The route reads useLocalSearchParams().id to resolve which category to show.
const mockUseLocalSearchParams = jest.fn<{ id?: string }, []>();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({
      back: mockBack,
      push: mockPush,
    }),
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    useFocusEffect: (callback: () => void) => {
      useEffect(() => {
        callback();
      }, [callback]);
    },
  };
});

const mockFetchCatalogo = jest.fn<Promise<ApiResult<CatalogoDto>>, []>();

// EditarCategoria calls actualizarCategoria and eliminarCategoria — mock them
// so T6a tests can assert the identity-form renders without mutation side effects.
const mockActualizarCategoria = jest.fn();
const mockEliminarCategoria = jest.fn();

jest.mock('../../src/api/categorias', () => {
  const actual = jest.requireActual('../../src/api/categorias');
  return {
    ...actual,
    fetchCatalogo: () => mockFetchCatalogo(),
    actualizarCategoria: (...args: unknown[]) =>
      mockActualizarCategoria(...args),
    eliminarCategoria: (...args: unknown[]) => mockEliminarCategoria(...args),
  };
});

// Sample catalog with one category the tests resolve by id
const sampleCatalogo: CatalogoDto = {
  categorias: [
    {
      id: 'cat-1',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 5,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('app/categoria/[id].tsx — US-044 PR6a (T6a.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ id: 'cat-1' });
    mockFetchCatalogo.mockResolvedValue({ ok: true, value: sampleCatalogo });
    // actualizarCategoria succeeds by default (for bucket-clean Guardar)
    mockActualizarCategoria.mockResolvedValue({ ok: true, value: undefined });
    mockEliminarCategoria.mockResolvedValue({ ok: true, value: undefined });
  });

  it('renders «Volver a Categorías» back control (D-03)', async () => {
    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Volver a Categorías' }),
      ).toBeOnTheScreen();
    });
  });

  it('tapping «Volver a Categorías» calls router.back()', async () => {
    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Volver a Categorías' }),
      ).toBeOnTheScreen();
    });

    fireEvent.press(
      screen.getByRole('button', { name: 'Volver a Categorías' }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows loading state while fetchCatalogo is pending', async () => {
    const pendingCatalogo = deferred<ApiResult<CatalogoDto>>();
    mockFetchCatalogo.mockReturnValueOnce(pendingCatalogo.promise);

    await render(<EditRouteCategoriaId />);

    // Loading indicator visible immediately
    expect(screen.getByTestId('editar-loading')).toBeOnTheScreen();

    // Resolve to loaded — 'Supermercado' is in the Nombre TextInput's value
    pendingCatalogo.resolve({ ok: true, value: sampleCatalogo });
    await waitFor(() => {
      expect(screen.getByDisplayValue('Supermercado')).toBeOnTheScreen();
    });
  });

  it('shows error state (+back link) when fetchCatalogo fails', async () => {
    mockFetchCatalogo.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen();
    });

    // Back link still present in error state (design §1.11: +back link)
    expect(
      screen.getByRole('button', { name: 'Volver a Categorías' }),
    ).toBeOnTheScreen();
  });

  it('retries fetchCatalogo from error state', async () => {
    mockFetchCatalogo
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } })
      .mockResolvedValueOnce({ ok: true, value: sampleCatalogo });

    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    // After retry, 'Supermercado' is in the Nombre TextInput's displayValue
    await waitFor(() => {
      expect(screen.getByDisplayValue('Supermercado')).toBeOnTheScreen();
    });
  });

  it('renders «Esa categoría ya no existe.» when id param is undefined (design §1.11)', async () => {
    // useLocalSearchParams returns no id — e.g. a deep link with no param
    mockUseLocalSearchParams.mockReturnValue({ id: undefined });

    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(screen.getByText('Esa categoría ya no existe.')).toBeOnTheScreen();
    });

    // Must NOT be a role="alert" — a missing id param is a malformed link, not
    // a failure of the action just taken (design §1.11's own distinction).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders «Esa categoría ya no existe.» as a status when id is absent from catalog (design §1.11)', async () => {
    // catalog loaded but this id does not exist
    mockUseLocalSearchParams.mockReturnValue({ id: 'id-inexistente' });

    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(screen.getByText('Esa categoría ya no existe.')).toBeOnTheScreen();
    });

    // MUST be rendered as a status element (not role="alert")
    // The "id absent" state is a stale deep link, not a failure of the
    // action the user just took (design §1.11's own distinction).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the loaded state with EditarCategoria when id resolves', async () => {
    await render(<EditRouteCategoriaId />);

    // EditarCategoria renders the category name in the Nombre TextInput
    await waitFor(() => {
      expect(screen.getByDisplayValue('Supermercado')).toBeOnTheScreen();
    });
  });

  it('renders «Editar categoría» heading in loaded state', async () => {
    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(screen.getByText('Editar categoría')).toBeOnTheScreen();
    });
  });

  it('renders «Eliminar categoría» control in loaded state (non-tautological: absent on list, present here — D-12 / judgment-anticipated class 3)', async () => {
    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      ).toBeOnTheScreen();
    });
  });

  it('renders «Cancelar» control in loaded state', async () => {
    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Cancelar' }),
      ).toBeOnTheScreen();
    });
  });

  it('tapping «Cancelar» navigates back (WCTG-04 shipped fix)', async () => {
    await render(<EditRouteCategoriaId />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Cancelar' }),
      ).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('renders SelectorChips for Bucket field (EditarCategoria renders it in loaded state)', async () => {
    await render(<EditRouteCategoriaId />);

    // Wait for loaded state via the Nombre TextInput, then check SelectorChips.
    // SelectorChips's radiogroup View does not have accessible={true}, so
    // we assert via testID (the established pattern in SelectorChips.spec.tsx).
    await waitFor(() => {
      expect(screen.getByDisplayValue('Supermercado')).toBeOnTheScreen();
    });

    // EditarCategoria passes testID="bucket-selector" to SelectorChips
    const bucketGroup = screen.getByTestId('bucket-selector');
    expect(bucketGroup).toHaveProp('accessibilityRole', 'radiogroup');
  });

  it('route uses its OWN fetchCatalogo — does not share cache (D-09)', async () => {
    await render(<EditRouteCategoriaId />);

    // Wait for loaded state
    await waitFor(() => {
      expect(screen.getByDisplayValue('Supermercado')).toBeOnTheScreen();
    });

    // The route itself called fetchCatalogo exactly once on mount
    expect(mockFetchCatalogo).toHaveBeenCalledTimes(1);
  });
});
