import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreviewMuestra } from './PreviewMuestra';
import type { PreviewFilaDto } from '@/api/types';

// crear-categoria-desde-preview PR3: opening a row's creation form mounts
// `NuevaCategoriaDesdeFilaForm`, which owns a `useCrearCategoria()` mutation
// — only the tests that actually open a form need this ancestor.
function crearWrapperQuery() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}
// Fix 8: import shared fixtures; local factory functions removed
import {
  unaFilaIngreso,
  unaFilaPreview,
  unCatalogo,
} from '@/test-utils/preview-fixtures';

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

    // Fix 2: bucket select should show Deseos selected (derived from edited categoriaId)
    const bucketSelect = screen.getByLabelText(/Fila 1: grupo/i);
    expect(bucketSelect).toHaveValue('Deseos');
  });

  // Round-9 critique P1 fix 1: per-row bucket select shows "Gustos" as the
  // option text while the underlying option value stays "Deseos"
  // (ETIQUETA_BUCKET applied by `construirOpcionesBucket`).
  it('round-9 P1: per-row bucket select shows "Gustos" text with "Deseos" value', () => {
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

    const bucketSelect = screen.getByLabelText(/Fila 1: grupo/i);
    const gustosOption = within(bucketSelect).getByRole('option', {
      name: 'Gustos',
    }) as HTMLOptionElement;

    expect(gustosOption.value).toBe('Deseos');
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

  // ── Grouping by bucket · categoría (preview-agrupacion-categoria T2) ─────
  describe('grouping by bucket · categoría', () => {
    it('groups rows by the (bucket, categoriaId) of their sugerido, one heading + <ul> per group, with the category icon', () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          descripcion: 'A',
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
        unaFilaPreview({
          rowIndex: 1,
          descripcion: 'B',
          sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
        }),
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

      const grupos = container.querySelectorAll('[data-grupo-categoria]');
      expect(grupos).toHaveLength(2);

      const grupoNecesidades = screen.getByRole('heading', {
        level: 4,
        name: /Necesidades · Supermercado/,
      });
      const grupoGustos = screen.getByRole('heading', {
        level: 4,
        name: /Gustos · Restaurantes/,
      });
      expect(grupoNecesidades).toBeInTheDocument();
      expect(grupoGustos).toBeInTheDocument();
      // Each group heading carries the category's icon badge.
      expect(
        grupoNecesidades.querySelector('svg[aria-hidden="true"]'),
      ).toBeInTheDocument();
    });

    it('an Ingreso row groups alone under a plain "Ingreso" heading, no "· Ingreso" suffix', () => {
      const filas = [unaFilaIngreso({ rowIndex: 0 })];

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
        screen.getByRole('heading', { level: 4, name: /^Ingreso ·/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: /Ingreso · Ingreso/ }),
      ).not.toBeInTheDocument();
    });

    it('rows with no sugerido group under "Sin categoría", placed LAST regardless of file order', () => {
      const filas = [
        unaFilaPreview({ rowIndex: 0, sugerido: null, descripcion: 'sin' }),
        unaFilaPreview({
          rowIndex: 1,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
          descripcion: 'con categoría',
        }),
      ];

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const headings = screen
        .getAllByRole('heading', { level: 4 })
        .map((h) => h.textContent ?? '');
      expect(headings[headings.length - 1]).toMatch(/^Sin categoría/);
    });

    it('rows inside a group are ordered by fecha ascending, regardless of file order', () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          fecha: '2026-07-20T00:00:00.000Z',
          descripcion: 'tardía',
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
        unaFilaPreview({
          rowIndex: 1,
          fecha: '2026-07-01T00:00:00.000Z',
          descripcion: 'temprana',
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
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

      const descripciones = Array.from(
        container.querySelectorAll('[data-descripcion]'),
      ).map((el) => el.textContent);
      expect(descripciones).toEqual(['temprana', 'tardía']);
    });

    it("editing a row's category (merged edit) keeps it in its ORIGINAL sugerido group until reload", () => {
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          descripcion: 'reclasificada',
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        }),
      ];

      const { rerender } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      // The row moves to Deseos/cat-des-1 via an edit — simulating what
      // `onEditChange` would cause upstream (SubirCartola owns `edits`).
      const edits = new Map<number, string | null>([[0, 'cat-des-1']]);
      rerender(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={edits}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      // Still grouped under the ORIGINAL sugerido (Necesidades · Supermercado)…
      const grupoOriginal = screen
        .getByRole('heading', { level: 4, name: /Necesidades · Supermercado/ })
        .closest('div[data-grupo-categoria]');
      expect(grupoOriginal).not.toBeNull();
      expect(
        within(grupoOriginal as HTMLElement).getByText('reclasificada'),
      ).toBeInTheDocument();
      // …no "Gustos · Restaurantes" group was created for it.
      expect(
        screen.queryByRole('heading', { name: /Gustos · Restaurantes/ }),
      ).not.toBeInTheDocument();
      // But the row's own select DOES show the merged (edited) value.
      const categoriaSelect = screen.getByLabelText(/Fila 1: categoría/i);
      expect((categoriaSelect as HTMLSelectElement).value).toBe('cat-des-1');
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
        name: /ayuda: qué es un grupo/i,
      });
      expect(link).toHaveAttribute('href', '/ayuda#ayuda-glosario');
    });
  });

  // ── Round-10 critique P3 fix 4: inline "bucket" definition ───────────────
  describe('inline bucket definition (round-10 P3)', () => {
    it('shows a one-line definition of "bucket" at point of use, without a tooltip/popover', () => {
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

      expect(
        screen.getByText(
          /el 50\/30\/20 al que va el gasto \(necesidades, gustos o ahorro\)/i,
        ),
      ).toBeInTheDocument();
      // Plain visible text, not gated behind hover/focus interaction —
      // there is no [title]/[aria-describedby] tooltip mechanism to probe.
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
    });

    it('keeps the Ayuda link alongside the inline definition (definition for the flow, link for depth)', () => {
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

      expect(
        screen.getByText(/el 50\/30\/20 al que va el gasto/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /ayuda: qué es un grupo/i }),
      ).toBeInTheDocument();
    });
  });

  describe('group accordion (polish pass, re-keyed by categoría in T2)', () => {
    const dosGrupos = () => [
      unaFilaPreview({
        rowIndex: 0,
        descripcion: 'A',
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      }),
      unaFilaPreview({
        rowIndex: 1,
        descripcion: 'B',
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      }),
      unaFilaPreview({
        rowIndex: 2,
        descripcion: 'C',
        sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
      }),
    ];

    function renderDosGrupos() {
      return render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={dosGrupos()}
          resumen={{ totalFilas: 3, duplicadosDetectados: 0, nuevas: 3 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );
    }

    it('names each group heading with its row count, singular at 1', () => {
      renderDosGrupos();

      expect(
        screen.getByRole('heading', {
          level: 4,
          name: /Necesidades · Supermercado · 2 movimientos/,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', {
          level: 4,
          name: /Gustos · Restaurantes · 1 movimiento$/,
        }),
      ).toBeInTheDocument();
    });

    it('starts with every group expanded — a review flow never hides work by default', () => {
      renderDosGrupos();

      const toggles = screen.getAllByRole('button', { expanded: true });
      expect(toggles).toHaveLength(2);
      expect(screen.getByText('A')).toBeVisible();
    });

    it('collapsing a group hides ONLY its rows and flips aria-expanded; the other group is untouched', async () => {
      const user = userEvent.setup();
      renderDosGrupos();

      const toggle = screen.getByRole('button', {
        name: /Necesidades · Supermercado · 2 movimientos/,
      });
      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      // Rows of the collapsed group leave the accessibility tree…
      expect(screen.getByText('A')).not.toBeVisible();
      expect(screen.getByText('B')).not.toBeVisible();
      // …but stay mounted (hidden, not removed) so per-row state survives.
      const lista = document.getElementById(
        toggle.getAttribute('aria-controls') ?? '',
      );
      expect(lista).not.toBeNull();
      expect(lista).toHaveAttribute('hidden');
      // The sibling group is unaffected.
      expect(screen.getByText('C')).toBeVisible();

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('A')).toBeVisible();
    });
  });

  // crear-categoria-desde-preview PR3 (D-08/D-10, WEB-PRV-12): `filaCreando`
  // is ephemeral table UI state owned HERE (single value ⇒ "at most one
  // form open" falls out for free). `onCategoriaCreada`/`esDemo` are pure
  // pass-through to every `FilaRevision`.
  describe('"+" (Nueva categoría) orchestration state (filaCreando)', () => {
    it('at most one form is open across the table: opening a second row closes the first', async () => {
      const user = userEvent.setup();
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[
            unaFilaPreview({ rowIndex: 0, descripcion: 'A' }),
            unaFilaPreview({ rowIndex: 1, descripcion: 'B' }),
          ]}
          resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
        { wrapper: crearWrapperQuery() },
      );

      const filaA = screen.getByText('A').closest('li');
      const filaB = screen.getByText('B').closest('li');
      if (!filaA || !filaB) throw new Error('rows not found');

      await user.selectOptions(
        within(filaA).getByLabelText(/: grupo/i),
        'Necesidades',
      );
      await user.selectOptions(
        within(filaB).getByLabelText(/: grupo/i),
        'Necesidades',
      );

      await user.click(
        within(filaA).getByRole('button', { name: /nueva categoría/i }),
      );
      expect(
        within(filaA).getByRole('heading', { name: 'Nueva categoría' }),
      ).toBeInTheDocument();

      await user.click(
        within(filaB).getByRole('button', { name: /nueva categoría/i }),
      );
      expect(
        within(filaB).getByRole('heading', { name: 'Nueva categoría' }),
      ).toBeInTheDocument();
      expect(
        within(filaA).queryByRole('heading', { name: 'Nueva categoría' }),
      ).not.toBeInTheDocument();
    });

    it('esDemo and onCategoriaCreada pass through unchanged to every FilaRevision', async () => {
      const user = userEvent.setup();
      const onCategoriaCreada = vi.fn();
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[unaFilaPreview({ rowIndex: 0, descripcion: 'A' })]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
          esDemo
          onCategoriaCreada={onCategoriaCreada}
        />,
      );

      const fila = screen.getByText('A').closest('li');
      if (!fila) throw new Error('row not found');
      await user.selectOptions(
        within(fila).getByLabelText(/: grupo/i),
        'Necesidades',
      );

      const trigger = within(fila).getByRole('button', {
        name: /nueva categoría/i,
      });
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveAttribute('aria-describedby', 'demo-catalogo-nota');
    });
  });

  // ── Ingreso rows: settled by the server, rendered like any other row ────
  //
  // The backend classifies these as `{ Ingreso, null }` and the commit
  // refuses any overlay on them (`FilaRevision` renders no controls for
  // them — see that component's docblock). At this level the only
  // remaining contract is that income rows render in the list, in file
  // order, alongside classified and pending rows.
  describe('filas de ingreso', () => {
    const filasConIngreso = [
      unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      }),
      unaFilaPreview({ rowIndex: 1, sugerido: null }),
      unaFilaIngreso({ rowIndex: 2 }),
    ];

    it('renders income rows in the list alongside classified and pending rows', () => {
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasConIngreso}
          resumen={{ totalFilas: 3, duplicadosDetectados: 0, nuevas: 3 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      // T2: "Ingreso" now also appears as that row's own GROUP heading — the
      // row-level marker this test targets is the ONE inside its <li>.
      const filaIngreso = screen
        .getByText('Ingreso', { selector: 'li span' })
        .closest('li');
      expect(filaIngreso).not.toBeNull();
    });
  });
});
