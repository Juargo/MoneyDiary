/**
 * AgregarCategoriaControl.spec.tsx — agregar-categoria-desde-bucket, issue
 * #743.
 *
 * Mirrors `NuevaCategoriaForm.spec.tsx`'s discipline: `crearCategoria` is
 * mocked at the module boundary (spy, never a prop-identity probe), the
 * REAL `NuevaCategoriaForm` renders underneath so `bucketFijo` wiring is
 * exercised end to end.
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import * as categorias from '../../api/categorias';
import { AgregarCategoriaControl } from './AgregarCategoriaControl';

jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearCategoria: jest.fn(),
}));

const mockCrearCategoria = categorias.crearCategoria as jest.MockedFunction<
  typeof categorias.crearCategoria
>;

describe('AgregarCategoriaControl (issue #743)', () => {
  const mockOnCreada = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrearCategoria.mockResolvedValue({
      ok: true,
      value: {
        id: 'cat-fake',
        nombre: 'Fake',
        bucket: 'Necesidades',
        transaccionesCount: 0,
        patrones: [],
      },
    });
  });

  it('renders a labelled "Agregar categoría" trigger and no form until pressed', async () => {
    await render(
      <AgregarCategoriaControl bucket="Deseos" onCreada={mockOnCreada} />,
    );

    expect(
      screen.getByRole('button', { name: 'Agregar categoría' }),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  it('pressing the trigger opens NuevaCategoriaForm with the bucket fixed (no bucket-selector chips)', async () => {
    await render(
      <AgregarCategoriaControl bucket="Deseos" onCreada={mockOnCreada} />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Agregar categoría' }),
      );
    });

    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    expect(screen.queryByTestId('bucket-selector')).toBeNull();
    expect(screen.getByText('Gustos')).toBeOnTheScreen();
  });

  it('creating a category submits the fixed bucket, closes the form, and calls onCreada', async () => {
    await render(
      <AgregarCategoriaControl bucket="Necesidades" onCreada={mockOnCreada} />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Agregar categoría' }),
      );
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nombre'), 'Supermercado');
    });
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(mockCrearCategoria).toHaveBeenCalledWith({
        nombre: 'Supermercado',
        bucket: 'Necesidades',
      });
      expect(mockOnCreada).toHaveBeenCalledTimes(1);
    });
    // The form closed on success.
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  it('Cancelar closes the form without calling onCreada or crearCategoria', async () => {
    await render(
      <AgregarCategoriaControl bucket="Deseos" onCreada={mockOnCreada} />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Agregar categoría' }),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    });

    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(mockCrearCategoria).not.toHaveBeenCalled();
    expect(mockOnCreada).not.toHaveBeenCalled();
  });

  it('a duplicate-name error renders inline and keeps the form open', async () => {
    mockCrearCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 409, code: 'NOMBRE_DUPLICADO' },
    });

    await render(
      <AgregarCategoriaControl bucket="Deseos" onCreada={mockOnCreada} />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Agregar categoría' }),
      );
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nombre'), 'Netflix');
    });
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ya tienes una categoría con ese nombre en ese bucket.',
      );
    });
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    expect(mockOnCreada).not.toHaveBeenCalled();
  });
});
