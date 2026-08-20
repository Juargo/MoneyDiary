/**
 * PatronFila.spec.tsx — US-044 PR7, T7.3 (RED → GREEN)
 *
 * Tests the 4-state row machine from design §1.12:
 *   limpio   — valor === comprometido (no confirm control visible)
 *   sucio    — dirty AND trimmed value ≠ '' (confirm control "Guardar patrón" visible)
 *   enviando — mutation in flight (fields + both controls disabled)
 *   error    — inline role="alert" under the row; row stays sucio/retryable
 *
 * Cases:
 *   1.  limpio: confirm control "Guardar patrón" is hidden when clean
 *   2.  sucio: editing patron → confirm control appears
 *   3.  new row (no id): confirm → crearPatron with exact payload (prioridad absent)
 *   4.  delete on new/uncommitted row → zero requests, no Alert (discard only)
 *   5.  existing row: confirm → actualizarPatron with exact payload (prioridad absent)
 *   6.  existing row: baseline advances only on success (failed patch stays retryable)
 *   7.  existing row: delete → eliminarPatron; Alert.alert is NEVER called (class 3,
 *       non-tautological: paired with EditarCategoria's categoria delete that DOES call it)
 *   8.  enviando: fields + both controls disabled while mutation is in flight
 *   9.  error: inline role="alert" under the row after a failed mutation
 *   10. REGEX hint renders as advisory text, never blocks submission (D-12)
 *   11. MCTG-07 negative-4: add a patron — does NOT call solicitarRecargaResumen
 *   12. MCTG-07 negative-4: delete a patron — does NOT call solicitarRecargaResumen
 *   13. matchType SelectorChips: changing matchType chip updates the sent payload
 *   14. getOptionLabel: custom label prop renders ETIQUETA_MATCH_TYPE labels while
 *       onChange still emits the raw MatchType option value — binding obligation 1:
 *       getOptionLabel returns to SelectorChips here, WITH a behavior test.
 *
 * Binding obligations from task instructions:
 *   1. getOptionLabel re-added to SelectorChips WITH a behavior test (case 14)
 *   2. Each SelectorChips instance has a DISTINCT explicit testID
 *   3. prioridad is NEVER in any patron payload (asserted in call-shape tests)
 *   4. Pattern delete: no Alert.alert (case 7); DIFFERENT from categoria delete (class 3)
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
import type { PatronDto } from '../../domain/catalogo.types';
import * as resumenRefresh from '../../api/resumen-refresh';

import { PatronFila } from './PatronFila';

// Mock categorias mutations
const mockCrearPatron = jest.fn();
const mockActualizarPatron = jest.fn();
const mockEliminarPatron = jest.fn();

jest.mock('../../api/categorias', () => {
  const actual = jest.requireActual('../../api/categorias');
  return {
    ...actual,
    crearPatron: (...args: unknown[]) => mockCrearPatron(...args),
    actualizarPatron: (...args: unknown[]) => mockActualizarPatron(...args),
    eliminarPatron: (...args: unknown[]) => mockEliminarPatron(...args),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const existingPatron: PatronDto = {
  id: 'pat-1',
  categoriaId: 'cat-1',
  patron: 'LIDER',
  matchType: 'CONTAINS',
  prioridad: 100,
};

describe('PatronFila (US-044 PR7, T7.3)', () => {
  let spySolicitarRecarga: jest.SpyInstance;
  let spyAlert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrearPatron.mockResolvedValue({ ok: true, value: undefined });
    mockActualizarPatron.mockResolvedValue({ ok: true, value: undefined });
    mockEliminarPatron.mockResolvedValue({ ok: true, value: undefined });

    // Spy on REAL resumen-refresh (not mocked away) — class 5, MCTG-07 negative-4
    spySolicitarRecarga = jest.spyOn(resumenRefresh, 'solicitarRecargaResumen');

    // Spy on Alert.alert — pattern delete must NOT call it (class 3, non-tautological)
    spyAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    spySolicitarRecarga.mockRestore();
    spyAlert.mockRestore();
  });

  // ─── Case 1: limpio state ────────────────────────────────────────────────────

  it('limpio: confirm control is hidden when value equals the committed baseline', async () => {
    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    // "Guardar patrón" is the confirm control — hidden when clean
    expect(screen.queryByRole('button', { name: 'Guardar patrón' })).toBeNull();
  });

  // ─── Case 2: sucio state ─────────────────────────────────────────────────────

  it('sucio: editing patron text reveals the confirm control "Guardar patrón"', async () => {
    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('LIDER'), 'SUPER LIDER');
    });

    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeOnTheScreen();
  });

  // ─── Case 3: new row → crearPatron, prioridad absent ────────────────────────

  it('new row: confirm → crearPatron with exact payload (prioridad NEVER in payload)', async () => {
    await render(
      <PatronFila
        patron={null}
        rowId="nuevo-test"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    // Type a pattern value to enter sucio state
    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Texto del patrón'),
        'NUEVOLIDER',
      );
    });

    // Confirm
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockCrearPatron).toHaveBeenCalledTimes(1);
    });

    const payload = mockCrearPatron.mock.calls[0][0] as Record<string, unknown>;

    // Exact payload — prioridad is NOT present (binding decision 3)
    expect(payload).toEqual({
      categoriaId: 'cat-1',
      patron: 'NUEVOLIDER',
      matchType: 'CONTAINS', // default first chip
    });
    expect(payload).not.toHaveProperty('prioridad');
  });

  // ─── Case 4: delete on new/uncommitted row — zero requests ──────────────────

  it('delete on a new/uncommitted row = discard, zero requests', async () => {
    const mockOnEliminado = jest.fn();
    await render(
      <PatronFila
        patron={null}
        rowId="nuevo-test"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={mockOnEliminado}
      />,
    );

    // Delete button discards the row (no id, so no API call)
    const deleteBtn = screen.getByRole('button', { name: 'Eliminar patrón' });
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    // Zero API calls — structural guarantee (no id → no DELETE possible)
    expect(mockCrearPatron).not.toHaveBeenCalled();
    expect(mockActualizarPatron).not.toHaveBeenCalled();
    expect(mockEliminarPatron).not.toHaveBeenCalled();

    // The row notifies the parent so the placeholder is removed
    expect(mockOnEliminado).toHaveBeenCalledTimes(1);
  });

  // ─── Case 5: existing row → actualizarPatron, prioridad absent ──────────────

  it('existing row: confirm → actualizarPatron with exact payload (prioridad NEVER in payload)', async () => {
    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('LIDER'), 'LIDER SUPER');
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockActualizarPatron).toHaveBeenCalledTimes(1);
    });

    const [idArg, patchArg] = mockActualizarPatron.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    expect(idArg).toBe('pat-1');
    // Exact patch payload — prioridad is NOT present (binding decision 3)
    expect(patchArg).toEqual({
      patron: 'LIDER SUPER',
      matchType: 'CONTAINS',
    });
    expect(patchArg).not.toHaveProperty('prioridad');
  });

  // ─── Case 6: existing row — baseline advances only on success ───────────────

  it('existing row: failed patch stays sucio/retryable — baseline does not advance', async () => {
    // First call fails, second call succeeds
    mockActualizarPatron
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } })
      .mockResolvedValueOnce({ ok: true, value: undefined });

    const mockOnGuardado = jest.fn();
    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={mockOnGuardado}
        onEliminado={jest.fn()}
      />,
    );

    // Edit — enter sucio state
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('LIDER'), 'LIDER RETRY');
    });

    // First confirm — fails
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeOnTheScreen();
    });

    // Confirm control still visible (row stays sucio/retryable)
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeOnTheScreen();

    // Retry — second confirm succeeds
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockOnGuardado).toHaveBeenCalledTimes(1);
    });

    expect(mockActualizarPatron).toHaveBeenCalledTimes(2);
  });

  // ─── Case 7: delete on existing row — no Alert.alert (class 3) ──────────────

  it('delete on existing row → eliminarPatron; Alert.alert is NEVER called (class 3)', async () => {
    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    const deleteBtn = screen.getByRole('button', { name: 'Eliminar patrón' });
    await act(async () => {
      fireEvent.press(deleteBtn);
    });

    await waitFor(() => {
      expect(mockEliminarPatron).toHaveBeenCalledWith('pat-1');
    });

    // No confirmation dialog — a pattern touches no persisted transactions (design §1.12)
    expect(spyAlert).not.toHaveBeenCalled();
  });

  // ─── Case 8: enviando state — fields + controls disabled ────────────────────

  it('enviando: patron input + both controls are disabled while mutation is in-flight', async () => {
    // Use a deferred promise so the mutation stays in-flight
    let resolvePatron!: (v: { ok: true; value: undefined }) => void;
    mockActualizarPatron.mockReturnValueOnce(
      new Promise<{ ok: true; value: undefined }>((resolve) => {
        resolvePatron = resolve;
      }),
    );

    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    // Enter sucio state
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('LIDER'), 'LIDER PENDING');
    });

    // Press confirm — mutation starts, stays in-flight
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    // While in-flight: both controls disabled AND visible text shows "Guardando…"
    // Convention (PR6a): accessibilityLabel stays fixed ("Guardar patrón") while
    // the visible Text child changes to "Guardando…" — the getByRole query still works.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Guardar patrón' }),
      ).toBeDisabled();
    });
    // In-flight label pin: visible text must show "Guardando…" during the mutation
    // Falsifiability: removing the {enviando ? 'Guardando…' : 'Guardar patrón'} text
    // expression from PatronFila.tsx causes this assertion to FAIL.
    expect(screen.getByText('Guardando…')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Eliminar patrón' }),
    ).toBeDisabled();

    // Resolve to clean up
    await act(async () => {
      resolvePatron({ ok: true, value: undefined });
    });
  });

  // ─── Case 9: error state — inline role="alert" ───────────────────────────────

  it('error: inline role="alert" renders under the row after a failed mutation', async () => {
    mockActualizarPatron.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('LIDER'), 'LIDER FAIL');
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeOnTheScreen();
    });

    // Row stays sucio (confirm still visible)
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeOnTheScreen();
  });

  // ─── Case 10: REGEX hint — advisory only, never a gate ──────────────────────

  it('REGEX hint renders as advisory text and does NOT block submission', async () => {
    await render(
      <PatronFila
        patron={null}
        rowId="nuevo-test"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    // Switch to REGEX matchType
    const regexChip = screen.getByRole('radio', { name: 'REGEX' });
    await act(async () => {
      fireEvent.press(regexChip);
    });

    // Type an invalid regex pattern
    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Texto del patrón'),
        '[invalid regex((',
      );
    });

    // Hint appears
    expect(
      screen.getByText('Esa expresión regular podría no ser válida.'),
    ).toBeOnTheScreen();

    // Confirm control is still enabled — hint never gates (D-12)
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).not.toBeDisabled();
  });

  // ─── Case 11: MCTG-07 negative-4 — add patron ───────────────────────────────

  it('adding a patron does NOT call solicitarRecargaResumen (MCTG-07 negative-4)', async () => {
    const mockOnGuardado = jest.fn();
    await render(
      <PatronFila
        patron={null}
        rowId="nuevo-test"
        categoriaId="cat-1"
        onGuardado={mockOnGuardado}
        onEliminado={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Texto del patrón'),
        'WALMART',
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockOnGuardado).toHaveBeenCalledTimes(1);
    });

    // Pattern mutations never trigger the resumen refresh (D-11)
    // Falsifiability: adding solicitarRecargaResumen() to the success path causes this to FAIL
    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });

  // ─── Case 12: MCTG-07 negative-4 — delete patron ────────────────────────────

  it('deleting a patron does NOT call solicitarRecargaResumen (MCTG-07 negative-4)', async () => {
    const mockOnEliminado = jest.fn();
    await render(
      <PatronFila
        patron={existingPatron}
        rowId="pat-1"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={mockOnEliminado}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Eliminar patrón' }));
    });

    await waitFor(() => {
      expect(mockOnEliminado).toHaveBeenCalledTimes(1);
    });

    // Pattern delete never touches bucketId (design §1.13), so no resumen refresh
    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });

  // ─── Case 13: matchType chip changes update the sent payload ─────────────────

  it('changing matchType chip to STARTS_WITH updates the crearPatron payload', async () => {
    await render(
      <PatronFila
        patron={null}
        rowId="nuevo-test"
        categoriaId="cat-1"
        onGuardado={jest.fn()}
        onEliminado={jest.fn()}
      />,
    );

    // Switch matchType chip — uses ETIQUETA_MATCH_TYPE label ('EMPIEZA CON')
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'EMPIEZA CON' }));
    });

    // Type a patron
    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Texto del patrón'),
        '^UBER',
      );
    });

    // Confirm
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockCrearPatron).toHaveBeenCalledTimes(1);
    });

    const callPayload = mockCrearPatron.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callPayload.matchType).toBe('STARTS_WITH');
    // The raw wire value is sent, not the label — onChange emits the option value
    expect(callPayload.patron).toBe('^UBER');
  });

  // ─── Case 14: getOptionLabel — binding obligation 1 ─────────────────────────
  //
  // getOptionLabel was removed from SelectorChips in PR2b-4a as YAGNI, with the
  // explicit note "PR7 re-adds it WITH a test" (binding obligation 1 from the
  // task instructions). This test pins that:
  //   a) the ETIQUETA_MATCH_TYPE label is what renders in the UI (visible text)
  //   b) onChange still emits the raw MatchType wire value, not the label

  it('getOptionLabel: ETIQUETA labels render in UI while onChange emits raw MatchType value', async () => {
    const mockOnGuardado = jest.fn();

    await render(
      <PatronFila
        patron={null}
        rowId="nuevo-test"
        categoriaId="cat-1"
        onGuardado={mockOnGuardado}
        onEliminado={jest.fn()}
      />,
    );

    // The chip labelled 'CONTIENE' (ETIQUETA_MATCH_TYPE['CONTAINS']) renders
    expect(screen.getByRole('radio', { name: 'CONTIENE' })).toBeOnTheScreen();
    // The raw wire value 'CONTAINS' is NOT what the label shows
    expect(screen.queryByRole('radio', { name: 'CONTAINS' })).toBeNull();

    // Pressing 'EMPIEZA CON' (label for STARTS_WITH) still sends 'STARTS_WITH'
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'EMPIEZA CON' }));
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Texto del patrón'),
        'TEST',
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockCrearPatron).toHaveBeenCalledTimes(1);
    });

    // onChange emits the raw option value (STARTS_WITH), not the label
    const [payload] = mockCrearPatron.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(payload.matchType).toBe('STARTS_WITH');
  });
});
