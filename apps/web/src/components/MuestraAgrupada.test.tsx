import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MuestraAgrupada } from './MuestraAgrupada';
import {
  unaFilaIngreso,
  unaFilaPreview,
  unCatalogo,
} from '@/test-utils/preview-fixtures';
import type { CatalogoEstado } from '@/api/types';

/**
 * MuestraAgrupada (resumen-acordeon-bucket, WEB-PRV-19) — the read-only
 * TWO-LEVEL accordion (bucket → categoría) the `decidiendo` decision step
 * shows, matching `PreviewMuestra`'s shape (WEB-PRV-20). Non-duplicate rows
 * come from `agruparFilasPorBucketYCategoria` (own test suite covers the
 * grouping rules exhaustively); this suite covers the ACCORDION itself: both
 * levels collapsed by default, expand-on-click, headings with counts, the
 * categoría icon badge, the Ingreso/Revisar/Duplicadas direct-row entries,
 * and that NO editing control is ever rendered here (that stays exclusive to
 * the review table, `PreviewMuestra`/`FilaRevision`, mounted only after
 * "Revisar y editar").
 */

/** Both accordion levels start collapsed — open bucket then (optionally) categoría. */
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

describe('MuestraAgrupada', () => {
  const catalogo = unCatalogo();

  it('level 1 shows only bucket headers, collapsed — no rows, no categoría headers visible', () => {
    const filaNec = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaDes = unaFilaPreview({
      rowIndex: 1,
      descripcion: 'Restaurante Don Juan',
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
    });

    const { container } = render(
      <MuestraAgrupada filas={[filaNec, filaDes]} catalogo={catalogo} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Movimientos por categoría' }),
    ).toBeInTheDocument();

    const botonNecesidades = screen.getByRole('heading', {
      level: 4,
      name: /^Necesidades ·/,
    });
    const botonDeseos = screen.getByRole('heading', {
      level: 4,
      name: /^Gustos ·/,
    });
    expect(botonNecesidades).toBeInTheDocument();
    expect(botonDeseos).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Necesidades ·/ }),
    ).toHaveAttribute('aria-expanded', 'false');

    // Level 1 is reachable, but nothing below it is: no categoría heading
    // (level 5) and no row text visible while both buckets are collapsed.
    expect(screen.queryByRole('heading', { level: 5 })).not.toBeInTheDocument();
    expect(screen.getByText(filaNec.descripcion)).not.toBeVisible();
    expect(container.querySelectorAll('[data-grupo-bucket]')).toHaveLength(2);
  });

  it('opening a bucket reveals its categoría headers with the specific icon and count', async () => {
    const user = userEvent.setup();
    const filaConIcono = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaSinIcono = unaFilaPreview({
      rowIndex: 1,
      descripcion: 'Restaurante Don Juan',
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
    });

    const catalogoBase = unCatalogo();
    const catalogoConIcono: CatalogoEstado =
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

    render(
      <MuestraAgrupada
        filas={[filaConIcono, filaSinIcono]}
        catalogo={catalogoConIcono}
      />,
    );

    await abrirGrupo(user, /^Necesidades ·/);
    await abrirGrupo(user, /^Gustos ·/);

    const grupoSupermercado = screen.getByRole('heading', {
      level: 5,
      name: /^Supermercado · 1 movimiento$/,
    });
    const grupoRestaurantes = screen.getByRole('heading', {
      level: 5,
      name: /^Restaurantes · 1 movimiento$/,
    });
    // Matches the lucide glyph class, not any aria-hidden svg — the heading
    // also holds the accordion chevron, which would satisfy a generic query
    // even with no badge at all.
    expect(
      grupoSupermercado.querySelector('svg.lucide-shopping-cart'),
    ).toBeInTheDocument();
    expect(
      grupoRestaurantes.querySelector('svg.lucide-tag'),
    ).toBeInTheDocument();
  });

  it('opening a categoría reveals its rows, date-ascending, and no editing control', async () => {
    const user = userEvent.setup();
    const filaTardia = unaFilaPreview({
      rowIndex: 0,
      fecha: '2026-07-20T00:00:00.000Z',
      descripcion: 'Supermercado Jumbo',
      cargo: '10000',
      abono: '0',
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaTemprana = unaFilaPreview({
      rowIndex: 1,
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado Líder',
      cargo: '50000',
      abono: '0',
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const { container } = render(
      <MuestraAgrupada
        filas={[filaTardia, filaTemprana]}
        catalogo={catalogo}
      />,
    );

    await abrirGrupo(user, /^Necesidades ·/, /^Supermercado ·/);

    expect(screen.getByText('Supermercado Líder')).toBeVisible();
    expect(screen.getByText('Supermercado Jumbo')).toBeVisible();
    expect(screen.getByText('2026-07-15')).toBeVisible();
    expect(screen.getByText('-$50.000')).toBeVisible();

    const descripciones = Array.from(container.querySelectorAll('li')).map(
      (li) => li.textContent,
    );
    expect(descripciones[0]).toContain('Supermercado Líder');
    expect(descripciones[1]).toContain('Supermercado Jumbo');

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Nueva categoría/i }),
    ).not.toBeInTheDocument();
  });

  // A categoriaId the summary cannot resolve (catalog loading, in error, or an
  // id missing from a loaded catalog) stays under its REAL bucket with the
  // fallback name and the badge's generic glyph — never a separate top-level
  // group, never dropped.
  it.each<[string, CatalogoEstado, string]>([
    ['catalog loading', { tag: 'cargando' }, 'cat-nec-1'],
    ['catalog in error', { tag: 'error' }, 'cat-nec-1'],
    ['stale id in a loaded catalog', unCatalogo(), 'cat-borrada'],
  ])(
    'unresolvable categoría (%s) nests under its bucket as "Categoría no disponible" with the generic glyph',
    async (_caso, catalogoCaso, categoriaId) => {
      const user = userEvent.setup();
      const fila = unaFilaPreview({
        rowIndex: 0,
        descripcion: 'Compra sin catálogo',
        sugerido: { bucket: 'Necesidades', categoriaId },
      });

      render(<MuestraAgrupada filas={[fila]} catalogo={catalogoCaso} />);

      expect(
        screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent),
      ).toEqual([expect.stringMatching(/^Necesidades · 1 movimiento/)]);

      await abrirGrupo(user, /^Necesidades ·/);
      const encabezado = screen.getByRole('heading', {
        level: 5,
        name: /^Categoría no disponible · 1 movimiento$/,
      });
      expect(encabezado.querySelector('svg.lucide-tag')).toBeInTheDocument();

      await abrirGrupo(user, /^Categoría no disponible ·/);
      expect(screen.getByText('Compra sin catálogo')).toBeVisible();
    },
  );

  it('an Ingreso row groups alone under a plain "Ingreso" heading, no level 2, rows direct', async () => {
    const user = userEvent.setup();
    const filaIngreso = unaFilaIngreso();

    render(<MuestraAgrupada filas={[filaIngreso]} catalogo={catalogo} />);

    expect(
      screen.getByRole('heading', {
        level: 4,
        name: /^Ingreso · 1 movimiento$/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 5 })).not.toBeInTheDocument();

    await abrirGrupo(user, /^Ingreso ·/);
    expect(screen.getByText(filaIngreso.descripcion)).toBeVisible();
  });

  it('a row the domain fn cannot place under a real bucket lands on the trailing "Revisar" entry', () => {
    const filaSinSugerido = unaFilaPreview({ rowIndex: 0, sugerido: null });

    render(<MuestraAgrupada filas={[filaSinSugerido]} catalogo={catalogo} />);

    expect(
      screen.getByRole('heading', {
        level: 4,
        name: /^Revisar · 1 movimiento$/,
      }),
    ).toBeInTheDocument();
  });

  it('omits "Revisar" entirely when every row lands on a real bucket', () => {
    const fila = unaFilaPreview({ rowIndex: 0 });

    render(<MuestraAgrupada filas={[fila]} catalogo={catalogo} />);

    expect(
      screen.queryByRole('heading', { name: /^Revisar/ }),
    ).not.toBeInTheDocument();
  });

  it('carves duplicate rows into a trailing "Duplicadas (no se importan)" entry with rows direct, excluded from their bucket', async () => {
    const user = userEvent.setup();
    const filaNormal = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaDuplicada = unaFilaPreview({
      rowIndex: 1,
      descripcion: 'Cargo repetido',
      esDuplicado: true,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    render(
      <MuestraAgrupada
        filas={[filaNormal, filaDuplicada]}
        catalogo={catalogo}
      />,
    );

    expect(
      screen.getByRole('heading', {
        level: 4,
        name: /^Necesidades · 1 movimiento$/,
      }),
    ).toBeInTheDocument();
    const encabezadoDuplicadas = screen.getByRole('heading', {
      level: 4,
      name: /^Duplicadas \(no se importan\) · 1 movimiento$/,
    });
    expect(encabezadoDuplicadas).toBeInTheDocument();

    await abrirGrupo(user, /^Duplicadas/);
    expect(screen.getByText('Cargo repetido')).toBeVisible();
  });

  it('omits "Duplicadas" entirely when there are no duplicates', () => {
    const fila = unaFilaPreview({ rowIndex: 0 });

    render(<MuestraAgrupada filas={[fila]} catalogo={catalogo} />);

    expect(
      screen.queryByRole('heading', { name: /^Duplicadas/ }),
    ).not.toBeInTheDocument();
  });

  it('singular/plural agreement in group headings', () => {
    const fila1 = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const fila2 = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaDuplicada = unaFilaPreview({ rowIndex: 2, esDuplicado: true });

    render(
      <MuestraAgrupada
        filas={[fila1, fila2, filaDuplicada]}
        catalogo={catalogo}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 4, name: /· 2 movimientos$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Duplicadas.*· 1 movimiento$/ }),
    ).toBeInTheDocument();
  });

  it('renders nothing when there are no filas', () => {
    const { container } = render(
      <MuestraAgrupada filas={[]} catalogo={catalogo} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
