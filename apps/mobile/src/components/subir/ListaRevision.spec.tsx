/**
 * ListaRevision spec — Phase 5 RED (design.md, MOB-PRV-05).
 *
 * Naming deviation from tasks.md (recorded there too, same as PR4's
 * `FilaRevisionMobile.spec.tsx`): this repo's mobile tests use `*.spec.tsx`,
 * not `*.test.tsx`.
 *
 * No screen consumer yet (Phase 6 wires `subir.tsx`); this component is
 * tested in isolation. `FlatList` only renders its initial batch (~10 items)
 * under jest, so the "every row" assertion (MOB-PRV-05) reads the `data`
 * prop directly rather than counting rendered DOM nodes (design.md Testing
 * Strategy).
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { ListaRevision } from './ListaRevision';

function filaDePreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 0,
    fecha: '2026-07-15T13:45:00.000Z',
    descripcion: 'Compra supermercado',
    cargo: '5000',
    abono: '0',
    esDuplicado: false,
    sugerido: { bucket: 'Necesidades', categoriaId: 'cat-arriendo' },
    ...overrides,
  };
}

function filas(cantidad: number): readonly PreviewFilaDto[] {
  return Array.from({ length: cantidad }, (_, indice) =>
    filaDePreview({ rowIndex: indice, descripcion: `Movimiento ${indice}` }),
  );
}

describe('ListaRevision', () => {
  it('passes every row to FlatList, not a paginated subset (MOB-PRV-05)', async () => {
    const todasLasFilas = filas(180);

    await render(
      <ListaRevision
        filas={todasLasFilas}
        categoriaNombrePorFila={new Map()}
        onAbrirFila={jest.fn()}
      />,
    );

    const lista = screen.getByTestId('revision-lista');
    expect(lista.props.data).toHaveLength(180);
    expect(lista.props.data[0]).toBe(todasLasFilas[0]);
    expect(lista.props.data[179]).toBe(todasLasFilas[179]);
  });

  it('resolves each rendered row categoría from categoriaNombrePorFila', async () => {
    const dosFilas = [
      filaDePreview({ rowIndex: 0, descripcion: 'Sin edición' }),
      filaDePreview({ rowIndex: 1, descripcion: 'Con edición' }),
    ];

    await render(
      <ListaRevision
        filas={dosFilas}
        categoriaNombrePorFila={new Map([[1, 'Arriendo']])}
        onAbrirFila={jest.fn()}
      />,
    );

    expect(screen.getByText('Sin categoría')).toBeOnTheScreen();
    expect(screen.getByText('Arriendo')).toBeOnTheScreen();
  });

  it('forwards a rendered row tap to onAbrirFila with its rowIndex', async () => {
    const onAbrirFila = jest.fn();
    const dosFilas = [
      filaDePreview({ rowIndex: 0 }),
      filaDePreview({ rowIndex: 1, descripcion: 'Fila editable' }),
    ];

    await render(
      <ListaRevision
        filas={dosFilas}
        categoriaNombrePorFila={new Map()}
        onAbrirFila={onAbrirFila}
      />,
    );

    fireEvent.press(screen.getByTestId('revision-fila-1'));

    expect(onAbrirFila).toHaveBeenCalledWith(1);
  });
});
