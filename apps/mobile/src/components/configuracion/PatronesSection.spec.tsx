/**
 * PatronesSection.spec.tsx — US-044 PR7, T7.1 (RED → GREEN)
 *
 * Tests the PatronesSection component: existing rows ordered before new
 * placeholder rows; «Sin patrones: solo asignación manual.» always rendered
 * (judgment-anticipated class 3 — non-tautological: assert identical string in
 * both 0-patterns and 3-patterns renders); Agregar button appends a placeholder
 * row with zero requests; matchType chips use ETIQUETA_MATCH_TYPE labels.
 *
 * Cases:
 *   1. «Sin patrones: solo asignación manual.» renders when there are NO patterns
 *   2. «Sin patrones: solo asignación manual.» renders when there ARE patterns
 *      (non-tautological — same string, both cases)
 *   3. Existing pattern rows render with their patron text
 *   4. Existing rows render BEFORE new placeholder rows — ORDER pinning
 *      (judgment-anticipated class 2)
 *   5. Agregar button has accessible name "Agregar patrón"
 *   6. Pressing Agregar appends a new placeholder row (empty fields), zero requests
 *   7. matchType chips show ETIQUETA_MATCH_TYPE labels (CONTIENE/EMPIEZA CON/REGEX)
 *   8. MCTG-07 negative-4: pattern mutation (add) does NOT call
 *      solicitarRecargaResumen — asserted against the REAL resumen-refresh module
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import type { PatronDto } from '../../domain/catalogo.types';
import * as resumenRefresh from '../../api/resumen-refresh';

import { PatronesSection } from './PatronesSection';

// Mock categorias to avoid real fetch calls in unit scope
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

const samplePatrones: PatronDto[] = [
  {
    id: 'pat-1',
    categoriaId: 'cat-1',
    patron: 'LIDER',
    matchType: 'CONTAINS',
    prioridad: 100,
  },
  {
    id: 'pat-2',
    categoriaId: 'cat-1',
    patron: '^UBER',
    matchType: 'STARTS_WITH',
    prioridad: 100,
  },
];

describe('PatronesSection (US-044 PR7, T7.1)', () => {
  let spySolicitarRecarga: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrearPatron.mockResolvedValue({ ok: true, value: undefined });
    mockActualizarPatron.mockResolvedValue({ ok: true, value: undefined });
    mockEliminarPatron.mockResolvedValue({ ok: true, value: undefined });

    // Spy on the REAL resumen-refresh module (not mocked away) for non-tautological
    // assertions (judgment-anticipated class 5, MCTG-07 negative-4).
    spySolicitarRecarga = jest.spyOn(resumenRefresh, 'solicitarRecargaResumen');
  });

  afterEach(() => {
    spySolicitarRecarga.mockRestore();
  });

  it('renders «Sin patrones: solo asignación manual.» when there are NO patterns', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[]}
        onPatronesChange={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Sin patrones: solo asignación manual.'),
    ).toBeOnTheScreen();
  });

  it('renders «Sin patrones: solo asignación manual.» when there ARE patterns (non-tautological)', async () => {
    // Same string asserted in both branches — class 3 non-tautological requirement.
    // This note renders ALWAYS because it informs the user that unmatched
    // transactions fall back to manual assignment regardless of patterns present.
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={samplePatrones}
        onPatronesChange={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Sin patrones: solo asignación manual.'),
    ).toBeOnTheScreen();
  });

  it('renders existing pattern rows with their patron text', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={samplePatrones}
        onPatronesChange={jest.fn()}
      />,
    );

    expect(screen.getByDisplayValue('LIDER')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('^UBER')).toBeOnTheScreen();
  });

  it('renders existing rows BEFORE new placeholder rows — ORDER pinning', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={samplePatrones}
        onPatronesChange={jest.fn()}
      />,
    );

    // Press Agregar to add a new placeholder row
    const agregar = screen.getByRole('button', { name: 'Agregar patrón' });
    await act(async () => {
      fireEvent.press(agregar);
    });

    // All TextInputs: existing 'LIDER' and '^UBER', then new placeholder ''
    const textInputs = screen.getAllByTestId(/^patron-input-/);
    // The first two inputs have the existing pattern values, the last is empty
    expect(textInputs.length).toBe(3);
    expect(textInputs[0]).toHaveDisplayValue('LIDER');
    expect(textInputs[1]).toHaveDisplayValue('^UBER');
    expect(textInputs[2]).toHaveDisplayValue('');
  });

  it('Agregar button has accessible name "Agregar patrón"', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[]}
        onPatronesChange={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Agregar patrón' }),
    ).toBeOnTheScreen();
  });

  it('pressing Agregar appends a new placeholder row with zero requests', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[]}
        onPatronesChange={jest.fn()}
      />,
    );

    const agregar = screen.getByRole('button', { name: 'Agregar patrón' });
    await act(async () => {
      fireEvent.press(agregar);
    });

    // A new empty pattern input appears (placeholder row)
    expect(screen.getAllByTestId(/^patron-input-/)).toHaveLength(1);
    // Zero requests — no crearPatron/actualizarPatron/eliminarPatron called
    expect(mockCrearPatron).not.toHaveBeenCalled();
    expect(mockActualizarPatron).not.toHaveBeenCalled();
    expect(mockEliminarPatron).not.toHaveBeenCalled();
  });

  it('matchType chips show ETIQUETA_MATCH_TYPE labels (CONTIENE/EMPIEZA CON/REGEX)', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={samplePatrones}
        onPatronesChange={jest.fn()}
      />,
    );

    // ETIQUETA_MATCH_TYPE maps CONTAINS→CONTIENE, STARTS_WITH→EMPIEZA CON, REGEX→REGEX
    // Each pattern row shows its own matchType chip. Since we have 2 patterns,
    // we check that the label text appears for the first pattern row.
    expect(
      screen.getAllByRole('radio', { name: 'CONTIENE' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('radio', { name: 'EMPIEZA CON' }).length,
    ).toBeGreaterThan(0);
    // REGEX chip is always rendered in each row (3-chip set), so at least 2 instances
    expect(
      screen.getAllByRole('radio', { name: 'REGEX' }).length,
    ).toBeGreaterThan(0);
  });

  // Fix 3e: pressing Agregar twice produces two placeholder rows with DISTINCT
  // testIDs. Date.now() can collide within a millisecond; the monotonic counter
  // in PatronesSection.tsx guarantees nuevo-1 and nuevo-2 are always distinct.
  // Falsifiability: reverting to Date.now() can cause both rows to share a
  // testID under rapid presses, causing one of the assertions below to fail.
  it('pressing Agregar twice produces two placeholder rows with DISTINCT input and selector testIDs', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[]}
        onPatronesChange={jest.fn()}
      />,
    );

    const agregar = screen.getByRole('button', { name: 'Agregar patrón' });
    await act(async () => {
      fireEvent.press(agregar);
    });
    await act(async () => {
      fireEvent.press(agregar);
    });

    // Two distinct patron-input testIDs — counter guarantees nuevo-1 and nuevo-2
    expect(screen.getByTestId('patron-input-nuevo-1')).toBeOnTheScreen();
    expect(screen.getByTestId('patron-input-nuevo-2')).toBeOnTheScreen();

    // Two distinct matchtype-selector testIDs
    expect(screen.getByTestId('matchtype-selector-nuevo-1')).toBeOnTheScreen();
    expect(screen.getByTestId('matchtype-selector-nuevo-2')).toBeOnTheScreen();
  });

  // MCTG-07 negative-4 (section level): pressing Agregar is a UI-only action —
  // zero API calls AND zero solicitarRecargaResumen calls. No commit has happened.
  it('pressing Agregar appends a UI-only placeholder — zero API calls AND no solicitarRecargaResumen', async () => {
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[]}
        onPatronesChange={jest.fn()}
      />,
    );

    const agregar = screen.getByRole('button', { name: 'Agregar patrón' });
    await act(async () => {
      fireEvent.press(agregar);
    });

    // Adding a row is a UI-only action — zero API calls of any kind
    expect(mockCrearPatron).not.toHaveBeenCalled();
    expect(mockActualizarPatron).not.toHaveBeenCalled();
    expect(mockEliminarPatron).not.toHaveBeenCalled();
    // And no resumen refresh
    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });

  // MCTG-07 negative-4 (section level, defense-in-depth): committing a pattern
  // via Guardar patrón does NOT call solicitarRecargaResumen. The row-level pins
  // in PatronFila.spec cases 11-12 cover the same invariant at row scope; this
  // case pins it at section scope — both must hold.
  it('committing a new patron via Guardar patrón does NOT call solicitarRecargaResumen (MCTG-07, section level)', async () => {
    const mockOnPatronesChange = jest.fn();
    await render(
      <PatronesSection
        categoriaId="cat-1"
        patrones={[]}
        onPatronesChange={mockOnPatronesChange}
      />,
    );

    // Agregar a new row
    const agregar = screen.getByRole('button', { name: 'Agregar patrón' });
    await act(async () => {
      fireEvent.press(agregar);
    });

    // Type into the placeholder row
    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Texto del patrón'),
        'WALMART',
      );
    });

    // Commit via Guardar patrón
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockCrearPatron).toHaveBeenCalledTimes(1);
    });

    // Defense-in-depth: section scope confirms no resumen refresh after commit
    // Falsifiability: adding solicitarRecargaResumen() to the success path causes this to FAIL
    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });
});
