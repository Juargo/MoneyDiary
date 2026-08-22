import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilaRevision } from './FilaRevision';
import type { CatalogoEstado } from '@/api/types';
import { unaFilaPreview, unCatalogo } from '@/test-utils/preview-fixtures';

// FilaRevision (US-059 PR2, D-06/D-10/D-12) — presentational row component.
// Tests verify: cell rendering (fecha, descripcion, cargo, abono via
// formatearMontoCLP), duplicate greying + badge + disabled selects, bucket→
// categoría cascade (D-06), accessible labels (D-10), and onEditChange payloads.
//
// NO network, NO state machine — pure presentational unit.

// --- Fixtures (local extensions on top of shared ones) ---

const catalogoListo = unCatalogo({
  grupos: [
    {
      bucket: 'Necesidades',
      categorias: [
        {
          id: 'cat-nec-1',
          nombre: 'Supermercado',
          bucket: 'Necesidades',
          patrones: [],
          transaccionesCount: 0,
        },
        {
          id: 'cat-nec-2',
          nombre: 'Salud',
          bucket: 'Necesidades',
          patrones: [],
          transaccionesCount: 0,
        },
      ],
    },
    {
      bucket: 'Deseos',
      categorias: [
        {
          id: 'cat-des-1',
          nombre: 'Restaurantes',
          bucket: 'Deseos',
          patrones: [],
          transaccionesCount: 0,
        },
      ],
    },
  ],
});

const catalogoCargando: CatalogoEstado = { tag: 'cargando' };
const catalogoError: CatalogoEstado = { tag: 'error' };

// --- Tests ---

