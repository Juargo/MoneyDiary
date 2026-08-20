/**
 * EditarCategoria.spec.tsx — US-044 PR6b, T6b.3 (extended from PR6a T6a.3)
 *
 * PR6a scope (tests 1–12): identity form + footer. Bucket-dirty Guardar was
 * a stub (early-return); Eliminar called eliminarCategoria directly.
 *
 * PR6b scope (tests 13–23): both Alert.alert confirmation flows wired.
 *   - bucket-dirty + Guardar → Alert.alert with impact fraseDeImpacto payload;
 *     cancel → zero requests; confirm → actualizarCategoria + solicitarRecargaResumen
 *   - Eliminar → Alert.alert with delete fraseDeImpacto payload;
 *     cancel → zero requests; confirm → eliminarCategoria (no solicitarRecargaResumen)
 *   - post-confirm failures render in the screen's own role="alert" region (R5)
 *
 * JD fix round (2026-08-20): draft-name bug fix (fix 1), double-Alert guard (fix 2),
 * both-dirty test (fix 3), cancel-clears-guard tests (fix 4), double-tap guard tests
 * (fix 5), verbatim body pins (fix 6), MCTG-07 positive waitFor (fix 7), button
 * order assertions (fix 8).
 *
 * Alert.alert assertions: jest.spyOn(Alert, 'alert') captures the arguments;
 * button callbacks are invoked directly from the captured buttons[] array to
 * drive both the confirm and cancel branches.
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
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
  let spyAlert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActualizarCategoria.mockResolvedValue({ ok: true, value: undefined });
    mockEliminarCategoria.mockResolvedValue({ ok: true, value: undefined });

    // Spy on the REAL resumen-refresh module (not mocked away) so assertions
    // are non-tautological (judgment-anticipated class 5).
    spySolicitarRecarga = jest.spyOn(resumenRefresh, 'solicitarRecargaResumen');

    // Spy on Alert.alert — captures title, message, buttons[] for assertion.
    // Does NOT mock it away; calls through to the captured spy.
    spyAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    spySolicitarRecarga.mockRestore();
    spyAlert.mockRestore();
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

    // Fix 9: success path calls onGuardado exactly once
    await waitFor(() => {
      expect(mockOnGuardado).toHaveBeenCalledTimes(1);
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

  // T7.5 integration case: pattern commits are independent of categoría's Guardar,
  // and Cancelar discards only the identity draft — MCTG-03's own scenario.
  it('T7.5: PatronesSection renders and pattern rows commit independently of categoría Guardar', async () => {
    const categoriaConPatrones: CategoriaDto = {
      ...sampleCategoria,
      patrones: [
        {
          id: 'pat-1',
          categoriaId: 'cat-1',
          patron: 'LIDER',
          matchType: 'CONTAINS',
          prioridad: 100,
        },
      ],
    };

    await render(
      <EditarCategoria
        categoria={categoriaConPatrones}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // PatronesSection renders the existing pattern row — PR7 real component
    expect(screen.getByDisplayValue('LIDER')).toBeOnTheScreen();

    // «Sin patrones: solo asignación manual.» always renders (MCTG-04)
    expect(
      screen.getByText('Sin patrones: solo asignación manual.'),
    ).toBeOnTheScreen();

    // Pressing Cancelar does NOT call actualizarCategoria — discards only the identity draft
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    });
    expect(mockActualizarCategoria).not.toHaveBeenCalled();
    expect(mockOnCancelar).toHaveBeenCalledTimes(1);
  });

  // Fix 7: Guardar failure renders the alert region with the exact mensajes-catalogo literal
  it('Guardar failure renders the error alert with the exact error message', async () => {
    mockActualizarCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 500 },
    });

    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    // accessibilityRole="alert" + the exact GENERICO string from mensajes-catalogo.ts
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ocurrió un error inesperado. Intenta nuevamente.',
      );
    });

    // onGuardado was NOT called on failure
    expect(mockOnGuardado).not.toHaveBeenCalled();
  });

  // Fix 8: Eliminar failure renders the alert region with the exact mensajes-catalogo literal.
  // PR6b update: Eliminar now goes through Alert.alert confirmation — this test
  // flows through the confirm button to reach the delete call.
  it('Eliminar failure renders the error alert with the exact error message', async () => {
    mockEliminarCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 500 },
    });

    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // PR6b: Eliminar opens Alert — must confirm before the delete fires
    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    // accessibilityRole="alert" + the exact GENERICO string from mensajes-catalogo.ts
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ocurrió un error inesperado. Intenta nuevamente.',
      );
    });

    // onEliminado was NOT called on failure
    expect(mockOnEliminado).not.toHaveBeenCalled();
  });

  // Fix 10a: double-submit on Guardar — label shows "Guardando…" in-flight,
  // second press does not produce a second call.
  it('Guardar is disabled and shows "Guardando…" while in-flight; second press is a no-op', async () => {
    let resolveFirst!: (v: { ok: boolean; value: undefined }) => void;
    const deferred = new Promise<{ ok: true; value: undefined }>((res) => {
      resolveFirst = res as (v: { ok: boolean; value: undefined }) => void;
    });
    mockActualizarCategoria.mockReturnValueOnce(deferred);

    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    // While in-flight: label shows "Guardando…" and accessibilityState.disabled is true
    // Falsifiability: removing operacion state or the "Guardando…" label causes this to fail.
    await waitFor(() => {
      const guardarBtn = screen.getByRole('button', { name: 'Guardar' });
      expect(guardarBtn.props.accessibilityState).toMatchObject({
        disabled: true,
      });
      expect(screen.getByText('Guardando…')).toBeOnTheScreen();
    });

    // Second press while in-flight — must be a no-op (enviando guard)
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    // Resolve and assert exactly 1 call
    await act(async () => {
      resolveFirst({ ok: true, value: undefined });
    });

    await waitFor(() => {
      expect(mockActualizarCategoria).toHaveBeenCalledTimes(1);
    });
  });

  // Fix 10b: Eliminar label shows "Eliminando…" while its own call is in-flight.
  // PR6b update: Eliminar now goes through Alert.alert — must confirm before
  // the deferred call starts.
  it('Eliminar is disabled and shows "Eliminando…" while in-flight', async () => {
    let resolveFirst!: (v: { ok: boolean; value: undefined }) => void;
    const deferred = new Promise<{ ok: true; value: undefined }>((res) => {
      resolveFirst = res as (v: { ok: boolean; value: undefined }) => void;
    });
    mockEliminarCategoria.mockReturnValueOnce(deferred);

    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // PR6b: press Eliminar → Alert opens, then confirm
    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    // While in-flight: label shows "Eliminando…" and accessibilityState.disabled is true
    // Falsifiability: removing operacion === 'eliminar' check causes this to fail.
    await waitFor(() => {
      const eliminarBtn = screen.getByRole('button', {
        name: 'Eliminar categoría',
      });
      expect(eliminarBtn.props.accessibilityState).toMatchObject({
        disabled: true,
      });
      expect(screen.getByText('Eliminando…')).toBeOnTheScreen();
    });

    // Resolve and confirm exactly 1 call
    await act(async () => {
      resolveFirst({ ok: true, value: undefined });
    });

    await waitFor(() => {
      expect(mockEliminarCategoria).toHaveBeenCalledTimes(1);
    });
  });

  // ── PR6b: bucket-change Alert.alert flow ────────────────────────────────

  it('bucket-dirty + Guardar opens Alert.alert with exact impact title/body BEFORE any PATCH (MCTG-03)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // Change bucket (Necesidades → Deseos)
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Deseos' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    // Alert.alert was called — NO patch before confirmation
    expect(spyAlert).toHaveBeenCalledTimes(1);
    expect(mockActualizarCategoria).not.toHaveBeenCalled();

    // Verify the title and joined-body lines (fraseDeImpacto 'cambiar-bucket')
    const [title, message] = spyAlert.mock.calls[0] as [
      string,
      string,
      ...unknown[],
    ];
    expect(title).toBe('Cambiar el bucket');
    // Fix 6: exact verbatim body (frozen copy — do NOT compute from fraseDeImpacto)
    expect(message).toBe(
      '«Supermercado» pasa de Necesidades a Gustos.\nEsto mueve 5 transacciones en TODOS los períodos, incluidos los meses ya cerrados.\nTu resumen 50/30/20 va a cambiar para esos meses.',
    );

    // Fix 8: cancel is first (index 0), destructive confirm is second (index 1)
    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].style).toBe('destructive');

    // cancelable:false — Android backdrop/back dismiss fires no callback and
    // would leave mostrandoAlerta.current stuck true (dead buttons).
    expect(spyAlert.mock.calls[0][3]).toEqual({ cancelable: false });
  });

  it('bucket-dirty + Guardar Alert: cancel button does NOT send the PATCH', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Deseos' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    expect(spyAlert).toHaveBeenCalledTimes(1);

    // Invoke the cancel button callback from the captured buttons array
    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    expect(cancelBtn).toBeDefined();

    // Fix 4: cancel now has onPress to clear the guard — invoke it and assert
    // (a) zero API calls and (b) guard cleared (a subsequent Guardar press
    // opens a NEW Alert).
    cancelBtn?.onPress?.();

    expect(mockActualizarCategoria).not.toHaveBeenCalled();
    expect(spySolicitarRecarga).not.toHaveBeenCalled();

    // Guard is cleared — a subsequent Guardar press opens a new Alert
    spyAlert.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(spyAlert).toHaveBeenCalledTimes(1);
  });

  it('bucket-dirty + Guardar Alert: confirm button sends PATCH + solicitarRecargaResumen (MCTG-07 positive)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Deseos' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    expect(spyAlert).toHaveBeenCalledTimes(1);

    // Invoke the destructive confirm button
    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn?.text).toBe('Cambiar bucket');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    await waitFor(() => {
      expect(mockActualizarCategoria).toHaveBeenCalledTimes(1);
      expect(mockActualizarCategoria).toHaveBeenCalledWith('cat-1', {
        nombre: 'Supermercado',
        bucket: 'Deseos',
      });
    });

    // Fix 7: MCTG-07 positive assert moved inside waitFor
    // Falsifiability: removing solicitarRecargaResumen() from the confirm success
    // path causes this assertion to FAIL.
    await waitFor(() => {
      expect(spySolicitarRecarga).toHaveBeenCalledTimes(1);
    });
  });

  // ── PR6b: delete Alert.alert flow ────────────────────────────────────────

  it('Eliminar opens Alert.alert with exact delete title/body sourced from loaded transaccionesCount (MCTG-05)', async () => {
    // sampleCategoria has transaccionesCount: 5
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    expect(spyAlert).toHaveBeenCalledTimes(1);
    expect(mockEliminarCategoria).not.toHaveBeenCalled();

    const [title, message] = spyAlert.mock.calls[0] as [
      string,
      string,
      ...unknown[],
    ];
    expect(title).toBe('Eliminar categoría');
    // Fix 6: exact verbatim body for count=5 (frozen copy — do NOT compute from fraseDeImpacto)
    expect(message).toBe(
      'Vas a eliminar «Supermercado».\n5 transacciones quedan en Sin categoría, en todos los períodos.\nEsta acción no se puede deshacer.',
    );

    // Fix 8: cancel is first (index 0), destructive confirm is second (index 1)
    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].style).toBe('destructive');

    // cancelable:false — Android backdrop/back dismiss fires no callback and
    // would leave mostrandoAlerta.current stuck true (dead buttons).
    expect(spyAlert.mock.calls[0][3]).toEqual({ cancelable: false });
  });

  it('zero-transaction Eliminar still opens confirm (softened wording, never skips)', async () => {
    const categoriaZero: CategoriaDto = {
      ...sampleCategoria,
      transaccionesCount: 0,
    };

    await render(
      <EditarCategoria
        categoria={categoriaZero}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    // Confirmation is NEVER skipped — Alert.alert fires even for zero transactions
    expect(spyAlert).toHaveBeenCalledTimes(1);
    const [, message] = spyAlert.mock.calls[0] as [
      string,
      string,
      ...unknown[],
    ];
    // Fix 6: exact verbatim body for count=0 (frozen copy)
    expect(message).toBe(
      'Vas a eliminar «Supermercado».\nNo tiene transacciones asociadas.\nEsta acción no se puede deshacer.',
    );
  });

  it('Eliminar Alert: cancel button issues zero requests', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    expect(cancelBtn).toBeDefined();

    // Fix 4: cancel now has onPress to clear the guard — invoke it and assert
    // (a) zero API calls and (b) guard cleared (a subsequent Eliminar press
    // opens a NEW Alert).
    cancelBtn?.onPress?.();

    expect(mockEliminarCategoria).not.toHaveBeenCalled();

    // Guard is cleared — a subsequent Eliminar press opens a new Alert
    spyAlert.mockClear();
    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });
    expect(spyAlert).toHaveBeenCalledTimes(1);
  });

  it('Eliminar Alert: confirm button calls eliminarCategoria (MCTG-05)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn?.text).toBe('Eliminar');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    await waitFor(() => {
      expect(mockEliminarCategoria).toHaveBeenCalledTimes(1);
      expect(mockEliminarCategoria).toHaveBeenCalledWith('cat-1');
    });
  });

  it('successful delete does NOT call solicitarRecargaResumen (MCTG-07 negative-3, D-11)', async () => {
    // Falsifiability: adding solicitarRecargaResumen() to the delete-confirm
    // success path causes this assertion to FAIL.
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    await waitFor(() => {
      expect(mockEliminarCategoria).toHaveBeenCalledTimes(1);
    });

    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });

  it('post-confirm bucket-change failure renders in the screen role="alert" region (R5, design §1.11)', async () => {
    mockActualizarCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 422, code: 'NOMBRE_INVALIDO' },
    });

    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Deseos' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    // Error renders in the screen's own alert region (not inside the dismissed Alert)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeOnTheScreen();
    });

    expect(mockOnGuardado).not.toHaveBeenCalled();

    // Guard cleared synchronously before the async mutation — a failed mutation
    // must never leave dead buttons. Pressing Guardar again fires a NEW Alert.
    // Falsifiability: moving the mostrandoAlerta.current = false into the async
    // callback (after the await) would leave the guard stuck true on failure,
    // and this assertion would fail (spyAlert still at 1 call, not 2).
    spyAlert.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(spyAlert).toHaveBeenCalledTimes(1);
  });

  it('post-confirm delete failure renders in the screen role="alert" region (R5, design §1.11)', async () => {
    mockEliminarCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 409 },
    });

    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeOnTheScreen();
    });

    expect(mockOnEliminado).not.toHaveBeenCalled();
  });

  // ── Fix 3: both-dirty — edit nombre AND bucket, Alert names draft nombre ─

  it('both-dirty (rename + bucket change): Alert body references draft nombre, confirm PATCHes draft values (fix 1 pin)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // Edit nombre to a new draft value
    await act(async () => {
      fireEvent.changeText(
        screen.getByDisplayValue('Supermercado'),
        'Mercado Central',
      );
    });

    // Change bucket (Necesidades → Deseos) — now both are dirty
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Deseos' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    expect(spyAlert).toHaveBeenCalledTimes(1);

    const [title, message] = spyAlert.mock.calls[0] as [
      string,
      string,
      ...unknown[],
    ];
    // Alert title is fixed
    expect(title).toBe('Cambiar el bucket');
    // The Alert body MUST reference the draft name 'Mercado Central', not the
    // original DTO name 'Supermercado'. This pins fix 1: reverting to
    // categoria.nombre causes this assertion to FAIL.
    expect(message).toBe(
      '«Mercado Central» pasa de Necesidades a Gustos.\nEsto mueve 5 transacciones en TODOS los períodos, incluidos los meses ya cerrados.\nTu resumen 50/30/20 va a cambiar para esos meses.',
    );

    // Confirm and assert PATCH uses {nombre: 'Mercado Central', bucket: 'Deseos'}
    const buttons = spyAlert.mock.calls[0][2] as {
      text: string;
      style?: string;
      onPress?: () => void;
    }[];
    const confirmBtn = buttons.find((b) => b.style === 'destructive');

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    await waitFor(() => {
      expect(mockActualizarCategoria).toHaveBeenCalledTimes(1);
      expect(mockActualizarCategoria).toHaveBeenCalledWith('cat-1', {
        nombre: 'Mercado Central',
        bucket: 'Deseos',
      });
    });
  });

  // ── Fix 5: double-tap guard — rapid double press opens Alert exactly once ─

  it('double-tap guard: rapid double press on Guardar (bucket-dirty) opens Alert exactly once (fix 2 pin)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Deseos' }));
    });

    // Press Guardar twice rapidly (no await between the two presses)
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    });

    // Alert must have been called exactly once.
    // Falsifiability: removing the mostrandoAlerta guard causes spyAlert to be
    // called twice, failing this assertion.
    expect(spyAlert).toHaveBeenCalledTimes(1);
  });

  it('double-tap guard: rapid double press on Eliminar opens Alert exactly once (fix 2 pin)', async () => {
    await render(
      <EditarCategoria
        categoria={sampleCategoria}
        onGuardado={mockOnGuardado}
        onCancelar={mockOnCancelar}
        onEliminado={mockOnEliminado}
      />,
    );

    // Press Eliminar twice rapidly (no await between the two presses)
    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
      fireEvent.press(
        screen.getByRole('button', { name: 'Eliminar categoría' }),
      );
    });

    // Alert must have been called exactly once.
    // Falsifiability: removing the mostrandoAlerta guard causes spyAlert to be
    // called twice, failing this assertion.
    expect(spyAlert).toHaveBeenCalledTimes(1);
  });
});
