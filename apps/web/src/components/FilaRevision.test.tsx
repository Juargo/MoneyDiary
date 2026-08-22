import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilaRevision } from './FilaRevision';
import type { CatalogoEstado } from '@/api/types';
import type { PreviewFilaDto } from '@/api/types';

// FilaRevision (US-059 PR2, D-06/D-10/D-12) — presentational row component.
// Tests verify: cell rendering (fecha, descripcion, cargo, abono via
// formatearMontoCLP), duplicate greying + badge + disabled selects, bucket→
// categoría cascade (D-06), accessible labels (D-10), and onEditChange payloads.
//
// NO network, NO state machine — pure presentational unit.

// --- Fixtures ---

function unaFilaPreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 2, // 0-based → label "Fila 3: ..."
    fecha: '2026-07-15T00:00:00.000Z',
    descripcion: 'Supermercado Líder',
    cargo: '50000',
    abono: '0',
    esDuplicado: false,
    sugerido: null,
    ...overrides,
  };
}

const catalogoListo: CatalogoEstado = {
  tag: 'listo',
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
};

const catalogoCargando: CatalogoEstado = { tag: 'cargando' };
const catalogoError: CatalogoEstado = { tag: 'error' };

// --- Tests ---

describe('FilaRevision', () => {
  // Cell rendering
  it('renders fecha (sliced to YYYY-MM-DD), descripcion, formatted cargo and abono', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview()}
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

  // Changing bucket resets categoría to the sentinel (D-06)
  it('changing bucket resets categoría select to the sentinel (no stale categoría)', async () => {
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

    const categoriaSelect = screen.getByLabelText(/Fila 3: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-nec-1');
    // Now change bucket — should reset categoría to sentinel
    await userEvent.selectOptions(bucketSelect, 'Deseos');

    // The categoría select should now show the sentinel value (empty)
    expect((categoriaSelect as HTMLSelectElement).value).toBe('');
    // onEditChange called with null for the reset
    expect(onEditChange).toHaveBeenLastCalledWith(2, null);
  });

  // bucketUI seeds from sugerido.bucket when present in catalog groups (D-06)
  it('seeds bucketUI from sugerido.bucket when it exists among catalog groups', () => {
    render(
      <FilaRevision
        fila={unaFilaPreview({
          rowIndex: 2,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        })}
        categoriaId={'cat-nec-1'}
        catalogo={catalogoListo}
        onEditChange={vi.fn()}
      />,
    );

    const bucketSelect = screen.getByLabelText(/Fila 3: bucket/i);
    expect((bucketSelect as HTMLSelectElement).value).toBe('Necesidades');
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

  // catalogo.tag === 'cargando' → selects disabled (no crash)
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
