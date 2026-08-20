/**
 * NuevaCategoriaForm.spec.tsx — US-044 PR5c, T5c.1 (RED → GREEN)
 *
 * Tests (9 cases):
 *  1. Renders 'nombre' CampoTexto field
 *  2. Renders 'bucket' SelectorChips field with BUCKETS_ASIGNABLES options
 *  3. Submit disabled when nombre is empty (both fields otherwise valid)
 *  4. Submit disabled when no bucket selected
 *  5. Valid submit calls crearCategoria({nombre, bucket}) — spy via jest.mock,
 *     never a prop-identity probe (judgment-anticipated class 4)
 *  6. Success closes the form (calls onCreada callback)
 *  7. Success does NOT call solicitarRecargaResumen() — MCTG-07 negative-1,
 *     asserted against the REAL resumen-refresh module (judgment-anticipated class 5)
 *  8. Failure renders mensajeDeErrorCatalogo copy and keeps form open/retryable
 *  9. A second submit attempt after failure calls crearCategoria again (retryable)
 *
 * Note on act() usage: `act(async () => { ... })` is required to flush React 19
 * concurrent-mode state updates before the next fireEvent reads the committed
 * state from the new render's closure — same as PerfilPanel.spec.tsx:13-15.
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
// MCTG-07 negative-1: import the REAL module — never mock it away
import * as resumenRefresh from '../../api/resumen-refresh';
import { NuevaCategoriaForm } from './NuevaCategoriaForm';

// Mock crearCategoria spy — we assert call shapes and return values
jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearCategoria: jest.fn(),
}));

const mockCrearCategoria = categorias.crearCategoria as jest.MockedFunction<
  typeof categorias.crearCategoria
>;

// Track solicitarRecargaResumen without mocking — the REAL function is called,
// we just spy on it so we can assert it was NOT called (judgment-anticipated class 5)
const spySolicitarRecarga = jest.spyOn(
  resumenRefresh,
  'solicitarRecargaResumen',
);

/** Helper: fill form fields and flush state updates via act before submitting. */
async function llenarYEnviar(opts: { nombre?: string; bucket?: string }) {
  await act(async () => {
    if (opts.nombre !== undefined) {
      fireEvent.changeText(screen.getByLabelText('Nombre'), opts.nombre);
    }
    if (opts.bucket !== undefined) {
      fireEvent.press(screen.getByRole('radio', { name: opts.bucket }));
    }
  });
  fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
}

describe('NuevaCategoriaForm (US-044 PR5c, T5c.1/T5c.2)', () => {
  const mockOnCreada = jest.fn();
  const mockOnCancelar = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrearCategoria.mockResolvedValue({ ok: true, value: undefined });
  });

  it('renders the nombre CampoTexto field', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
  });

  it('renders the bucket SelectorChips with Necesidades / Deseos / Ahorro options', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    // SelectorChips renders a radiogroup with one radio per bucket
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
    ]);
  });

  it('submit is no-op when nombre is empty (bucket selected)', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    // Select a bucket but leave nombre empty
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Necesidades' }));
    });

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockCrearCategoria).not.toHaveBeenCalled();
  });

  it('submit is no-op when no bucket is selected (nombre filled)', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    // Type a nombre but leave bucket unset
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nombre'), 'Supermercado');
    });

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockCrearCategoria).not.toHaveBeenCalled();
  });

  it('valid submit calls crearCategoria({nombre, bucket})', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Supermercado', bucket: 'Necesidades' });

    await waitFor(() => {
      expect(mockCrearCategoria).toHaveBeenCalledTimes(1);
      expect(mockCrearCategoria).toHaveBeenCalledWith({
        nombre: 'Supermercado',
        bucket: 'Necesidades',
      });
    });
  });

  it('success calls onCreada (closes the form)', async () => {
    mockCrearCategoria.mockResolvedValueOnce({ ok: true, value: undefined });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Streaming', bucket: 'Deseos' });

    await waitFor(() => {
      expect(mockOnCreada).toHaveBeenCalledTimes(1);
    });
  });

  it('success does NOT call solicitarRecargaResumen() — MCTG-07 negative-1', async () => {
    mockCrearCategoria.mockResolvedValueOnce({ ok: true, value: undefined });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'AFP', bucket: 'Ahorro' });

    await waitFor(() => {
      expect(mockOnCreada).toHaveBeenCalledTimes(1);
    });
    // The REAL solicitarRecargaResumen must NOT have been invoked
    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });

  it('failure renders mensajeDeErrorCatalogo copy and keeps the form open', async () => {
    mockCrearCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 409, code: 'NOMBRE_DUPLICADO' },
    });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Netflix', bucket: 'Deseos' });

    await waitFor(() => {
      // mensajes-catalogo.ts COPY.NOMBRE_DUPLICADO
      expect(
        screen.getByText('Ya tienes una categoría con ese nombre.'),
      ).toBeOnTheScreen();
    });

    // Form stays open — nombre field still present
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    // onCreada was NOT called
    expect(mockOnCreada).not.toHaveBeenCalled();
  });

  it('retryable: a second submit after failure calls crearCategoria again', async () => {
    // First attempt fails
    mockCrearCategoria
      .mockResolvedValueOnce({
        ok: false,
        error: { tag: 'http', status: 409, code: 'NOMBRE_DUPLICADO' },
      })
      // Second attempt succeeds
      .mockResolvedValueOnce({ ok: true, value: undefined });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Luz', bucket: 'Necesidades' });

    // Wait for first error to appear
    await waitFor(() => {
      expect(
        screen.getByText('Ya tienes una categoría con ese nombre.'),
      ).toBeOnTheScreen();
    });

    // Second submit — form is still open
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(mockCrearCategoria).toHaveBeenCalledTimes(2);
      expect(mockOnCreada).toHaveBeenCalledTimes(1);
    });
  });
});
