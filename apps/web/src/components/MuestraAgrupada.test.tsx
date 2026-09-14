import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MuestraAgrupada } from './MuestraAgrupada';
import {
  unaFilaIngreso,
  unaFilaPreview,
  unCatalogo,
} from '@/test-utils/preview-fixtures';

/**
 * MuestraAgrupada (cartola-decision-agrupada, WEB-PRV-19) — the read-only
 * grouped accordion the `decidiendo` decision step shows. Groups come from
 * `agruparPreviewPorCategoria` (own test suite covers the grouping rules
 * exhaustively); this suite covers the ACCORDION itself: collapsed by
 * default, expand-on-click, headings with counts, and that NO editing
 * control is ever rendered here (that stays exclusive to the review table,
 * `PreviewMuestra`/`FilaRevision`, mounted only after "Revisar y editar").
 */
describe('MuestraAgrupada', () => {
  const catalogo = unCatalogo();

  it('renders a heading and one group per (bucket, categoría), all collapsed by default', () => {
    const filaNec = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaDes = unaFilaPreview({
      rowIndex: 1,
      descripcion: 'Restaurante Don Juan',
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
    });

    render(<MuestraAgrupada filas={[filaNec, filaDes]} catalogo={catalogo} />);

    expect(
      screen.getByRole('heading', { name: 'Movimientos por categoría' }),
    ).toBeInTheDocument();

    const botonNecesidades = screen.getByRole('button', {
      name: /Necesidades · Supermercado/,
    });
    const botonDeseos = screen.getByRole('button', {
      name: /Gustos · Restaurantes/,
    });
    expect(botonNecesidades).toHaveAttribute('aria-expanded', 'false');
    expect(botonDeseos).toHaveAttribute('aria-expanded', 'false');

    // Collapsed: row description text is not rendered as visible content —
    // panel is `hidden`, not unmounted (a11y/testing-library still finds it
    // in the DOM, but `toBeVisible()` fails while `hidden` is set).
    expect(screen.getByText(filaNec.descripcion)).not.toBeVisible();
  });

  it('shows the row count in each group heading, singular/plural agreement', () => {
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
      screen.getByRole('button', { name: /· 2 movimientos/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Duplicadas.*· 1 movimiento\b/ }),
    ).toBeInTheDocument();
  });

  it('expands a group on click, revealing its rows (fecha, descripción, monto) and no editing control', async () => {
    const user = userEvent.setup();
    const fila = unaFilaPreview({
      rowIndex: 0,
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado Líder',
      cargo: '50000',
      abono: '0',
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    render(<MuestraAgrupada filas={[fila]} catalogo={catalogo} />);

    const boton = screen.getByRole('button', {
      name: /Necesidades · Supermercado/,
    });
    await user.click(boton);

    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Supermercado Líder')).toBeVisible();
    expect(screen.getByText('2026-07-15')).toBeVisible();
    expect(screen.getByText('-$50.000')).toBeVisible();

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Nueva categoría/i }),
    ).not.toBeInTheDocument();
  });

  it('groups Ingreso rows on their own, headline without a "Sin categoría" suffix', () => {
    const filaIngreso = unaFilaIngreso();

    render(<MuestraAgrupada filas={[filaIngreso]} catalogo={catalogo} />);

    expect(
      screen.getByRole('button', { name: /^Ingreso · 1 movimiento$/ }),
    ).toBeInTheDocument();
  });

  it('groups unclassified rows under "Sin clasificar" and duplicates under "Duplicadas (no se importan)"', () => {
    const filaSinClasificar = unaFilaPreview({ rowIndex: 0, sugerido: null });
    const filaDuplicada = unaFilaPreview({ rowIndex: 1, esDuplicado: true });

    render(
      <MuestraAgrupada
        filas={[filaSinClasificar, filaDuplicada]}
        catalogo={catalogo}
      />,
    );

    expect(
      screen.getByRole('button', { name: /^Sin clasificar/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Duplicadas \(no se importan\)/ }),
    ).toBeInTheDocument();
  });

  it('renders nothing when there are no filas', () => {
    const { container } = render(
      <MuestraAgrupada filas={[]} catalogo={catalogo} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
