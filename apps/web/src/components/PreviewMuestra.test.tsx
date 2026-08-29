import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
// NO network, NO mutations — purely presentational, no mocking required for
// the component's own logic. Design critique round-8 P2-B added a
// `<Link to="/ayuda" hash="ayuda-glosario">` to the sticky header (rendered
// whenever `filas.length > 0`, i.e. almost every test in this file). A real
// `<Link>` needs `RouterProvider` context, and `renderConRouter`'s initial
// route resolves ASYNCHRONOUSLY (see that helper's own docblock) — retrofitting
// an `await` onto every one of this suite's ~45 synchronous assertions would
// be a much larger, riskier diff than this component's own behavior change.
// Instead — same pattern `SubirCartola.test.tsx` already uses for
// `useNavigate` — `@tanstack/react-router`'s `Link` is mocked to a plain
// `<a>` stub below: PreviewMuestra is router-agnostic in every way that
// matters to ITS OWN tests (this file asserts href correctness only; actual
// navigation/hash-scroll is exercised where a router is already the norm —
// `SemaforoDetallePage.test.tsx`/`AyudaPage.test.tsx` — and is otherwise
// browser-verified).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      to,
      hash,
      children,
      className,
    }: {
      readonly to: string;
      readonly hash?: string;
      readonly children: ReactNode;
      readonly className?: string;
    }) => (
      <a href={hash ? `${to}#${hash}` : to} className={className}>
        {children}
      </a>
    ),
  };
});

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

  // Round-9 critique P1 fix 1: per-row bucket select shows "Gustos" as label
  // while the option value stays "Deseos" (ETIQUETA_BUCKET applied at the
  // PreviewMuestra→FilaRevision call site now).
  it('round-9 P1: per-row bucket select shows "Gustos" label with "Deseos" value', () => {
    render(
      <PreviewMuestra
        banco="BancoEstado"
        filas={[unaFilaPreview({ rowIndex: 0 })]}
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
        edits={new Map()}
        onEditChange={vi.fn()}
        catalogo={unCatalogo()}
      />,
    );

    const bucketSelect = screen.getByLabelText(
      /Fila 1: bucket/i,
    ) as HTMLSelectElement;
    const deseosOption = Array.from(bucketSelect.options).find(
      (o) => o.value === 'Deseos',
    );

    expect(deseosOption).toBeDefined();
    expect(deseosOption?.text).toBe('Gustos');
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

  // ── P2-B contextual help: glossary link next to the column legend ───────
  describe('contextual help link (P2-B)', () => {
    it('links to the glossary section that defines "bucket"', () => {
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

      const link = screen.getByRole('link', {
        name: /ayuda: qué es un bucket/i,
      });
      expect(link).toHaveAttribute('href', '/ayuda#ayuda-glosario');
    });

    it('is reachable in the accessibility tree — not nested inside the aria-hidden column header', () => {
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

      const link = screen.getByRole('link', {
        name: /ayuda: qué es un bucket/i,
      });
      expect(link.closest('[data-columnas-header]')).toBeNull();
      expect(link.closest('[aria-hidden="true"]')).toBeNull();
      // Not hidden below sm either — Sam needs it on mobile too.
      expect(container.querySelector('[data-columnas-header]')).not.toBe(
        link.parentElement,
      );
    });

    it('stays visible while a selection is active (reference info, not a working-memory-budget control)', async () => {
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

      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

      expect(
        screen.getByRole('link', { name: /ayuda: qué es un bucket/i }),
      ).toBeInTheDocument();
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

    // Round-9 critique P1 fix 2: the per-date-group "Seleccionar todas"
    // checkbox is bare (no surrounding label with text) — it needs its own
    // wrapping label sized to the 24×24 CSS px hit-target floor (WCAG 2.2 AA
    // SC 2.5.8), while its own visual glyph stays size-4.
    it('round-9 P1 fix 2: the group checkbox sits in a size-6 hit target while staying size-4 visually', () => {
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

      expect(seleccionarTodas.className).toContain('size-4');
      const hitTarget = seleccionarTodas.closest('label');
      expect(hitTarget).not.toBeNull();
      expect(hitTarget?.className).toContain('size-6');
    });

    it('clicking "Aplicar" applies the chosen categoría directly — no confirmation, onEditChange fires immediately', async () => {
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

      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-nec-1');

      const aplicarBtn = screen.getByRole('button', {
        name: /aplicar a 2 seleccionadas/i,
      });
      await userEvent.click(aplicarBtn);

      // No dialog of any kind — direct apply.
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(onEditChange).toHaveBeenCalledTimes(2);
      expect(onEditChange).toHaveBeenCalledWith(0, 'cat-nec-1');
      expect(onEditChange).toHaveBeenCalledWith(1, 'cat-nec-1');
      // Selection cleared — toolbar disappears.
      expect(screen.queryByText(/seleccionadas/i)).not.toBeInTheDocument();
    });

    // Round-9 critique P2 structural distill: the bucket→categoría cascade
    // collapsed into ONE select whose options are grouped by
    // `<optgroup label="Gustos">` (etc). The bucket is DERIVED from the
    // chosen categoría (every categoría belongs to exactly one bucket) — it
    // is never a separate control and never part of the `onEditChange`
    // payload (that was already true even under the old two-select cascade:
    // bucket was UI-only filtering, categoriaId was always the only thing
    // written to the wire).
    it('round-9 P2: the combined categoría select groups options under bucket optgroups labeled with the UI label ("Gustos", never "Deseos")', async () => {
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

      const categoriaToolbar = screen.getByLabelText(
        /categoría para aplicar/i,
      ) as HTMLSelectElement;

      const deseosOption = Array.from(categoriaToolbar.options).find(
        (o) => o.value === 'cat-des-1',
      );
      expect(deseosOption).toBeDefined();
      expect(deseosOption?.text).toBe('Restaurantes');
      const deseosGroup = deseosOption?.closest(
        'optgroup',
      ) as HTMLOptGroupElement | null;
      expect(deseosGroup).not.toBeNull();
      expect(deseosGroup?.label).toBe('Gustos');
      expect(deseosGroup?.label).not.toBe('Deseos');

      await userEvent.selectOptions(categoriaToolbar, 'cat-des-1');
      await userEvent.click(
        screen.getByRole('button', { name: /aplicar a 1 seleccionada/i }),
      );

      // Bucket never appears in the payload — categoriaId only (D-03).
      expect(onEditChange).toHaveBeenCalledWith(0, 'cat-des-1');
      expect(onEditChange).toHaveBeenCalledTimes(1);
    });

    it('"Aplicar" stays disabled until a categoría is chosen, and is not clickable before that', async () => {
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

      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-nec-1');

      expect(aplicarBtn).toBeEnabled();
      expect(onEditChange).not.toHaveBeenCalled();
    });

    it('the combined categoría select leads with a neutral placeholder option and no bucket select exists anymore', async () => {
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

      const categoriaToolbar = screen.getByLabelText(
        /categoría para aplicar/i,
      ) as HTMLSelectElement;
      expect(categoriaToolbar.value).toBe('');
      expect(categoriaToolbar.options[0].value).toBe('');
      expect(categoriaToolbar.options[0].text).toMatch(
        /selecciona una categoría/i,
      );

      expect(
        screen.queryByLabelText(/bucket para aplicar/i),
      ).not.toBeInTheDocument();
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

      it('round-9 P2: the toolbar distills to ONE combined categoría select (no bucket select) plus two buttons (dismiss pill + Aplicar) — 4 controls total, the ≤4 working-memory budget', async () => {
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

        const selects = within(toolbar).getAllByRole('combobox');
        expect(selects).toHaveLength(1);
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

    // ── Sticky header collapses the progress readout during selection ──────
    describe('sticky header collapses the progress readout during selection', () => {
      it('hides the progress text and progress bar once a row is selected', async () => {
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

        expect(screen.getByText(/de 2 clasificadas/i)).toBeInTheDocument();
        expect(container.querySelector('[data-progreso-fill]')).not.toBeNull();

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

        expect(
          screen.queryByText(/de 2 clasificadas/i),
        ).not.toBeInTheDocument();
        expect(container.querySelector('[data-progreso-fill]')).toBeNull();
      });

      it('keeps the master select-all checkbox visible but hides the "Solo sin clasificar" toggle while a selection is active (P2-A distill)', async () => {
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
          screen.getByRole('button', { name: /solo sin clasificar/i }),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));

        expect(
          screen.getByLabelText(/seleccionar todas las visibles \(2\)/i),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /solo sin clasificar/i }),
        ).not.toBeInTheDocument();
      });

      it('restores the "Solo sin clasificar" toggle, in its previous pressed state, once the selection is cleared (P2-A distill)', async () => {
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
        await userEvent.click(
          screen.getByRole('button', { name: /limpiar selección/i }),
        );

        const toggle = screen.getByRole('button', {
          name: /solo sin clasificar/i,
        });
        expect(toggle).toBeInTheDocument();
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
      });

      it('P2-A reconciliation: if the filter is already active when the first row is selected, the toolbar keeps the filtered view and only hides the toggle', async () => {
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

        // Turn the filter on FIRST, while nothing is selected.
        await userEvent.click(
          screen.getByRole('button', { name: /solo sin clasificar/i }),
        );
        expect(screen.queryByText('Clasificada')).not.toBeInTheDocument();
        expect(screen.getByText('Sin clasificar 1')).toBeInTheDocument();

        // Select a row from the now-filtered view.
        await userEvent.click(screen.getByLabelText(/Seleccionar fila 2/i));

        // The toggle hides (P2-A) but the filtered view is untouched — the
        // previously-hidden "Clasificada" row does NOT reappear.
        expect(
          screen.queryByRole('button', { name: /solo sin clasificar/i }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Clasificada')).not.toBeInTheDocument();
        expect(screen.getByText('Sin clasificar 1')).toBeInTheDocument();
        expect(screen.getByText('Sin clasificar 2')).toBeInTheDocument();

        // Clearing the selection restores the toggle, still pressed (ON) —
        // the filter state was never touched by the fix.
        await userEvent.click(
          screen.getByRole('button', { name: /limpiar selección/i }),
        );
        const toggle = screen.getByRole('button', {
          name: /solo sin clasificar/i,
        });
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText('Clasificada')).not.toBeInTheDocument();
      });

      it('restores the progress text and bar once the selection is cleared', async () => {
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
        expect(
          screen.queryByText(/de 2 clasificadas/i),
        ).not.toBeInTheDocument();

        await userEvent.click(
          screen.getByRole('button', { name: /limpiar selección/i }),
        );

        expect(screen.getByText(/de 2 clasificadas/i)).toBeInTheDocument();
        expect(container.querySelector('[data-progreso-fill]')).not.toBeNull();
      });

      it('does not introduce an aria-live region to announce the collapse', async () => {
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

        expect(container.querySelector('[aria-live]')).toBeNull();
      });

      it('the shared Bucket/Categoría column header is unaffected by the collapse (contract: column headers untouched)', async () => {
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

        const header = container.querySelector('[data-columnas-header]');
        expect(header).not.toBeNull();
        expect(header).toHaveTextContent('Bucket');
        expect(header).toHaveTextContent('Categoría');
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

      // Round-9 critique P1 fix 2: the master checkbox already sits inside a
      // full `<label>` that also contains its visible text ("Seleccionar
      // todas las visibles (N)") — clicking that label already toggles the
      // checkbox, so the fix here is a `min-h-6` floor on THAT label (24 CSS
      // px height) rather than a second, nested `<label>` around the bare
      // input (nested `<label>` elements are invalid HTML and can double-fire
      // toggle events). The checkbox's own visual glyph stays size-4.
      it("round-9 P1 fix 2: the master checkbox's wrapping label enforces a min-h-6 (24px) hit target", () => {
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
        expect(master.className).toContain('size-4');

        const hitTarget = master.closest('label');
        expect(hitTarget).not.toBeNull();
        expect(hitTarget?.className).toContain('min-h-6');
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

      // Superseded by design critique round-8's P2-A fix: this scenario
      // used to select a row, THEN click "Solo sin clasificar" to hide it
      // while keeping it selected. P2-A hides that TOGGLE BUTTON the
      // instant a selection exists (see the toolbar-distill describe block
      // above), so a selection can no longer be hidden by a *toggle-
      // triggered* filter change — the filter can only be flipped while
      // nothing is selected. That narrower claim is covered by "P2-A
      // reconciliation: if the filter is already active..." above, which
      // reaches the filtered-view-with-a-selection state through the only
      // toggle-based path still open: filter first, select second.
      //
      // A second path to the SAME hidden-but-selected state survives P2-A
      // untouched: with the filter already ON, select a visible row, then
      // classify THAT row via its own per-row `<CampoSelect>` (FilaRevision
      // never disables its selects based on `selected` — see
      // `FilaRevision.tsx`). The edit updates `edits` externally, so on the
      // next render `filasVisibles` filters the row out while it remains in
      // `seleccionados`. Covered below: "individual per-row edit can hide a
      // selected row from a filtered view".
    });
  });

  // ── P2-A gap found in review: edit-triggered hide (not toggle-triggered) ──
  describe('individual per-row edit can hide a selected row from a filtered view', () => {
    it('classifying a selected row via its own per-row select removes it from the "Solo sin clasificar" view but leaves it selected — and a later bulk apply overwrites that row\'s categoría too (current behavior, pinned — see report for the flag)', async () => {
      const onEditChangeSpy = vi.fn();

      // Stateful harness: PreviewMuestra is a controlled component (`edits`
      // comes from a prop), so exercising "classify via the per-row select,
      // then see the filtered view react" needs something that actually
      // feeds `onEditChange` back into `edits` on the next render — a plain
      // `vi.fn()` alone (as every other test in this file uses) can't do
      // that. This wrapper does the minimum: mirror `onEditChange` into
      // local state AND into `onEditChangeSpy`, so assertions can inspect
      // exactly what was called, in order, while the DOM reacts for real.
      function Harness() {
        const [edits, setEdits] = useState<ReadonlyMap<number, string | null>>(
          new Map(),
        );
        return (
          <PreviewMuestra
            banco="BancoEstado"
            filas={[
              unaFilaPreview({
                rowIndex: 0,
                descripcion: 'Sin clasificar 1',
                sugerido: null,
              }),
              unaFilaPreview({
                rowIndex: 1,
                descripcion: 'Sin clasificar 2',
                sugerido: null,
              }),
            ]}
            resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
            edits={edits}
            onEditChange={(rowIndex, categoriaId) => {
              onEditChangeSpy(rowIndex, categoriaId);
              setEdits((prev) => new Map(prev).set(rowIndex, categoriaId));
            }}
            catalogo={unCatalogo()}
          />
        );
      }

      render(<Harness />);

      // Filter ON first — the only path that keeps the toggle reachable.
      await userEvent.click(
        screen.getByRole('button', { name: /solo sin clasificar/i }),
      );

      // Select BOTH rows.
      await userEvent.click(screen.getByLabelText(/Seleccionar fila 1/i));
      await userEvent.click(screen.getByLabelText(/Seleccionar fila 2/i));
      expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();

      // Classify row 1 (Fila 1 / rowIndex 0) via ITS OWN per-row select —
      // not the bulk toolbar, not the (now-hidden) filter toggle.
      await userEvent.selectOptions(
        screen.getByLabelText(/Fila 1: bucket/i),
        'Necesidades',
      );
      await userEvent.selectOptions(
        screen.getByLabelText(/Fila 1: categoría/i),
        'cat-nec-1',
      );
      expect(onEditChangeSpy).toHaveBeenCalledWith(0, 'cat-nec-1');

      // The still-ON filter now hides row 1 — it's classified.
      expect(screen.queryByText('Sin clasificar 1')).not.toBeInTheDocument();
      expect(screen.getByText('Sin clasificar 2')).toBeInTheDocument();

      // It is STILL selected: the count pill counts the raw `seleccionados`
      // Set (2), not the currently-visible count (1) — the hidden row is
      // not silently dropped from the selection.
      expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();

      // The master "select all visible" checkbox recomputes to the ONE
      // now-visible selectable row (Fila 2), which IS selected.
      const master = screen.getByLabelText(
        /seleccionar la visible \(1\)/i,
      ) as HTMLInputElement;
      expect(master.checked).toBe(true);

      // Bulk-applying now re-applies the toolbar's categoría to BOTH
      // selected rows — including row 1, which the user just classified
      // individually with a DIFFERENT categoría. This is CURRENT behavior:
      // `handleAplicarBulk` iterates the raw `seleccionados` Set, not
      // `seleccionablesVisibles`, so a hidden-but-selected row is not
      // excluded. Pinned deliberately, not endorsed — flagged in the report
      // as a plausible UX trap (an individual classification can be
      // silently overwritten by a bulk apply the user can no longer see
      // includes that row) rather than changed unilaterally here.
      const categoriaToolbar = screen.getByLabelText(/categoría para aplicar/i);
      await userEvent.selectOptions(categoriaToolbar, 'cat-des-1');
      await userEvent.click(
        screen.getByRole('button', { name: /aplicar a 2 seleccionadas/i }),
      );

      expect(onEditChangeSpy.mock.calls).toEqual([
        [0, 'cat-nec-1'], // individual per-row classification
        [0, 'cat-des-1'], // bulk apply OVERWRITES it
        [1, 'cat-des-1'], // bulk apply on the other selected row
      ]);
    });
  });
});
