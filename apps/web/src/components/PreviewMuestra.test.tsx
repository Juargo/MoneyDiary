import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreviewMuestra } from './PreviewMuestra';
import type { CatalogoEstado, PreviewFilaDto } from '@/api/types';

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

/**
 * Test helper (preview-acordeon-bucket T1): both accordion levels start
 * COLLAPSED now, so any test that needs a row's own controls or a
 * categoría's heading must first open its bucket (level 1) and, unless the
 * row lives directly on Ingreso's `filasDirectas` (no level 2), its
 * categoría (level 2) — pass only `nombreBucket` for Ingreso. Takes the
 * already-constructed `userEvent` instance so every call site shares one
 * pointer/clock state, like the rest of this suite.
 */
async function abrirGrupo(
  user: ReturnType<typeof userEvent.setup>,
  nombreBucket: string | RegExp,
  nombreCategoria?: string | RegExp,
) {
  await user.click(screen.getByRole('button', { name: nombreBucket }));
  if (nombreCategoria !== undefined) {
    await user.click(screen.getByRole('button', { name: nombreCategoria }));
  }
}

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
  it('round-9 P1: per-row bucket select shows "Gustos" text with "Deseos" value', async () => {
    const user = userEvent.setup();
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

    // Default fixture sugerido: Necesidades/cat-nec-1 — open both levels.
    await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

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

  // ── Two-level grouping: bucket → categoría (preview-acordeon-bucket T1,
  // extends preview-agrupacion-categoria T2) ───────────────────────────────
  describe('grouping by bucket, then categoría within it', () => {
    it('groups rows by bucket (level 1) then categoría within it (level 2), each with its own heading and the category icon', async () => {
      const user = userEvent.setup();
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

      // Supermercado carries an icon; Restaurantes keeps the fixture's
      // missing icono so the same render also pins the fallback glyph.
      const catalogoBase = unCatalogo();
      const catalogo: CatalogoEstado =
        catalogoBase.tag === 'listo'
          ? {
              ...catalogoBase,
              grupos: catalogoBase.grupos.map((grupo) => ({
                ...grupo,
                categorias: grupo.categorias.map((categoria) =>
                  categoria.id === 'cat-nec-1'
                    ? { ...categoria, icono: 'shopping-cart' }
                    : categoria,
                ),
              })),
            }
          : catalogoBase;

      const { container } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filas}
          resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={catalogo}
        />,
      );

      // Level 1 headings sit OUTSIDE the collapsible panel, so they are
      // reachable by role even while everything is collapsed.
      expect(
        screen.getByRole('heading', { level: 4, name: /^Necesidades ·/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 4, name: /^Gustos ·/ }),
      ).toBeInTheDocument();
      expect(container.querySelectorAll('[data-grupo-bucket]')).toHaveLength(2);
      expect(container.querySelectorAll('[data-grupo-categoria]')).toHaveLength(
        2,
      );

      // Level 2 headings only become reachable BY ROLE once their bucket is open.
      await abrirGrupo(user, /^Necesidades ·/);
      await abrirGrupo(user, /^Gustos ·/);

      const grupoSupermercado = screen.getByRole('heading', {
        level: 5,
        name: /^Supermercado ·/,
      });
      const grupoRestaurantes = screen.getByRole('heading', {
        level: 5,
        name: /^Restaurantes ·/,
      });
      // Each categoría heading carries its own glyph. Match the lucide
      // class, not any aria-hidden svg: the heading also holds the accordion
      // chevron, which would satisfy a generic query with no badge at all.
      expect(
        grupoSupermercado.querySelector('svg.lucide-shopping-cart'),
      ).toBeInTheDocument();
      expect(
        grupoRestaurantes.querySelector('svg.lucide-tag'),
      ).toBeInTheDocument();
    });

    it('an Ingreso row groups alone under a plain "Ingreso" bucket heading, no level 2', async () => {
      const user = userEvent.setup();
      const filas = [unaFilaIngreso({ rowIndex: 0, descripcion: 'sueldo' })];

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
      // No level-2 heading at all for Ingreso.
      expect(
        screen.queryByRole('heading', { level: 5 }),
      ).not.toBeInTheDocument();

      // Opening the bucket shows its row DIRECTLY, no categoría accordion in between.
      await abrirGrupo(user, /^Ingreso ·/);
      expect(screen.getByText('sueldo')).toBeVisible();
    });

    it('a row with no sugerido goes to the trailing "Revisar" group, not dropped — no synthetic "Sin categoría" heading', async () => {
      const user = userEvent.setup();
      const filas = [
        unaFilaPreview({
          rowIndex: 0,
          sugerido: null,
          descripcion: 'sin sugerido',
        }),
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

      // The classified row's bucket AND a trailing "Revisar" heading render
      // — no "Sin categoría" heading of any kind for the unplaceable row.
      expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(2);
      expect(
        screen.getByRole('heading', { level: 4, name: /^Necesidades ·/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 4, name: /^Revisar ·/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: /sin categoría/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('sin sugerido')).not.toBeVisible();

      // Opening it shows the row DIRECTLY, no categoría heading in between.
      await abrirGrupo(user, /^Revisar ·/);
      expect(screen.getByText('sin sugerido')).toBeVisible();
      expect(
        screen.queryByRole('heading', { level: 5 }),
      ).not.toBeInTheDocument();
    });

    it('rows inside a categoría are ordered by fecha ascending, regardless of file order', () => {
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

      // `data-descripcion` is queried directly (not by role/visibility), so
      // it reads DOM order even while the categoría panel stays collapsed.
      const descripciones = Array.from(
        container.querySelectorAll('[data-descripcion]'),
      ).map((el) => el.textContent);
      expect(descripciones).toEqual(['temprana', 'tardía']);
    });

    it("editing a row's category (merged edit) keeps it in its ORIGINAL bucket/categoría until reload", async () => {
      const user = userEvent.setup();
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

      // Still grouped under the ORIGINAL bucket — no "Gustos" bucket exists.
      expect(
        screen.getByRole('heading', { level: 4, name: /^Necesidades ·/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 4, name: /^Gustos ·/ }),
      ).not.toBeInTheDocument();

      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

      const grupoOriginal = screen
        .getByRole('heading', { level: 5, name: /^Supermercado ·/ })
        .closest('div[data-grupo-categoria]');
      expect(grupoOriginal).not.toBeNull();
      expect(
        within(grupoOriginal as HTMLElement).getByText('reclasificada'),
      ).toBeInTheDocument();
      // But the row's own select DOES show the merged (edited) value.
      const categoriaSelect = screen.getByLabelText(/Fila 1: categoría/i);
      expect((categoriaSelect as HTMLSelectElement).value).toBe('cat-des-1');
    });
  });

  // ── "Revisar" trailing entry (preview-acordeon-bucket T2, review
  // warnings 1-2): rows the accordion cannot place (`sugerido: null`, or an
  // unrecognized bucket) — never visible in the normal flow (the API always
  // sends a known bucket), only when a row actually needs it. ─────────────
  describe('"Revisar" entry for rows the accordion cannot place (T2)', () => {
    it('does NOT render a "Revisar" heading when every row has a recognized sugerido', () => {
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[
            unaFilaPreview({
              sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
            }),
          ]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      expect(
        screen.queryByRole('heading', { name: /^Revisar/ }),
      ).not.toBeInTheDocument();
    });

    it('shows a "Revisar" heading with the row count, and opening it reveals the rows\' own selects, for a row with an unrecognized bucket', async () => {
      const user = userEvent.setup();
      const filaBucketDesconocido = unaFilaPreview({
        rowIndex: 0,
        descripcion: 'bucket raro',
        sugerido: { bucket: 'Otro', categoriaId: 'cat-cualquiera' },
      });

      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[filaBucketDesconocido]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const encabezadoRevisar = screen.getByRole('heading', {
        level: 4,
        name: /^Revisar · 1 movimiento$/,
      });
      expect(encabezadoRevisar).toBeInTheDocument();
      expect(screen.queryByText('bucket raro')).not.toBeVisible();

      await abrirGrupo(user, /^Revisar ·/);

      expect(screen.getByText('bucket raro')).toBeVisible();
      // Fully interactive, like any other row — its own bucket/categoría
      // selects are reachable so the user can classify it.
      expect(screen.getByLabelText(/Fila 1: grupo/i)).toBeInTheDocument();
    });

    it('re-run moving the focused row into "Revisar" (a still-collapsed, previously nonexistent group) still restores focus to its trigger', async () => {
      // FilaRevision only renders its "+" trigger once its OWN bucket
      // `<select>` (`bucketUI`) has a value — seeded, in priority order, from
      // the catalog group owning the MERGED categoriaId (edits win), or else
      // `sugerido.bucket`. A row whose `sugerido` becomes `null` has neither
      // on its own, so this scenario needs an EDIT that keeps a real,
      // catalog-resolvable categoriaId across the re-run (a user who already
      // reclassified the row before the backend stopped being able to
      // classify it) — otherwise the trigger would never render on either
      // side of the move, and the test would prove nothing about focus.
      const user = userEvent.setup();
      const filaClasificada = unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      });
      const edits = new Map<number, string | null>([[0, 'cat-nec-1']]);

      const { rerender } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[filaClasificada]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={edits}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

      const trigger = screen.getByRole('button', {
        name: /nueva categoría para fila 1/i,
      });
      trigger.focus();
      expect(trigger).toHaveFocus();

      // A re-run drops this row's SERVER sugerido entirely (e.g. the backend
      // can no longer classify it) — since grouping keys off `sugerido`, not
      // the merged edit, its whole subtree moves into a BRAND NEW,
      // never-opened "Revisar" group, even though the row still shows the
      // edited categoría via its own select.
      rerender(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[{ ...filaClasificada, sugerido: null }]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={edits}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      const triggerEnRevisar = screen.getByRole('button', {
        name: /nueva categoría para fila 1/i,
      });
      expect(triggerEnRevisar).toHaveFocus();
      expect(triggerEnRevisar).toBeVisible();
      expect(
        screen.getByRole('heading', { level: 4, name: /^Revisar ·/ }),
      ).toBeInTheDocument();
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

  describe('two-level accordion (preview-acordeon-bucket T1): both levels collapsed by default', () => {
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

    it('names each bucket heading with its row count, singular at 1', () => {
      renderDosGrupos();

      expect(
        screen.getByRole('heading', {
          level: 4,
          name: /^Necesidades · 2 movimientos/,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', {
          level: 4,
          name: /^Gustos · 1 movimiento$/,
        }),
      ).toBeInTheDocument();
    });

    it('names each categoría heading with its row count once its bucket is open', async () => {
      const user = userEvent.setup();
      renderDosGrupos();

      await abrirGrupo(user, /^Necesidades ·/);
      await abrirGrupo(user, /^Gustos ·/);

      expect(
        screen.getByRole('heading', {
          level: 5,
          name: /^Supermercado · 2 movimientos/,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', {
          level: 5,
          name: /^Restaurantes · 1 movimiento$/,
        }),
      ).toBeInTheDocument();
    });

    it('starts with BOTH levels collapsed — a drill-down accordion never opens itself', () => {
      renderDosGrupos();

      // Only bucket triggers are reachable by role at all (categoría
      // triggers live inside the still-hidden bucket panel).
      const togglesAbiertos = screen.queryAllByRole('button', {
        expanded: true,
      });
      expect(togglesAbiertos).toHaveLength(0);
      const togglesCerrados = screen.getAllByRole('button', {
        expanded: false,
      });
      expect(togglesCerrados).toHaveLength(2); // one per bucket
      // Rows stay MOUNTED (hidden, not removed) behind the collapsed panel.
      expect(screen.getByText('A')).not.toBeVisible();
    });

    it('opening a bucket reveals its categorías, which stay collapsed themselves', async () => {
      const user = userEvent.setup();
      renderDosGrupos();

      await abrirGrupo(user, /^Necesidades ·/);

      const categoriaToggle = screen.getByRole('button', {
        name: /^Supermercado ·/,
      });
      expect(categoriaToggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText('A')).not.toBeVisible();
      // The sibling bucket is unaffected.
      expect(screen.getByRole('button', { name: /^Gustos ·/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('opening a bucket then its categoría reveals rows; collapsing the bucket hides the categoría and its rows; the sibling bucket is untouched', async () => {
      const user = userEvent.setup();
      renderDosGrupos();

      const bucketToggle = screen.getByRole('button', {
        name: /^Necesidades ·/,
      });
      await user.click(bucketToggle);
      expect(bucketToggle).toHaveAttribute('aria-expanded', 'true');

      const categoriaToggle = screen.getByRole('button', {
        name: /^Supermercado ·/,
      });
      await user.click(categoriaToggle);
      expect(categoriaToggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('A')).toBeVisible();
      expect(screen.getByText('B')).toBeVisible();

      // Collapsing the BUCKET hides the categoría panel too (rows stay
      // mounted, hidden, not removed — per-row state survives).
      await user.click(bucketToggle);
      expect(bucketToggle).toHaveAttribute('aria-expanded', 'false');
      const panelBucket = document.getElementById(
        bucketToggle.getAttribute('aria-controls') ?? '',
      );
      expect(panelBucket).not.toBeNull();
      expect(panelBucket).toHaveAttribute('hidden');
      expect(screen.getByText('A')).not.toBeVisible();

      // The sibling bucket (Deseos) was never touched.
      expect(screen.getByRole('button', { name: /^Gustos ·/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      );

      // Reopening the bucket restores the categoría's own OPEN state (its
      // own Set entry was never cleared) — rows are visible again without
      // re-clicking the categoría toggle.
      await user.click(bucketToggle);
      expect(bucketToggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('A')).toBeVisible();
    });
  });

  // ── Focus continuity across a group re-render (T2 review S3,
  // PreviewMuestra.tsx:206-213) ─────────────────────────────────────────
  //
  // This behavior is ALREADY implemented (the positive case is also
  // exercised end-to-end in `SubirCartola.test.tsx`, "focus continuity
  // across a preview re-run"); these two tests pin it at the component
  // level, including the negative case that was previously untested
  // anywhere: a deliberate blur to `<body>` must not be undone by a later
  // render.
  describe('focus continuity across a group re-render (S3)', () => {
    function unaFilaConTrigger(overrides: Partial<PreviewFilaDto> = {}) {
      return unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
        ...overrides,
      });
    }

    it('a focused trigger keeps focus after a re-render moves its row to another (still-collapsed) bucket/categoría', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[unaFilaConTrigger()]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      // The row starts under Necesidades/Supermercado — both levels open
      // collapsed by default, so its trigger must be reached the same way
      // any other test reaches a row's controls.
      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

      const trigger = screen.getByRole('button', {
        name: /nueva categoría para fila 1/i,
      });
      trigger.focus();
      expect(trigger).toHaveFocus();

      // The row's own SERVER SUGGESTION changes bucket · categoría — since
      // grouping keys off `sugerido` (component docblock), this moves the
      // row's whole subtree to a DIFFERENT bucket's/categoría's `<ul>` (a
      // different React parent), unmounting/remounting the "+" trigger even
      // though its `data-fila-trigger` (rowIndex) never changes. The
      // destination bucket/categoría (Deseos/Restaurantes) was NEVER opened
      // before, so it starts collapsed — the focus-continuity effect must
      // expand both before the trigger can regain focus.
      rerender(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[
            unaFilaConTrigger({
              sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
            }),
          ]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      expect(
        screen.getByRole('button', { name: /nueva categoría para fila 1/i }),
      ).toHaveFocus();
      // The destination panels are visibly OPEN, not just focusable —
      // confirms the effect expanded them rather than reaching into a
      // hidden subtree.
      expect(
        screen.getByRole('button', { name: /nueva categoría para fila 1/i }),
      ).toBeVisible();
    });

    it('a user who deliberately blurs to <body> does NOT get focus pulled back to the trigger by a later re-render', async () => {
      const user = userEvent.setup();
      const fila = unaFilaConTrigger();
      const props = {
        banco: 'BancoEstado',
        filas: [fila],
        resumen: { totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 },
        onEditChange: vi.fn(),
        catalogo: unCatalogo(),
      } as const;

      const { rerender } = render(
        <PreviewMuestra {...props} edits={new Map()} />,
      );

      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

      const trigger = screen.getByRole('button', {
        name: /nueva categoría para fila 1/i,
      });
      trigger.focus();
      expect(trigger).toHaveFocus();

      // A render while the trigger is genuinely focused, with the row
      // staying in the SAME group (no remount) — this is what makes
      // `PreviewMuestra` remember rowIndex 0 as "the row that had focus",
      // exactly like a real edit-driven re-render would.
      rerender(<PreviewMuestra {...props} edits={new Map()} />);
      expect(trigger).toHaveFocus();

      // The user now deliberately moves focus away to <body> (e.g. Escape,
      // or clicking outside) with NO React render in between.
      trigger.blur();
      expect(document.activeElement).toBe(document.body);

      // A later, unrelated re-render (an `edits` change, row stays in the
      // same group) must not undo that deliberate blur.
      const edits = new Map<number, string | null>([[0, 'cat-des-1']]);
      rerender(<PreviewMuestra {...props} edits={edits} />);

      expect(document.activeElement).toBe(document.body);
    });
  });

  // S4 (preview-acordeon-sugerencias): the S3 tests above move a focused row
  // between two categoría-bearing buckets, and into a brand-new "Revisar"
  // group. Neither exercises `ubicarFila`'s OTHER "direct rows, no
  // categoría" branch — `GrupoBucket.filasDirectas`, which only ever holds
  // Ingreso rows — nor the cleanup path for a row that disappears entirely.
  describe('focus continuity — Ingreso destination and a vanished focused row (S4)', () => {
    it('a re-run moving the focused row into a still-collapsed Ingreso bucket expands only that bucket (no categoría level); Ingreso rows render no trigger, so nothing is left to refocus', async () => {
      const user = userEvent.setup();
      const fila = unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      });

      const { rerender } = render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[fila]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);
      const trigger = screen.getByRole('button', {
        name: /nueva categoría para fila 1/i,
      });
      trigger.focus();
      expect(trigger).toHaveFocus();

      // The row's own SERVER SUGGESTION becomes Ingreso — grouping keys off
      // `sugerido` (component docblock), so the row's whole subtree moves
      // into a BRAND NEW, never-opened Ingreso entry (`GrupoBucket` with
      // `filasDirectas`, no categoría level — the same "direct rows" shape
      // `filasDirectasDeGrupo` (S1) gives Revisar). `esFilaIngreso`
      // (FilaRevision) reads that SAME `sugerido.bucket`, so the row also
      // stops rendering its "+" trigger entirely (Ingreso rows show no
      // controls at all) — there is no trigger left anywhere to refocus.
      rerender(
        <PreviewMuestra
          banco="BancoEstado"
          filas={[
            { ...fila, sugerido: { bucket: 'Ingreso', categoriaId: null } },
          ]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      // The destination bucket still auto-expands (the focus-continuity
      // effect locates the row via `ubicarFila`'s `filasDirectas` branch and
      // opens its still-collapsed bucket) even though nothing inside it can
      // ever be focused.
      const panelIngreso = document.querySelector(
        '[data-grupo-bucket="Ingreso"]',
      );
      expect(panelIngreso).toHaveAttribute('data-abierto', 'true');
      const filaIngreso = screen.getByText(
        /se clasifica como ingreso autom.ticamente/i,
      );
      expect(filaIngreso).toBeVisible();
      // No categoría level exists for Ingreso: the row sits directly in the
      // bucket panel, not inside a categoría wrapper. Structural check, so it
      // does not depend on which heading level categoría headers use.
      expect(
        filaIngreso.closest('[data-grupo-bucket="Ingreso"]'),
      ).not.toBeNull();
      expect(filaIngreso.closest('[data-grupo-categoria]')).toBeNull();
      // And no trigger renders for an income row.
      expect(
        screen.queryByRole('button', { name: /nueva categoría/i }),
      ).not.toBeInTheDocument();
    });

    it('clears the pending-focus ref when the focused row disappears from the next preview response, so a LATER unrelated re-render does not steal focus onto a different row that reuses the same rowIndex', async () => {
      const user = userEvent.setup();
      const props = {
        banco: 'BancoEstado',
        onEditChange: vi.fn(),
        catalogo: unCatalogo(),
      } as const;

      const filaOriginal = unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      });

      const { rerender } = render(
        <PreviewMuestra
          {...props}
          filas={[filaOriginal]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
        />,
      );

      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);
      const trigger = screen.getByRole('button', {
        name: /nueva categoría para fila 1/i,
      });
      trigger.focus();
      expect(trigger).toHaveFocus();

      // Row 0 disappears entirely from the next preview response (e.g. a
      // dedup pass dropped it) — replaced by an unrelated row under a
      // brand-new "Revisar" group.
      const filaSinRelacion = unaFilaPreview({ rowIndex: 99, sugerido: null });
      rerender(
        <PreviewMuestra
          {...props}
          filas={[filaSinRelacion]}
          resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
          edits={new Map()}
        />,
      );

      // The vanished row's trigger unmounted — the browser drops focus to
      // <body>, with nothing left to restore it to.
      expect(document.activeElement).toBe(document.body);

      // A LATER, unrelated re-render reintroduces a BRAND NEW row that
      // happens to reuse rowIndex 0 (e.g. the next preview run after fixing
      // the file) under a bucket/categoría NEVER manually opened — nobody
      // asked for focus on it, so a stale pending ref must not silently pull
      // focus (or auto-expand its panel) onto it.
      const filaNueva = unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
      });
      rerender(
        <PreviewMuestra
          {...props}
          filas={[filaSinRelacion, filaNueva]}
          resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
          edits={new Map()}
        />,
      );

      expect(document.activeElement).toBe(document.body);
      expect(
        document.querySelector('[data-grupo-bucket="Deseos"]'),
      ).toHaveAttribute('data-abierto', 'false');
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

      // Both rows share the default fixture sugerido (Necesidades/cat-nec-1)
      // — one bucket/categoría to open reaches both.
      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

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

      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

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
    // Pre-#778 this fixture also carried a `sugerido: null` "pending" row —
    // dropped since `agruparFilasPorBucketYCategoria` no longer renders it
    // at all (dead per #778, see that module's docblock); the remaining
    // contract is that Ingreso and classified rows render together.
    const filasConIngreso = [
      unaFilaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      }),
      unaFilaIngreso({ rowIndex: 1 }),
    ];

    it('renders income rows in the list alongside classified rows, each under its own bucket', async () => {
      const user = userEvent.setup();
      render(
        <PreviewMuestra
          banco="BancoEstado"
          filas={filasConIngreso}
          resumen={{ totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 }}
          edits={new Map()}
          onEditChange={vi.fn()}
          catalogo={unCatalogo()}
        />,
      );

      await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);
      await abrirGrupo(user, /^Ingreso ·/);

      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      // "Ingreso" also appears as that row's own BUCKET heading — the
      // row-level marker this test targets is the ONE inside its <li>.
      const filaIngreso = screen
        .getByText('Ingreso', { selector: 'li span' })
        .closest('li');
      expect(filaIngreso).not.toBeNull();
    });
  });
});
