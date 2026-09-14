import { render, screen, fireEvent, act } from '@testing-library/react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { MuestraAgrupadaMobile } from './MuestraAgrupadaMobile';
import type { CatalogoNombresEstado } from '../../domain/agrupar-preview-por-categoria';

/**
 * MuestraAgrupadaMobile (cartola-decision-agrupada, MOB-PRV-03) — the
 * read-only grouped accordion the `decidiendo` decision step shows.
 * Grouping itself is `agruparPreviewPorCategoria`'s job (own spec covers the
 * rules exhaustively); this suite covers the accordion: collapsed by
 * default, expand-on-press, headings with counts, and no editing control
 * anywhere (that stays exclusive to `ListaRevision`/`FilaRevisionMobile`,
 * mounted only after "Revisar y editar").
 */
function filaDePreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 0,
    fecha: '2026-07-15T00:00:00.000Z',
    descripcion: 'Supermercado Líder',
    cargo: '50000',
    abono: '0',
    esDuplicado: false,
    sugerido: null,
    ...overrides,
  };
}

const catalogoListo: CatalogoNombresEstado = {
  tag: 'listo',
  nombrePorId: new Map([
    ['cat-nec-1', 'Supermercado'],
    ['cat-des-1', 'Restaurantes'],
  ]),
};
const catalogoNoListo: CatalogoNombresEstado = { tag: 'no-listo' };

describe('MuestraAgrupadaMobile', () => {
  it('renders a heading and one collapsed group per (bucket, categoría)', async () => {
    const filaNec = filaDePreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaDes = filaDePreview({
      rowIndex: 1,
      descripcion: 'Restaurante Don Juan',
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
    });

    await render(
      <MuestraAgrupadaMobile
        filas={[filaNec, filaDes]}
        catalogo={catalogoListo}
      />,
    );

    expect(screen.getByText('Movimientos por categoría')).toBeOnTheScreen();
    const toggleNecesidades = screen.getByTestId(
      'decision-grupo-toggle-categoria::Necesidades::cat-nec-1',
    );
    const toggleDeseos = screen.getByTestId(
      'decision-grupo-toggle-categoria::Deseos::cat-des-1',
    );
    expect(toggleNecesidades.props.accessibilityState?.expanded).toBe(false);
    expect(toggleDeseos.props.accessibilityState?.expanded).toBe(false);
    expect(screen.getByText('Necesidades · Supermercado')).toBeOnTheScreen();
    expect(screen.getByText('Gustos · Restaurantes')).toBeOnTheScreen();
    // Collapsed: row content is not mounted at all.
    expect(screen.queryByText('Supermercado Líder')).not.toBeOnTheScreen();
  });

  it('shows the row count with singular/plural agreement', async () => {
    const fila1 = filaDePreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const fila2 = filaDePreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaDuplicada = filaDePreview({ rowIndex: 2, esDuplicado: true });

    await render(
      <MuestraAgrupadaMobile
        filas={[fila1, fila2, filaDuplicada]}
        catalogo={catalogoListo}
      />,
    );

    expect(screen.getByText('2 movimientos')).toBeOnTheScreen();
    expect(screen.getByText('1 movimiento')).toBeOnTheScreen();
  });

  it('expands a group on press, revealing its rows (fecha, descripción, cargo/abono) and no editing control', async () => {
    const fila = filaDePreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    await render(
      <MuestraAgrupadaMobile filas={[fila]} catalogo={catalogoListo} />,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByTestId(
          'decision-grupo-toggle-categoria::Necesidades::cat-nec-1',
        ),
      );
    });

    const toggleExpandido = screen.getByTestId(
      'decision-grupo-toggle-categoria::Necesidades::cat-nec-1',
    );
    expect(toggleExpandido.props.accessibilityState?.expanded).toBe(true);
    expect(screen.getByText('Supermercado Líder')).toBeOnTheScreen();
    expect(screen.getByText('2026-07-15')).toBeOnTheScreen();
    expect(screen.getByText('Cargo: $50.000')).toBeOnTheScreen();
    expect(screen.getByText('Abono: $0')).toBeOnTheScreen();
    expect(screen.queryByRole('combobox')).not.toBeOnTheScreen();
  });

  it('groups Ingreso rows on their own, headline without a "Sin categoría" suffix', async () => {
    const filaIngreso = filaDePreview({
      descripcion: 'ABONO SUELDO',
      cargo: '0',
      abono: '900000',
      sugerido: { bucket: 'Ingreso', categoriaId: null },
    });

    await render(
      <MuestraAgrupadaMobile filas={[filaIngreso]} catalogo={catalogoListo} />,
    );

    expect(screen.getByText('Ingreso')).toBeOnTheScreen();
    expect(screen.queryByText('Ingreso · Sin categoría')).not.toBeOnTheScreen();
  });

  it('groups unclassified rows under "Sin clasificar" and duplicates under "Duplicadas (no se importan)"', async () => {
    const filaSinClasificar = filaDePreview({ rowIndex: 0, sugerido: null });
    const filaDuplicada = filaDePreview({ rowIndex: 1, esDuplicado: true });

    await render(
      <MuestraAgrupadaMobile
        filas={[filaSinClasificar, filaDuplicada]}
        catalogo={catalogoListo}
      />,
    );

    expect(screen.getByText('Sin clasificar')).toBeOnTheScreen();
    expect(screen.getByText('Duplicadas (no se importan)')).toBeOnTheScreen();
  });

  it('with the catalog not loaded yet, still groups by bucket, showing "Categoría no disponible" — never blocking', async () => {
    const fila = filaDePreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    await render(
      <MuestraAgrupadaMobile filas={[fila]} catalogo={catalogoNoListo} />,
    );

    expect(
      screen.getByText('Necesidades · Categoría no disponible'),
    ).toBeOnTheScreen();
  });

  it('renders nothing when there are no filas', async () => {
    const { toJSON } = await render(
      <MuestraAgrupadaMobile filas={[]} catalogo={catalogoListo} />,
    );

    expect(toJSON()).toBeNull();
  });
});