describe('FilaRevision', () => {
  // Cell rendering
  it('renders fecha (sliced to YYYY-MM-DD), descripcion, formatted cargo and abono', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    expect(screen.getByText('2026-07-15')).toBeInTheDocument();
    expect(screen.getByText('Supermercado Líder')).toBeInTheDocument();
    // formatearMontoCLP('50000') → '$50.000'
    expect(screen.getByText('$50.000')).toBeInTheDocument();
    // formatearMontoCLP('0') → '$0'
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  // Duplicate row: greyed + badge + both selects disabled (D-10, product decision 1)
  it('duplicate row: renders "Duplicado" badge and both selects are disabled', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2, esDuplicado: true })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Duplicado')).toBeInTheDocument();

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    expect(bucketSelect).toBeDisabled();
    expect(categoriaSelect).toBeDisabled();
  });

  // Duplicate row has no data-duplicado attribute (fix 9)
  it('duplicate row does not carry data-duplicado attribute', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2, esDuplicado: true })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const badge = screen.getByText('Duplicado');
    // Walk up to find the li — should have no data-duplicado attr
    const li = badge.closest('li');
    expect(li).not.toHaveAttribute('data-duplicado');
  });

  // Non-duplicate row: selects are enabled (D-10)
  it('non-duplicate row with loaded catalog: both selects are enabled', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2, esDuplicado: false })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Duplicado')).not.toBeInTheDocument();
    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    expect(bucketSelect).not.toBeDisabled();
  });

  // Accessible labels per D-10 — "Fila {rowIndex+1}: bucket" and "Fila {rowIndex+1}: categoría"
  it('each select is reachable by the compound per-row label (D-10)', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 4 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Fila 5: bucket/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fila 5: categoría/i)).toBeInTheDocument();
  });

  // Cascade: selecting "Deseos" as bucket shows only Deseos categories (D-06)
  it('selecting a bucket filters categoría options to that bucket group', async () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Deseos');

    // After selecting "Deseos", categoría select should only show Deseos categorías
    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    const options = Array.from(
      (categoriaSelect as HTMLSelectElement).options,
    ).map((o) => o.text);

    expect(options).toContain('Restaurantes');
    expect(options).not.toContain('Supermercado');
    expect(options).not.toContain('Salud');
  });

  // Fix 1a: first-time bucket selection fires NO onEditChange (sparse-overlay)
  it('fix 1a: first-time bucket selection fires no onEditChange (categoriaId was null)', async () => {
    const onEditChange = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Necesidades');

    expect(onEditChange).toHaveBeenCalledTimes(0);
  });

  // Fix 1b: selecting a categoría fires onEditChange exactly once with the id
  it('fix 1b: selecting a categoría fires onEditChange(rowIndex, categoriaId) exactly once', async () => {
    const onEditChange = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    // First select a bucket to enable categoría select
    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Necesidades');

    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-nec-1');

    expect(onEditChange).toHaveBeenCalledTimes(1);
    expect(onEditChange).toHaveBeenCalledWith(2, 'cat-nec-1');
  });

  // Fix 1c: changing bucket AFTER a categoría was chosen fires onEditChange(rowIndex, null)
  it('fix 1c: changing bucket after a categoría was chosen fires onEditChange(rowIndex, null)', async () => {
    const onEditChange = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        // categoriaId is non-null: simulates a pre-assigned categoría
        categoriaId={'cat-nec-1'}
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    // Mount already has categoriaId — changing bucket should fire onEditChange(2, null)
    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Deseos');

    expect(onEditChange).toHaveBeenCalledTimes(1);
    expect(onEditChange).toHaveBeenCalledWith(2, null);
  });

  // onEditChange: selecting a categoría fires onEditChange(rowIndex, cat.id)
  it('selecting a categoría fires onEditChange(rowIndex, categoriaId)', async () => {
    const onEditChange = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    // First select a bucket to enable categoría select
    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Necesidades');

    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-nec-1');

    expect(onEditChange).toHaveBeenCalledWith(2, 'cat-nec-1');
  });

  // onEditChange: selecting the "Sin categoría" sentinel fires onEditChange(rowIndex, null)
  it('selecting the "Sin categoría" sentinel fires onEditChange(rowIndex, null)', async () => {
    const onEditChange = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    // Select a bucket first, then a category, then reset to "Sin categoría"
    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Necesidades');

    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-nec-1');
    // Now select the sentinel (value="")
    await userEvent.selectOptions(categoriaSelect, '');

    expect(onEditChange).toHaveBeenLastCalledWith(2, null);
  });

  // Changing bucket resets categoría to the sentinel (D-06).
  // The bucket change only fires onEditChange when the categoriaId PROP is non-null
  // (fix 1c). Here we mount with categoriaId='cat-nec-1' to simulate a pre-assigned row.
  it('changing bucket resets categoría select to the sentinel (no stale categoría)', async () => {
    const onEditChange = vi.fn();

    // Mount with a pre-assigned categoriaId so that a bucket change fires onEditChange(2, null)
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={'cat-nec-1'}
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    // categoriaId prop is 'cat-nec-1' → bucketUI seeds to 'Necesidades' (fix 2)
    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    expect((bucketSelect as HTMLSelectElement).value).toBe('Necesidades');

    // Changing bucket fires onEditChange(2, null) because categoriaId is non-null
    await userEvent.selectOptions(bucketSelect, 'Deseos');

    // The categoría select should now show the sentinel value (empty)
    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    expect((categoriaSelect as HTMLSelectElement).value).toBe('');
    // onEditChange called once with null (un-assigning the prior choice)
    expect(onEditChange).toHaveBeenCalledTimes(1);
    expect(onEditChange).toHaveBeenLastCalledWith(2, null);
  });

  // Priority 2: bucketUI seeds from sugerido.bucket when no edited categoriaId (categoriaId=null)
  it('seeds bucketUI from sugerido.bucket when it exists among catalog groups (no edited categoría — Priority 2)', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({
          rowIndex: 2,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        })}
        // categoriaId=null → no user edit; sugerido.bucket is the seed (Priority 2)
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    expect((bucketSelect as HTMLSelectElement).value).toBe('Necesidades');
  });

  // Fix 2: bucketUI seeds from edited categoriaId when it conflicts with sugerido.bucket
  it('fix 2: bucketUI seeds from edited categoriaId bucket when it differs from sugerido.bucket', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({
          rowIndex: 2,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        })}
        // edited categoriaId is from Deseos, overrides sugerido bucket
        categoriaId={'cat-des-1'}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    // Should show Deseos (from edited categoriaId) not Necesidades (from sugerido)
    expect((bucketSelect as HTMLSelectElement).value).toBe('Deseos');

    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    expect((categoriaSelect as HTMLSelectElement).value).toBe('cat-des-1');
  });

  // Controlled-flow tripwire: documents the PR3 contract.
  // The parent MUST be controlled (re-render on edit) for un-assignment to work —
  // PR3's SubirCartola wiring satisfies this.
  it('controlled-flow tripwire: bucket change after categoría was set (via controlled parent) fires onEditChange(rowIndex, null)', async () => {
    // Stateful wrapper that feeds categoriaId back as a controlled prop,
    // mirroring how SubirCartola's edits Map drives FilaRevision in PR3.
    const onEditChange = vi.fn();

    function Controlled() {
      const [editedId, setEditedId] = React.useState<string | null>(null);
      function handleEditChange(rowIndex: number, catId: string | null) {
        setEditedId(catId);
        onEditChange(rowIndex, catId);
      }
      return (
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2 })}
          categoriaId={editedId}
          catalogo={catalogoListo}
          onEditChange={handleEditChange}
        />
      );
    }

    render(<Controlled />);

    // Step 1: select bucket — no call (categoriaId is null, fix 1a)
    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Necesidades');
    expect(onEditChange).not.toHaveBeenCalled();

    // Step 2: select categoría X — fires (2, 'cat-nec-1'); prop becomes non-null on re-render
    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-nec-1');
    expect(onEditChange).toHaveBeenCalledWith(2, 'cat-nec-1');

    // Step 3: change bucket again — categoriaId prop is now 'cat-nec-1' (non-null),
    // so the bucket change must fire onEditChange(2, null) to clear the prior choice
    await userEvent.selectOptions(bucketSelect, 'Deseos');
    expect(onEditChange).toHaveBeenCalledWith(2, null);
  });

  // When sugerido.bucket is NOT among groups, bucketUI starts empty, categoría disabled
  it('bucketUI starts empty when sugerido.bucket is not among catalog groups', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({
          rowIndex: 2,
          sugerido: { bucket: 'Ingreso', categoriaId: null },
        })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    expect((bucketSelect as HTMLSelectElement).value).toBe('');
  });

  // catalogo.tag === 'cargando' → selects disabled (no crash); issue 5
  it('catalogo.tag cargando: selects are disabled (no crash)', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoCargando}
        onEditChange={vi.fn()}
      />,
    );

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    expect(bucketSelect).toBeDisabled();
    expect(categoriaSelect).toBeDisabled();
  });

  // catalogo.tag === 'error' → selects absent or disabled (no crash)
  it('catalogo.tag error: selects are disabled (no crash)', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoError}
        onEditChange={vi.fn()}
      />,
    );

    // Should not crash; selects should be disabled or absent
    const bucketSelect = screen.queryByLabelText(/Fila 3: bucket/i);
    const categoriaSelect = screen.queryByLabelText(/Fila 3: categoría/i);
    if (bucketSelect) expect(bucketSelect).toBeDisabled();
    if (categoriaSelect) expect(categoriaSelect).toBeDisabled();
  });
});
