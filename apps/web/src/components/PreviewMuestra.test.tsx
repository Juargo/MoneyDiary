import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  // ── Sticky classification progress ──────────────────────────────────────
  describe('classification progress', () => {
    it('shows "N de M clasificadas" — M excludes duplicates, N counts merged non-null values', () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
        unaFilaPreview({ rowIndex: 1, sugerido: null }),
        unaFilaPreview({ rowIndex: 2, esDuplicado: true }),
      ];

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      expect(screen.getByText(/1 de 2 clasificadas/i)).toBeInTheDocument();
      expect(screen.getByText(/1 duplicada\b/i)).toBeInTheDocument();
    });

    it('an edit overrides sugerido and counts as classified (D-05)', () => {
      const filas = [
        unaFilaPreview({ rowIndex: 0, sugerido: null }),
        unaFilaPreview({ rowIndex: 1, sugerido: null }),
      ];
      const edits = new Map<number, string | null>([[0, 'cat-nec-1']]);

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
          edits={edits}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      expect(screen.getByText(/1 de 2 clasificadas/i)).toBeInTheDocument();
    });

    it('renders a determinate progress bar whose fill width matches the classified ratio', () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
        unaFilaPreview({ rowIndex: 1, sugerido: null }),
      ];

      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const fill = container.querySelector('[data-progreso-fill]');
      expect(fill).not.toBeNull();
      expect((fill as HTMLElement).style.width).toBe('50%');
    });

    it('"Solo sin clasificar" toggle is an aria-pressed button, off by default', () => {
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

      const toggle = screen.getByRole('button', {
        name: /solo sin clasificar/i,
      });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggling "Solo sin clasificar" filters out classified non-duplicate rows and duplicates', async () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          descripcion: 'Clasificada',
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
        unaFilaPreview({
          rowIndex: 1,
          descripcion: 'Sin clasificar',
          sugerido: null,
        }),
        unaFilaPreview({
          rowIndex: 2,
          descripcion: 'Duplicada',
          esDuplicado: true,
        }),
      ];

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const toggle = screen.getByRole('button', {
        name: /solo sin clasificar/i,
      });
      await userEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Sin clasificar')).toBeInTheDocument();
      expect(screen.queryByText('Clasificada')).not.toBeInTheDocument();
      expect(screen.queryByText('Duplicada')).not.toBeInTheDocument();
    });

    it('filtered-empty state tells the user everything is classified and offers turning the filter off', async () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
      ];

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(
        screen.getByRole('button', { name: /solo sin clasificar/i }),
      );

      expect(
        screen.getByText(/todas las filas están clasificadas/i),
      ).toBeInTheDocument();

      const volver = screen.getByRole('button', {
        name: /mostrar todas las filas/i,
      });
      await userEvent.click(volver);

      expect(
        screen.getByRole('button', { name: /solo sin clasificar/i }),
      ).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // ── Grouping by date ─────────────────────────────────────────────────────
  describe('grouping by date', () => {
    it('groups consecutive rows sharing the same fecha under one date heading and one <ul>', () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'A',
        }),
        unaFilaPreview({
          rowIndex: 1,
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'B',
        }),
        unaFilaPreview({
          rowIndex: 2,
          fecha: '2026-07-16T00:00:00.000Z',
          descripcion: 'C',
        }),
      ];

      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 3, duplicadosDetectados: 0, nuevas: 3 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const grupos = container.querySelectorAll('[data-fecha-grupo]');
      expect(grupos).toHaveLength(2);
      expect(grupos[0]).toHaveAttribute('data-fecha-grupo', '2026-07-15');
      expect(grupos[1]).toHaveAttribute('data-fecha-grupo', '2026-07-16');
      expect(
        within(grupos[0] as HTMLElement).getByText('A'),
      ).toBeInTheDocument();
      expect(
        within(grupos[0] as HTMLElement).getByText('B'),
      ).toBeInTheDocument();
      expect(
        within(grupos[1] as HTMLElement).getByText('C'),
      ).toBeInTheDocument();
    });

    it('non-consecutive rows with the same fecha value form separate groups, in file order (no sorting)', () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'A',
        }),
        unaFilaPreview({
          rowIndex: 1,
          fecha: '2026-07-16T00:00:00.000Z',
          descripcion: 'B',
        }),
        unaFilaPreview({
          rowIndex: 2,
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'C',
        }),
      ];

      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 3, duplicadosDetectados: 0, nuevas: 3 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const grupos = container.querySelectorAll('[data-fecha-grupo]');
      // Three groups, NOT two — the second '2026-07-15' is not merged with
      // the first because it is not consecutive in file order.
      expect(grupos).toHaveLength(3);
      expect(grupos[0]).toHaveAttribute('data-fecha-grupo', '2026-07-15');
      expect(grupos[1]).toHaveAttribute('data-fecha-grupo', '2026-07-16');
      expect(grupos[2]).toHaveAttribute('data-fecha-grupo', '2026-07-15');
      // DOM/focus order stays file order. Scoped to the top row's
      // description span (direct child of the muted-foreground row) — the
      // formatted cargo/abono amounts also carry `.font-medium` but live one
      // level deeper, under the text-foreground row.
      const descripciones = Array.from(
        container.querySelectorAll('.text-muted-foreground > span.font-medium'),
      ).map((el) => el.textContent);
      expect(descripciones).toEqual(['A', 'B', 'C']);
    });
  });

  // ── P2 design critique fix 1: shared sm+ column header row ───────────────
  describe('shared column header row (Bucket/Categoría)', () => {
    it('renders a purely-visual, aria-hidden header row naming the Bucket/Categoría columns', () => {
      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[unaFilaPreview()]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const header = container.querySelector('[data-columnas-header]');
      expect(header).not.toBeNull();
      expect(header).toHaveAttribute('aria-hidden', 'true');
      expect(header).toHaveTextContent('Bucket');
      expect(header).toHaveTextContent('Categoría');
    });

    it('the header row lives inside the sticky progress container — no separate sticky context to fight z-index with', () => {
      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[unaFilaPreview()]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const header = container.querySelector('[data-columnas-header]');
      expect(header?.closest('.sticky.top-0')).not.toBeNull();
    });

    it('is hidden below sm and only shown sm and up (per-row visible labels own mobile identity instead)', () => {
      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[unaFilaPreview()]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const header = container.querySelector('[data-columnas-header]');
      expect(header?.className).toMatch(/hidden/);
      expect(header?.className).toMatch(/sm:flex/);
    });
  });

  // ── Selection + bulk apply ───────────────────────────────────────────────
  describe('selection + bulk apply', () => {
    const filasDosGrupos: PreviewFilaDto[] = [
      unaFilaPreview({
        rowIndex: 0,
        fecha: '2026-07-15T00:00:00.000Z',
        descripcion: 'Fila 1',
      }),
      unaFilaPreview({
        rowIndex: 1,
        fecha: '2026-07-15T00:00:00.000Z',
        descripcion: 'Fila 2',
      }),
      unaFilaPreview({
        rowIndex: 2,
        fecha: '2026-07-16T00:00:00.000Z',
        descripcion: 'Fila 3',
        esDuplicado: true,
      }),
    ];

    it('no bulk toolbar renders while nothing is selected', () => {
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      expect(screen.queryByText(/seleccionadas/i)).not.toBeInTheDocument();
    });

    it('selecting a row shows the bulk toolbar with the selection count', async () => {
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

      expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
    });

    it('the group "Seleccionar todas" checkbox selects every non-duplicate row in that date group', async () => {
      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const grupo1 = container.querySelector(
        '[data-fecha-grupo="2026-07-15"]',
      ) as HTMLElement;
      const seleccionarTodas =
        within(grupo1).getByLabelText(/Seleccionar todas/i);
      await userEvent.click(seleccionarTodas);

      expect(screen.getByLabelText(/Seleccionar fila 1/i)).toBeChecked();
      expect(screen.getByLabelText(/Seleccionar fila 2/i)).toBeChecked();
      expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();
    });

    it('the group checkbox becomes indeterminate when only some rows in the group are selected', async () => {
      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

      const grupo1 = container.querySelector(
        '[data-fecha-grupo="2026-07-15"]',
      ) as HTMLElement;
      const seleccionarTodas = within(grupo1).getByLabelText(
        /Seleccionar todas/i,
      ) as HTMLInputElement;

      expect(seleccionarTodas.indeterminate).toBe(true);
      expect(seleccionarTodas.checked).toBe(false);
    });

    it('a date group containing only duplicate rows renders no "Seleccionar todas" control', () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          fecha: '2026-07-20T00:00:00.000Z',
          esDuplicado: true,
        }),
      ];

      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 1, duplicadosDetectados: 1, nuevas: 0 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const grupo = container.querySelector(
        '[data-fecha-grupo="2026-07-20"]',
      ) as HTMLElement;
      expect(
        within(grupo).queryByLabelText(/Seleccionar todas/i),
      ).not.toBeInTheDocument();
    });

    it('clicking "Aplicar" opens a confirmation instead of applying immediately, and does not call onEditChange yet', async () => {
      const onEditChange = vi.fn();

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={onEditChange}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
      await userEvent.click(screen.getByLabelText(/Seleccionar fila 2/i));

      const bucketToolbar = screen.getByLabelText(/bucket para aplicar/i);
      await userEvent.selectOptions(bucketToolbar, 'Necesidades');
      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-nec-1');

      const aplicarBtn = screen.getByRole('button', {
        name: /aplicar a 2 seleccionadas/i,
      });
      await userEvent.click(aplicarBtn);

      expect(onEditChange).not.toHaveBeenCalled();
      const dialog = await screen.findByRole('alertdialog');
      // Copy states the impact without client-side money math (ADR-024):
      // category label, bucket, and row count only — never a sum of montos.
      expect(dialog).toHaveTextContent('Supermercado');
      expect(dialog).toHaveTextContent('Necesidades');
      expect(dialog).toHaveTextContent('2 movimientos');
      // Reassurance parity with the page-level commit gate.
      expect(dialog).toHaveTextContent('Agregar transacciones');
    });

    it('confirming the bulk-apply dialog applies the chosen categoría to every selected row and clears the selection', async () => {
      const onEditChange = vi.fn();

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={onEditChange}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
      await userEvent.click(screen.getByLabelText(/Seleccionar fila 2/i));

      const aplicarBtn = screen.getByRole('button', {
        name: /aplicar a 2 seleccionadas/i,
      });
      expect(aplicarBtn).toBeDisabled();

      const bucketToolbar = screen.getByLabelText(/bucket para aplicar/i);
      await userEvent.selectOptions(bucketToolbar, 'Necesidades');
      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-nec-1');

      expect(aplicarBtn).toBeEnabled();
      await userEvent.click(aplicarBtn);

      await screen.findByRole('alertdialog');
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(onEditChange).toHaveBeenCalledTimes(2);
      expect(onEditChange).toHaveBeenCalledWith(0, 'cat-nec-1');
      expect(onEditChange).toHaveBeenCalledWith(1, 'cat-nec-1');
      // Dialog closes, and selection cleared — toolbar disappears.
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/seleccionadas/i)).not.toBeInTheDocument();
    });

    it('cancelling the bulk-apply confirmation preserves the selection and calls no onEditChange', async () => {
      const onEditChange = vi.fn();

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={onEditChange}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
      await userEvent.click(screen.getByLabelText(/Seleccionar fila 2/i));

      const bucketToolbar = screen.getByLabelText(/bucket para aplicar/i);
      await userEvent.selectOptions(bucketToolbar, 'Necesidades');
      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-nec-1');

      const aplicarBtn = screen.getByRole('button', {
        name: /aplicar a 2 seleccionadas/i,
      });
      await userEvent.click(aplicarBtn);
      await screen.findByRole('alertdialog');

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onEditChange).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();
      expect(screen.getByLabelText(/Seleccionar fila 1/i)).toBeChecked();
      expect(screen.getByLabelText(/Seleccionar fila 2/i)).toBeChecked();
    });

    it('moves focus to Confirmar when the bulk-apply dialog opens, and back to the Aplicar trigger on cancel', async () => {
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
      const bucketToolbar = screen.getByLabelText(/bucket para aplicar/i);
      await userEvent.selectOptions(bucketToolbar, 'Necesidades');
      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-nec-1');

      const aplicarBtn = screen.getByRole('button', {
        name: /aplicar a 1 seleccionada/i,
      });
      await userEvent.click(aplicarBtn);
      await screen.findByRole('alertdialog');

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus(),
      );

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(aplicarBtn).toHaveFocus();
    });

    it('Escape cancels the bulk-apply confirmation, preserving the selection', async () => {
      const onEditChange = vi.fn();

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={onEditChange}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
      const bucketToolbar = screen.getByLabelText(/bucket para aplicar/i);
      await userEvent.selectOptions(bucketToolbar, 'Necesidades');
      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-nec-1');

      const aplicarBtn = screen.getByRole('button', {
        name: /aplicar a 1 seleccionada/i,
      });
      await userEvent.click(aplicarBtn);
      await screen.findByRole('alertdialog');

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(onEditChange).not.toHaveBeenCalled();
      expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
    });

    it('"Limpiar selección" clears the selection without calling onEditChange', async () => {
      const onEditChange = vi.fn();

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={onEditChange}
          catalogo={unCatalogo()}
        />,
      );

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
      await userEvent.click(
        screen.getByRole('button', { name: /limpiar selección/i }),
      );

      expect(onEditChange).not.toHaveBeenCalled();
      expect(screen.queryByText(/seleccionadas/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Seleccionar fila 1/i)).not.toBeChecked();
    });

    // ── P2 design critique fix 2: toolbar distill (count pill + inline dismiss) ──
    describe('toolbar distill: selection-count pill with inline dismiss', () => {
      it('renders the selection count inside a pill that also contains the "Limpiar selección" dismiss control', async () => {
        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

        const dismiss = screen.getByRole('button', {
          name: /limpiar selección/i,
        });
        const pill = dismiss.closest('[data-conteo-pill]');
        expect(pill).not.toBeNull();
        expect(pill).toHaveTextContent('1 seleccionada');
      });

      it('the dismiss control is a real, keyboard-reachable <button> with focus-visible styling', async () => {
        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

        const dismiss = screen.getByRole('button', {
          name: /limpiar selección/i,
        });
        expect(dismiss.tagName).toBe('BUTTON');
        expect(dismiss.className).toMatch(/focus-visible:/);
      });

      it('the toolbar distills to exactly two selects and two buttons (dismiss pill + Aplicar) — no separate "Limpiar selección" text button', async () => {
        const { container } = render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

        const toolbar = container.querySelector(
          '[data-toolbar-bulk]',
        ) as HTMLElement;
        expect(toolbar).not.toBeNull();
        const buttons = within(toolbar).getAllByRole('button');
        expect(buttons).toHaveLength(2);
        const ariaLabels = buttons.map((b) => b.getAttribute('aria-label'));
        expect(ariaLabels).toContain('Limpiar selección');
      });

      it('clicking the dismiss control clears the selection without calling onEditChange (same behavior as before the distill)', async () => {
        const onEditChange = vi.fn();

        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={onEditChange}
            catalogo={unCatalogo()}
          />,
        );

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
        await userEvent.click(
          screen.getByRole('button', { name: /limpiar selección/i }),
        );

        expect(onEditChange).not.toHaveBeenCalled();
        expect(screen.queryByText(/seleccionadas/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/Seleccionar fila 1/i)).not.toBeChecked();
      });
    });

    it('duplicate rows never expose a selection checkbox', () => {
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasDosGrupos}
          resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      expect(
        screen.queryByLabelText(/Seleccionar fila 3/i),
      ).not.toBeInTheDocument();
    });

    // ── Page-level "select all visible" master checkbox ─────────────────
    describe('master "select all visible" checkbox', () => {
      it('renders with the visible selectable count in its accessible name (excludes duplicates)', () => {
        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        const master = screen.getByLabelText(
          /seleccionar todas las visibles \(2\)/i,
        );
        expect(master).not.toBeChecked();
      });

      it('uses singular copy when exactly one row is visible and selectable', () => {
        const filas = [unaFilaPreview({ rowIndex: 0, descripcion: 'Única' })];

        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filas}
            resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        expect(
          screen.getByLabelText(/seleccionar la visible \(1\)/i),
        ).toBeInTheDocument();
      });

      it('does not render when there are no visible selectable rows', () => {
        const filas = [unaFilaPreview({ rowIndex: 0, esDuplicado: true })];

        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filas}
            resumen={{ totalFilas: 1, duplicadosDetectados: 1, nuevas: 0 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        expect(
          screen.queryByLabelText(
            /seleccionar (todas las visibles|la visible)/i,
          ),
        ).not.toBeInTheDocument();
      });

      it('checking it selects every visible selectable row', async () => {
        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        const master = screen.getByLabelText(
          /seleccionar todas las visibles \(2\)/i,
        );
        await userEvent.click(master);

        expect(screen.getByLabelText(/Seleccionar fila 1/i)).toBeChecked();
        expect(screen.getByLabelText(/Seleccionar fila 2/i)).toBeChecked();
        expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();
      });

      it('becomes indeterminate when only some visible selectable rows are selected', async () => {
        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

        const master = screen.getByLabelText(
          /seleccionar todas las visibles \(2\)/i,
        ) as HTMLInputElement;
        expect(master.indeterminate).toBe(true);
        expect(master.checked).toBe(false);
      });

      it('becomes checked (not indeterminate) once all visible selectable rows are selected', async () => {
        render(
          <PreviewMuestra
            banco="BancoEstado"
            filas={filasDosGrupos}
            resumen={{ totalFilas: 3, duplicadosDetectados: 1, nuevas: 2 }}
            edits={new Map()}
            onEditChange={vi.fn()}
            catalogo={unCatalogo()}
          />,
        );

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
        await userEvent.click(screen.getByLabelText(/Seleccionar fila 2/i));

        const master = screen.getByLabelText(
          /seleccionar todas las visibles \(2\)/i,
        ) as HTMLInputElement;
        expect(master.checked).toBe(true);
        expect(master.indeterminate).toBe(false);
      });

      it('unchecking only touches currently visible rows — a selection hidden by the filter is preserved', async () => {
        const filas = [
          unaFilaPreview({
            rowIndex: 0,
            descripcion: 'Clasificada',
            sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
          }),
          unaFilaPreview({
            rowIndex: 1,
            descripcion: 'Sin clasificar 1',
            sugerido: null,
          }),
          unaFilaPreview({
            rowIndex: 2,
            descripcion: 'Sin clasificar 2',
            sugerido: null,
          }),
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

        // Pre-select the classified row before it gets hidden by the filter.
        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
        expect(screen.getByText('1 seleccionada')).toBeInTheDocument();

        // Turn on "Solo sin clasificar" — row 1 becomes hidden but stays selected.
        await userEvent.click(
          screen.getByRole('button', { name: /solo sin clasificar/i }),
        );

        // The master checkbox recomputes to the 2 now-visible rows, none selected.
        const master = screen.getByLabelText(
          /seleccionar todas las visibles \(2\)/i,
        ) as HTMLInputElement;
        expect(master.checked).toBe(false);

        // Check it — selects both visible rows.
        await userEvent.click(master);
        expect(screen.getByLabelText(/Seleccionar fila 2/i)).toBeChecked();
        expect(screen.getByLabelText(/Seleccionar fila 3/i)).toBeChecked();
        expect(screen.getByText('3 seleccionadas')).toBeInTheDocument();

        // Uncheck it — deselects only the 2 visible rows; the hidden row-1
        // selection is untouched.
        await userEvent.click(master);
        expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
      });
    });
  });
});
