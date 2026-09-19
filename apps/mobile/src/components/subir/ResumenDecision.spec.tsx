/**
 * ResumenDecision spec — Phase 5 RED (design.md, MOB-PRV-03/11).
 *
 * Naming deviation from tasks.md (recorded there too, same as PR4's
 * `FilaRevisionMobile.spec.tsx`): this repo's mobile tests use `*.spec.tsx`,
 * not `*.test.tsx`.
 *
 * No screen consumer yet (Phase 6 wires the `decidiendo` state); tested in
 * isolation.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { ResumenDecision } from './ResumenDecision';
import type { CatalogoNombresEstado } from '../../domain/agrupar-preview-por-categoria';

const RESUMEN = { totalFilas: 40, duplicadosDetectados: 5, nuevas: 35 };

describe('ResumenDecision', () => {
  it('renders the resumen values (MOB-PRV-03)', async () => {
    await render(
      <ResumenDecision
        resumen={RESUMEN}
        onSubirTalCual={jest.fn()}
        onRevisar={jest.fn()}
        onDescartar={jest.fn()}
      />,
    );

    expect(screen.getByText('40')).toBeOnTheScreen();
    expect(screen.getByText('5')).toBeOnTheScreen();
    expect(screen.getByText('35')).toBeOnTheScreen();
  });

  it('renders all three actions with matching accessible labels (MOB-PRV-03/11)', async () => {
    await render(
      <ResumenDecision
        resumen={RESUMEN}
        onSubirTalCual={jest.fn()}
        onRevisar={jest.fn()}
        onDescartar={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Subir tal cual' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Revisar y editar' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeOnTheScreen();
  });

  it('renders the "nada se ha guardado" and "clasificar no es obligatorio" copy (issue #742)', async () => {
    await render(
      <ResumenDecision
        resumen={RESUMEN}
        onSubirTalCual={jest.fn()}
        onRevisar={jest.fn()}
        onDescartar={jest.fn()}
      />,
    );

    expect(
      screen.getByText(
        'Nada se ha guardado aún. Revisa las filas y confirma para importar.',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Clasificar ahora no es obligatorio: puedes cambiar la categoría de cualquier movimiento cuando quieras.',
      ),
    ).toBeOnTheScreen();
  });

  it('cartola-decision-agrupada: with no filas passed, renders no grouped summary heading (default empty array)', async () => {
    await render(
      <ResumenDecision
        resumen={RESUMEN}
        onSubirTalCual={jest.fn()}
        onRevisar={jest.fn()}
        onDescartar={jest.fn()}
      />,
    );

    expect(
      screen.queryByText('Movimientos por categoría'),
    ).not.toBeOnTheScreen();
  });

  it('cartola-decision-agrupada: renders the grouped summary (collapsed) when filas/catalogo are passed, with no editing control', async () => {
    const filas: readonly PreviewFilaDto[] = [
      {
        rowIndex: 0,
        fecha: '2026-07-15T00:00:00.000Z',
        descripcion: 'Supermercado Líder',
        cargo: '50000',
        abono: '0',
        esDuplicado: false,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
      },
    ];
    const catalogo: CatalogoNombresEstado = {
      tag: 'listo',
      nombrePorId: new Map([['cat-nec-1', 'Supermercado']]),
    };

    await render(
      <ResumenDecision
        resumen={RESUMEN}
        filas={filas}
        catalogo={catalogo}
        onSubirTalCual={jest.fn()}
        onRevisar={jest.fn()}
        onDescartar={jest.fn()}
      />,
    );

    expect(screen.getByText('Movimientos por categoría')).toBeOnTheScreen();
    expect(screen.getByText('Necesidades · Supermercado')).toBeOnTheScreen();
    // Collapsed by default — the row itself is not mounted.
    expect(screen.queryByText('Supermercado Líder')).not.toBeOnTheScreen();
    expect(screen.queryByRole('combobox')).not.toBeOnTheScreen();
  });

  it('calls onSubirTalCual when "Subir tal cual" is tapped', async () => {
    const onSubirTalCual = jest.fn();

    await render(
      <ResumenDecision
        resumen={RESUMEN}
        onSubirTalCual={onSubirTalCual}
        onRevisar={jest.fn()}
        onDescartar={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('decision-subir-tal-cual'));

    expect(onSubirTalCual).toHaveBeenCalledTimes(1);
  });

  it('calls onRevisar when "Revisar y editar" is tapped', async () => {
    const onRevisar = jest.fn();

    await render(
      <ResumenDecision
        resumen={RESUMEN}
        onSubirTalCual={jest.fn()}
        onRevisar={onRevisar}
        onDescartar={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('decision-revisar'));

    expect(onRevisar).toHaveBeenCalledTimes(1);
  });

  it('calls onDescartar when "Descartar" is tapped', async () => {
    const onDescartar = jest.fn();

    await render(
      <ResumenDecision
        resumen={RESUMEN}
        onSubirTalCual={jest.fn()}
        onRevisar={jest.fn()}
        onDescartar={onDescartar}
      />,
    );

    fireEvent.press(screen.getByTestId('decision-descartar'));

    expect(onDescartar).toHaveBeenCalledTimes(1);
  });
});
