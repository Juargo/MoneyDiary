/**
 * EditarCategoria.spec.tsx — US-044 PR6a, T6a.3
 *
 * Tests for the identity form + footer (confirms stubbed to PR6b).
 * Scope:
 *   - identity draft (nombre, bucket) seeds from the resolved row
 *   - Nombre field edits stay local until Guardar
 *   - «Eliminar categoría» IS present — non-tautological cross-ref with
 *     PR5b's "absent on the list" assertion (D-12, judgment-anticipated class 3)
 *   - bucket clean + Guardar → actualizarCategoria({nombre, bucket}) sent directly,
 *     no confirmation (the bucket-dirty branch is PR6b's Alert flow)
 *   - Cancelar discards the identity draft and navigates back (WCTG-04)
 *   - rename-only save does NOT call solicitarRecargaResumen() —
 *     MCTG-07's negative-2 (judgment-anticipated class 5), against REAL module
 *
 * Two SelectorChips are rendered (Bucket, and PatronesSection's matchType in PR7).
 * ONLY the Bucket chip is rendered by EditarCategoria itself in PR6a — so a single
 * distinct testID ('bucket-selector') is passed per the binding constraint that
 * every SelectorChips instance gets an explicit testID.
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import type { CategoriaDto } from '../../domain/catalogo.types';
import * as resumenRefresh from '../../api/resumen-refresh';

import { EditarCategoria } from './EditarCategoria';

// Mock actualizarCategoria and eliminarCategoria — test call shapes via spies
const mockActualizarCategoria = jest.fn();
const mockEliminarCategoria = jest.fn();

jest.mock('../../api/categorias', () => {
  const actual = jest.requireActual('../../api/categorias');
  return {
    ...actual,
    actualizarCategoria: (...args: unknown[]) =>
      mockActualizarCategoria(...args),
    eliminarCategoria: (...args: unknown[]) => mockEliminarCategoria(...args),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
  }),
}));

const sampleCategoria: CategoriaDto = {
  id: 'cat-1',
  nombre: 'Supermercado',
  bucket: 'Necesidades',
  patrones: [],
  transaccionesCount: 5,
};

describe('EditarCategoria (US-044 PR6a, T6a.3)', () => {
  const mockOnGuardado = jest.fn();
  const mockOnCancelar = jest.fn();
  const mockOnEliminado = jest.fn();

  let spySolicitarRecarga: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActualizarCategoria.mockResolvedValue({ ok: true, value: undefined });
    mockEliminarCategoria.mockResolvedValue({ ok: true, value: undefined });

    // Spy on the REAL resumen-refresh module (not mocked away) so assertions
    // are non-tautological (judgment-anticipated class 5).
    spySolicitarRecarga = jest.spyOn(resumenRefresh, 'solicitarRecargaResumen');
  });

  afterEach(() => {
    spySolicitarRecarga.mockRestore();
  });

  it('seeds identity draft from the resolved categoria row', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // Nombre field shows the category's current name
    expect(screen.getByDisplayValue('Supermercado')).toBeOnTheScreen();

    // Bucket chip 'Necesidades' is selected (accessibilityState.checked)
    expect(
      screen.getByRole('radio', { name: 'Necesidades' }),
    ).toBeOnTheScreen();
  });

  it('Nombre field edits stay local until Guardar is pressed', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.changeText(
        screen.getByDisplayValue('Supermercado'),
        'Supermercado Lider',
      );
    });

    // Value in the field changed locally
    expect(screen.getByDisplayValue('Supermercado Lider')).toBeOnTheScreen();

    // actualizarCategoria NOT called yet
    expect(mockActualizarCategoria).not.toHaveBeenCalled();
  });

  it('«Eliminar categoría» is present (non-tautological: absent on the list, present here — D-12, class 3)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Eliminar categoría' }),
    ).toBeOnTheScreen();
  });

  it('bucket clean + Guardar calls actualizarCategoria with exact payload, no confirmation', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // bucket clean (same as initial 'Necesidades'), rename only
    await act(async () => {
      fireEvent.changeText(
        screen.getByDisplayValue('Supermercado'),
        'Supermercado Lider',
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    await waitFor(() => {
      expect(mockActualizarCategoria).toHaveBeenCalledTimes(1);
      expect(mockActualizarCategoria).toHaveBeenCalledWith('cat-1', {
        nombre: 'Supermercado Lider',
        bucket: 'Necesidades',
      });
    });
  });

  it('rename-only save does NOT call solicitarRecargaResumen() (MCTG-07 negative-2)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // Rename only — bucket stays 'Necesidades' (clean)
    await act(async () => {
      fireEvent.changeText(
        screen.getByDisplayValue('Supermercado'),
        'Supermercado Lider',
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    await waitFor(() => {
      expect(mockActualizarCategoria).toHaveBeenCalledTimes(1);
    });

    // This is MCTG-07 negative-2: a rename-only PATCH never fires the dashboard refresh.
    // Falsifiability: adding solicitarRecargaResumen() to the rename-only path
    // causes this assertion to FAIL.
    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });

  it('Cancelar discards draft and calls onCancelar (WCTG-04 shipped fix)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // Change name
    await act(async () => {
      fireEvent.changeText(
        screen.getByDisplayValue('Supermercado'),
        'Supermercado Lider',
      );
    });

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    // onCancelar was called (which navigates back in the route)
    expect(mockOnCancelar).toHaveBeenCalledTimes(1);
    // actualizarCategoria was NOT called
    expect(mockActualizarCategoria).not.toHaveBeenCalled();
  });

  it('renders Bucket selector as a radiogroup with the BUCKETS_ASIGNABLES options', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // SelectorChips's radiogroup View does not have accessible={true} so
    // getByRole cannot match by name — assert via testID (established pattern).
    const bucketSelector = screen.getByTestId('bucket-selector');
    expect(bucketSelector).toHaveProp('accessibilityRole', 'radiogroup');

    // All 3 bucket options are rendered as radio chips
    expect(
      screen.getByRole('radio', { name: 'Necesidades' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Deseos' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Ahorro' })).toBeOnTheScreen();
  });

  it('renders PatronesSection placeholder (PatronesSection real component ships PR7)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // PatronesSection is stubbed in PR6a — assert the placeholder testID
    expect(screen.getByTestId('patrones-placeholder')).toBeOnTheScreen();
  });
});
