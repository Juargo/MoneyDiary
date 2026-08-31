import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilaRevision } from './FilaRevision';
import type { CatalogoEstado } from '@/api/types';
import { unaFilaPreview, unCatalogo } from '@/test-utils/preview-fixtures';

// FilaRevision (US-059 PR2, D-06/D-10/D-12) — presentational row component.
// Tests verify: cell rendering (fecha, descripcion, the signed non-zero
// amount via formatearMontoConSigno, formatearMontoCLP only for the
// both-zero `$0`), duplicate greying + badge + disabled bucket control,
// bucket→categoría cascade (D-06), accessible labels (D-10), and
// onEditChange payloads.
//
// 2026-08-30: the bucket `<select>` became `SelectorBucket` (a segmented
// control of native radios) and the categoría `CampoSelect` is no longer
// rendered at all while no bucket is chosen — tests migrated accordingly.
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
  it('renders fecha (sliced to YYYY-MM-DD), descripcion, and the signed non-zero amount', () => {
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
    // formatearMontoConSigno('50000', '-') → '-$50.000'; the zero abono is
    // suppressed entirely — only the non-zero amount renders (2026-08-31).
    expect(screen.getByText('-$50.000')).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  // Description: always shown in full, never truncated (2026-08-31 — the
  // description used to be `truncate` + `title` for overflow; both are gone
  // so the full text is always in the accessible DOM text, not hidden
  // behind a hover-only title.
  it('renders the full descripcion with no truncation and no title attribute', () => {
    const descripcionLarga =
      'Compra en supermercado con una descripción extremadamente larga que antes se habría truncado con puntos suspensivos y un atributo title';
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2, descripcion: descripcionLarga })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const descripcionEl = screen.getByText(descripcionLarga);
    expect(descripcionEl).toBeInTheDocument();
    expect(descripcionEl).not.toHaveAttribute('title');
    expect(descripcionEl.className).not.toMatch(/\btruncate\b/);
  });

  // Duplicate row: greyed + badge + bucket control disabled, no categoría select (D-10)
  it('duplicate row: renders "Duplicado" badge, bucket control disabled, no categoría select', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2, esDuplicado: true })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Duplicado')).toBeInTheDocument();

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(bucketGroup).toBeDisabled();
    expect(
      screen.queryByLabelText(/Fila 3: categoría/i),
    ).not.toBeInTheDocument();
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

  // Non-duplicate row: bucket control is enabled (D-10)
  it('non-duplicate row with loaded catalog: bucket control is enabled', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2, esDuplicado: false })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Duplicado')).not.toBeInTheDocument();
    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(bucketGroup).not.toBeDisabled();
  });

  // Accessible labels per D-10 — bucket control reachable immediately;
  // categoría control appears (and is reachable) once a bucket is chosen.
  it('bucket control reachable by label; categoría reachable by label once a bucket is chosen (D-10)', async () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 4 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 5: bucket/i);
    expect(bucketGroup).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Fila 5: categoría/i),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    );
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

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    );

    // After selecting "Deseos", categoría select should only show Deseos categorías
    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    const options = Array.from(
      (categoriaSelect as HTMLSelectElement).options,
    ).map((o) => o.text);

    expect(options).toContain('Restaurantes');
    expect(options).not.toContain('Supermercado');
    expect(options).not.toContain('Salud');
  });

  // Round-9 critique P1 fix 2: the selection checkbox's own visual glyph
  // stays size-4 (16px), but it must sit inside a ≥24×24 CSS px hit target
  // (WCAG 2.2 AA SC 2.5.8) — same mechanism as the pre-existing `size-6`
  // icon-button precedent (`CLASE_BOTON_ICONO`), applied here via a
  // wrapping `<label>` around the bare `<input>` (label-click toggles the
  // checkbox natively, growing the interactive area without resizing the
  // checkbox itself).
  it('round-9 P1 fix 2: the row selection checkbox sits in a size-6 (24×24) hit target while staying size-4 visually', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const checkbox = screen.getByLabelText(/Seleccionar fila 3/i);
    expect(checkbox.className).toContain('size-4');

    const hitTarget = checkbox.closest('label');
    expect(hitTarget).not.toBeNull();
    expect(hitTarget?.className).toContain('size-6');
  });

  // Round-9 critique P1 fix 1: bucket options must show the UI label
  // ("Gustos") while the underlying option value stays the domain key
  // ("Deseos") — ETIQUETA_BUCKET is applied at this call site now (inside
  // SelectorBucket).
  it('round-9 P1: bucket options show "Gustos" as label but keep "Deseos" as the value', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    const gustosRadio = within(bucketGroup).getByRole('radio', {
      name: 'Gustos',
    }) as HTMLInputElement;

    expect(gustosRadio.value).toBe('Deseos');
    expect(
      within(bucketGroup).queryByRole('radio', { name: 'Deseos' }),
    ).not.toBeInTheDocument();
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

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    );

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
    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    );

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
    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    );

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
    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    );

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
    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    );

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
    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    ).toBeChecked();

    // Changing bucket fires onEditChange(2, null) because categoriaId is non-null
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    );

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

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    ).toBeChecked();
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

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    // Should show Deseos (from edited categoriaId) not Necesidades (from sugerido)
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    ).toBeChecked();

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
    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    );
    expect(onEditChange).not.toHaveBeenCalled();

    // Step 2: select categoría X — fires (2, 'cat-nec-1'); prop becomes non-null on re-render
    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-nec-1');
    expect(onEditChange).toHaveBeenCalledWith(2, 'cat-nec-1');

    // Step 3: change bucket again — categoriaId prop is now 'cat-nec-1' (non-null),
    // so the bucket change must fire onEditChange(2, null) to clear the prior choice
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    );
    expect(onEditChange).toHaveBeenCalledWith(2, null);
  });

  // When sugerido.bucket is NOT among groups, bucketUI starts at the sentinel
  it('bucketUI starts at "Sin categoría" when sugerido.bucket is not among catalog groups', () => {
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

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Sin categoría' }),
    ).toBeChecked();
    expect(
      screen.queryByLabelText(/Fila 3: categoría/i),
    ).not.toBeInTheDocument();
  });

  // catalogo.tag === 'cargando' → bucket control disabled, no categoría (no crash); issue 5
  it('catalogo.tag cargando: bucket control disabled, no categoría select (no crash)', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoCargando}
        onEditChange={vi.fn()}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(bucketGroup).toBeDisabled();
    expect(
      screen.queryByLabelText(/Fila 3: categoría/i),
    ).not.toBeInTheDocument();
  });

  // Gotcha fix: after a bulk apply changes the categoriaId PROP on an already
  // -mounted row, bucketUI must stop reflecting the stale mount-time seed and
  // instead derive from the catalog group that owns the new categoriaId — the
  // categoría select's own value (bound straight to the `categoriaId` prop)
  // was never the bug; the bucket control was silently stuck.
  it('bulk-apply gotcha: an externally-changed categoriaId prop re-derives bucketUI (not stuck on stale local state)', () => {
    const { rerender } = render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    // Mount: no sugerido, no edit — bucketUI seeds empty, no categoría select.
    const bucketGroupInicial = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(bucketGroupInicial).getByRole('radio', { name: 'Sin categoría' }),
    ).toBeChecked();
    expect(
      screen.queryByLabelText(/Fila 3: categoría/i),
    ).not.toBeInTheDocument();

    // Simulate a bulk apply: SubirCartola's edits Map updates and this row's
    // categoriaId prop flips from null to 'cat-des-1' (Deseos) WITHOUT the
    // user ever touching this row's own bucket/categoría controls.
    rerender(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId="cat-des-1"
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    // Bucket control must now show "Gustos" checked — derived from the
    // catalog group that owns 'cat-des-1', not the stale mount-time '' value.
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    ).toBeChecked();

    // Categoría select is now rendered (bucket derived non-empty unlocks it)
    // and shows the applied value.
    const categoriaSelect = screen.getByLabelText(
      /Fila 3: categoría/i,
    ) as HTMLSelectElement;
    expect(categoriaSelect.value).toBe('cat-des-1');
    expect(categoriaSelect).not.toBeDisabled();
  });

  // Manual-flow semantics must survive the fix: when the categoriaId PROP does
  // NOT change between renders (no external/bulk update), a user's own bucket
  // pick still drives the cascade locally exactly as before.
  it('bulk-apply gotcha fix preserves manual cascade flow when categoriaId prop is stable', async () => {
    const onEditChange = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    );
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Gustos' }),
    ).toBeChecked();
    // No onEditChange yet — categoriaId prop was null (fix 1a semantics kept).
    expect(onEditChange).not.toHaveBeenCalled();

    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-des-1');
    expect(onEditChange).toHaveBeenCalledWith(2, 'cat-des-1');
  });

  // (a) No suggestion, no edit: default is "Sin categoría" checked, no categoría select.
  it('(a) no suggestion, no edit: "Sin categoría" is checked and no categoría select renders', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2, sugerido: null })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Sin categoría' }),
    ).toBeChecked();
    expect(
      screen.queryByLabelText(/Fila 3: categoría/i),
    ).not.toBeInTheDocument();
  });

  // (b) With a suggestion (and its merged display value passed as categoriaId,
  // per D-05): the suggested bucket is checked and the categoría select is
  // visible, showing the suggested categoría.
  it('(b) with a suggestion: SelectorBucket shows the suggested bucket checked and the categoría select shows the suggested categoría', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({
          rowIndex: 2,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        })}
        categoriaId="cat-nec-1"
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
    ).toBeChecked();

    const categoriaSelect = screen.getByLabelText(
      /Fila 3: categoría/i,
    ) as HTMLSelectElement;
    expect(categoriaSelect).toBeInTheDocument();
    expect(categoriaSelect.value).toBe('cat-nec-1');
  });

  // (c) After a categoría was set, choosing "Sin categoría" fires
  // onEditChange(rowIndex, null) and hides the categoría select.
  it('(c) clicking "Sin categoría" after a categoría was set fires onEditChange(rowIndex, null) and hides the categoría select', async () => {
    const onEditChange = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId="cat-nec-1"
        catalogo={catalogoListo}
        onEditChange={onEditChange}
      />,
    );

    const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
    expect(screen.getByLabelText(/Fila 3: categoría/i)).toBeInTheDocument();

    await userEvent.click(
      within(bucketGroup).getByRole('radio', { name: 'Sin categoría' }),
    );

    expect(onEditChange).toHaveBeenCalledWith(2, null);
    expect(
      screen.queryByLabelText(/Fila 3: categoría/i),
    ).not.toBeInTheDocument();
  });

  // ── Selection checkbox (feature: bulk apply) ────────────────────────────

  it('non-duplicate row exposes an accessible "Seleccionar fila N" checkbox', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 4 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
        selected={false}
        onToggleSelect={vi.fn()}
      />,
    );

    const checkbox = screen.getByLabelText(/Seleccionar fila 5/i);
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute('type', 'checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('checkbox reflects the `selected` prop', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 4 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
        selected
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Seleccionar fila 5/i)).toBeChecked();
  });

  it('clicking the checkbox calls onToggleSelect(rowIndex) exactly once', async () => {
    const onToggleSelect = vi.fn();

    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 4 })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
        selected={false}
        onToggleSelect={onToggleSelect}
      />,
    );

    await userEvent.click(screen.getByLabelText(/Seleccionar fila 5/i));

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(4);
  });

  it('duplicate rows never render a selection checkbox (D-10)', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 4, esDuplicado: true })}
        categoriaId={null}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
        selected={false}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(
      screen.queryByLabelText(/Seleccionar fila 5/i),
    ).not.toBeInTheDocument();
  });

  // catalogo.tag === 'error' → bucket control disabled, no categoría select (no crash)
  it('catalogo.tag error: bucket control disabled, no categoría select (no crash)', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({ rowIndex: 2 })}
        categoriaId={null}
        catalogo={catalogoError}
        onEditChange={vi.fn()}
      />,
    );

    // Should not crash; bucket control should be disabled
    const bucketGroup = screen.queryByLabelText(/Fila 3: bucket/i);
    expect(bucketGroup).not.toBeNull();
    if (bucketGroup) expect(bucketGroup).toBeDisabled();
    expect(
      screen.queryByLabelText(/Fila 3: categoría/i),
    ).not.toBeInTheDocument();
  });

  // T-18 / WEB-PRV-09 / WEB-PRV-10: structural a11y assertions for the review
  // table. vitest-axe is not installed in this repo, so we use Testing Library's
  // getByLabelText (which requires a proper <label>→<control> association) and
  // structural invariant checks instead of an automated axe scan.
  //
  // The eslint-plugin-jsx-a11y error-level block in eslint.config.js (T-17)
  // provides static analysis covering jsx-a11y rules. These structural tests
  // complete the coverage at runtime: if the label association breaks (e.g.
  // sr-only label stops wrapping the select, or the label/select pairing
  // changes), getByLabelText throws and the test fails.
  //
  // WEB-PRV-10: The cascade controls stack under row cells on narrow widths
  // via `flex-col sm:flex-row` (T1/T2 viewport requirement). The layout
  // class is verified structurally rather than via a JSDOM viewport
  // simulation.
  describe('T-18 a11y / WEB-PRV-09 structural assertions', () => {
    it('bucket control is reachable by accessible label (getByLabelText); categoría is absent until a bucket is chosen', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, esDuplicado: false })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      // getByLabelText throws if the element is missing or the label association is broken
      expect(screen.getByLabelText(/Fila 3: bucket/i)).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Fila 3: categoría/i),
      ).not.toBeInTheDocument();
    });

    it('duplicate bucket control is reachable by accessible label and is disabled; no categoría control', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, esDuplicado: true })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      expect(screen.getByLabelText(/Fila 3: bucket/i)).toBeDisabled();
      expect(
        screen.queryByLabelText(/Fila 3: categoría/i),
      ).not.toBeInTheDocument();
    });

    it('T-18 responsive: cascade controls container has flex-col stacking class (WEB-PRV-10 T1/T2)', () => {
      const { container } = render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, esDuplicado: false })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      // The cascade controls wrapper must have the responsive stacking class so
      // they reflow to vertical on narrow viewports (T1=768px, T2=1024px).
      // This is a structural check — not a visual/viewport simulation.
      const flexContainer = container.querySelector('.flex-col.sm\\:flex-row');
      expect(flexContainer).not.toBeNull();
    });

    // P2 design critique fix 1 — bare dropdowns with no visible column
    // identity once a value is chosen. Mobile strategy: a visible short
    // label ("Bucket"/"Categoría") renders per-row above each control; the
    // accessible name stays the full "Fila N: bucket/categoría" sentence
    // (WCAG 2.5.3 label-in-name — the visible word is a case-insensitive
    // substring of the full name).
    it('P2 fix 1: a visible short column label renders per control, and the full sentence remains the accessible name', async () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2 })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      // Visible short label for the bucket control is present immediately.
      expect(screen.getByText('Bucket')).toBeInTheDocument();
      const bucketGroup = screen.getByLabelText(/Fila 3: bucket/i);
      expect(bucketGroup).toHaveAccessibleName('Fila 3: bucket');

      // Categoría's visible label + accessible name appear once a bucket is chosen.
      await userEvent.click(
        within(bucketGroup).getByRole('radio', { name: 'Necesidades' }),
      );
      expect(screen.getByText('Categoría')).toBeInTheDocument();
      const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
      expect(categoriaSelect).toHaveAccessibleName('Fila 3: categoría');
    });

    it('P2 fix 1: the visible short label is hidden from sighted sm+ users (sm:sr-only) — the shared column header takes over', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2 })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      const visibleBucketLabel = screen.getByText('Bucket');
      expect(visibleBucketLabel.className).toMatch(/sm:sr-only/);
    });

    it('P2 fix 1: duplicate rows still carry the visible short column label alongside the disabled bucket control, and no categoría column label', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, esDuplicado: true })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Bucket')).toBeInTheDocument();
      expect(screen.queryByText('Categoría')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Fila 3: bucket/i)).toBeDisabled();
    });

    it('three-row mix (1 duplicate + 2 non-duplicate): all three bucket controls reachable by label; no categoría rendered by default', () => {
      function ThreeRows() {
        return (
          <>
            <FilaRevision
              fila={unaFilaPreview({ rowIndex: 0, esDuplicado: false })}
              categoriaId={null}
              catalogo={catalogoListo}
              onEditChange={vi.fn()}
            />
            <FilaRevision
              fila={unaFilaPreview({ rowIndex: 1, esDuplicado: true })}
              categoriaId={null}
              catalogo={catalogoListo}
              onEditChange={vi.fn()}
            />
            <FilaRevision
              fila={unaFilaPreview({ rowIndex: 2, esDuplicado: false })}
              categoriaId={null}
              catalogo={catalogoListo}
              onEditChange={vi.fn()}
            />
          </>
        );
      }

      render(<ThreeRows />);

      expect(screen.getByLabelText(/Fila 1: bucket/i)).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Fila 1: categoría/i),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Fila 2: bucket/i)).toBeDisabled();
      expect(
        screen.queryByLabelText(/Fila 2: categoría/i),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Fila 3: bucket/i)).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Fila 3: categoría/i),
      ).not.toBeInTheDocument();
    });
  });

  describe('amount colors (cargo red signed "-", abono green signed "+", $0 neutral when both are zero)', () => {
    it('renders only the signed cargo, colored, when abono is zero', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, cargo: '50000', abono: '0' })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      expect(screen.getByText('-$50.000')).toHaveClass('text-cargo-foreground');
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
    });

    it('renders only the signed abono, colored, when cargo is zero', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, cargo: '0', abono: '596' })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      expect(screen.getByText('+$596')).toHaveClass('text-ingreso-foreground');
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
    });

    it('renders a single neutral $0 when both cargo and abono are zero', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, cargo: '0', abono: '0' })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      expect(screen.getAllByText('$0')).toHaveLength(1);
      expect(screen.getByText('$0')).toHaveClass('text-foreground');
    });

    it('renders both signed amounts, cargo first, when both cargo and abono are non-zero', () => {
      render(
        <FilaRevision
          fila={unaFilaPreview({ rowIndex: 2, cargo: '1000', abono: '596' })}
          categoriaId={null}
          catalogo={catalogoListo}
          onEditChange={vi.fn()}
        />,
      );

      const cargoEl = screen.getByText('-$1.000');
      const abonoEl = screen.getByText('+$596');
      expect(cargoEl).toHaveClass('text-cargo-foreground');
      expect(abonoEl).toHaveClass('text-ingreso-foreground');
      // cargo before abono in document order
      expect(
        cargoEl.compareDocumentPosition(abonoEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
