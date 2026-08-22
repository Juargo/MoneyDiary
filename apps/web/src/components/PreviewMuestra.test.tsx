import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewMuestra } from './PreviewMuestra';
import type { PreviewFilaDto } from '@/api/types';
// Fix 8: import shared fixtures; local factory functions removed
import { unaFilaPreview, unCatalogo } from '@/test-utils/preview-fixtures';

// PreviewMuestra (US-059 PR2, D-12) — presentational review table shell.
// Receives canonical `filas`/`resumen` props (not legacy muestra/estructura).
// Tests verify: banco header (D-08), resumen header, "nada se ha guardado"
// affordance (CA-02), row rendering via FilaRevision, merged display value for
// edits (D-05), catalogo cargando/error degraded states (D-07).
//
// NO network, NO mutations — purely presentational, no mocking required.

// --- Tests ---

describe('PreviewMuestra', () => {
  // D-08: banco field renders in the header
  it('D-08: renders the banco name in the header', () => {
    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={[unaFilaPreview()]}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    expect(screen.getByText('BancoEstado')).toBeInTheDocument();
  });

  // WEB-PRV-02: resumen header shows totalFilas, duplicadosDetectados, nuevas
  it('renders resumen header with totalFilas, duplicadosDetectados and nuevas', () => {
    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={[unaFilaPreview()]}
        resumen={{ totalFilas: 120, duplicadosDetectados: 20, nuevas: 100 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  // CA-02 / WEB-PRV-02: "nada se ha guardado aún" affordance is visible
  it('renders the "nada se ha guardado aún" affordance (CA-02)', () => {
    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={[unaFilaPreview()]}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    expect(screen.getByText(/nada se ha guardado aún/i)).toBeInTheDocument();
  });

  // Fix 7: "nada se ha guardado aún" is a plain <p> with no role="status"
  it('fix 7: "nada se ha guardado aún" has no live-region role', () => {
    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={[unaFilaPreview()]}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    const el = screen.getByText(/nada se ha guardado aún/i);
    expect(el.tagName).toBe('P');
    expect(el).not.toHaveAttribute('role', 'status');
  });

  // One FilaRevision rendered per filas entry (assert via unique cell text)
  it('renders one row per filas entry', () => {
    const filas: PreviewFilaDto[] = [
      unaFilaPreview({ rowIndex: 0, descripcion: 'Transacción 1' }),
      unaFilaPreview({ rowIndex: 1, descripcion: 'Transacción 2' }),
      unaFilaPreview({ rowIndex: 2, descripcion: 'Transacción 3' }),
    ];

    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={filas}
        resumen={{ totalFilas: 3, duplicadosDetectados: 0, nuevas: 3 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    expect(screen.getByText('Transacción 1')).toBeInTheDocument();
    expect(screen.getByText('Transacción 2')).toBeInTheDocument();
    expect(screen.getByText('Transacción 3')).toBeInTheDocument();
  });

  // Fix 6 (D-05 real assertion): edited categoriaId is reflected in the row's select
  // When edits has an entry for rowIndex 0 = 'cat-des-1' (Deseos),
  // the categoría select should show that value and the bucket select should show Deseos.
  it('fix 6 D-05: edited categoriaId wins over sugerido — categoría select shows edit value', () => {
    const filas = [
      unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      }),
    ];
    const edits = new Map<number, string | null>([[0, 'cat-des-1']]);

    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={filas}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={edits}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    // Categoría select (row 0 → label "Fila 1: categoría") should show 'cat-des-1'
    const categoriaSelect = screen.getByLabelText(/Fila 1: categoría/i);
    expect((categoriaSelect as HTMLSelectElement).value).toBe('cat-des-1');

    // Fix 2: bucket select should show Deseos (derived from edited categoriaId)
    const bucketSelect = screen.getByLabelText(/Fila 1: bucket/i);
    expect((bucketSelect as HTMLSelectElement).value).toBe('Deseos');
  });

  // Fix 5: catalogo.tag === 'cargando' → inline hint "Cargando catálogo…" renders
  it('fix 5: shows "Cargando catálogo…" hint when catalogo is cargando', () => {
    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={[
          unaFilaPreview({ rowIndex: 0, descripcion: 'Fila bajo cargando' }),
        ]}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={{ tag: 'cargando' }}
      />,
    );

    expect(screen.getByText(/cargando catálogo/i)).toBeInTheDocument();
  });

  // Fix 5: catalogo.tag === 'listo' → "Cargando catálogo…" hint is gone
  it('fix 5: "Cargando catálogo…" hint disappears when catalogo is listo', () => {
    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={[unaFilaPreview()]}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    expect(screen.queryByText(/cargando catálogo/i)).not.toBeInTheDocument();
  });

  // D-07: catalogo.tag === 'cargando' → rows still render (table not blocked)
  it('D-07: renders rows even when catalogo is cargando', () => {
    const filas = [
      unaFilaPreview({ rowIndex: 0, descripcion: 'Fila bajo cargando' }),
    ];

    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={filas}
        resumen={{ totalFilas: 5, duplicadosDetectados: 2, nuevas: 3 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={{ tag: 'cargando' }}
      />,
    );

    // Rows still render
    expect(screen.getByText('Fila bajo cargando')).toBeInTheDocument();
    // Resumen still visible (use distinct values to avoid ambiguity)
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // D-07: catalogo.tag === 'error' → rows still render; inline error affordance visible
  it('D-07: renders rows and an inline catalog-error affordance when catalogo is error', () => {
    const filas = [
      unaFilaPreview({ rowIndex: 0, descripcion: 'Fila bajo error' }),
    ];

    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={filas}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={{ tag: 'error' }}
      />,
    );

    // Rows still render
    expect(screen.getByText('Fila bajo error')).toBeInTheDocument();
    // An inline catalog-error affordance is present
    const errorEl = screen.getByText(/no se pudo cargar el catálogo/i);
    expect(errorEl).toBeInTheDocument();
    // Mirrors the "nada se ha guardado" role test: error affordance is a plain <p>,
    // not a live-region (no role="status")
    expect(errorEl).not.toHaveAttribute('role', 'status');
  });

  // No pagination controls (decision 4, WEB-PRV-02)
  it('renders all rows without pagination controls', () => {
    const filas = Array.from({ length: 5 }, (_, i) =>
      unaFilaPreview({ rowIndex: i, descripcion: `Fila ${i + 1}` }),
    );

    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={filas}
        resumen={{ totalFilas: 5, duplicadosDetectados: 0, nuevas: 5 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    // All 5 rows rendered
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Fila ${i}`)).toBeInTheDocument();
    }
    // No "Filas a mostrar" / pagination buttons
    expect(
      screen.queryByRole('button', { name: '10' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '25' }),
    ).not.toBeInTheDocument();
  });
});
