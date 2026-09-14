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
import { ResumenDecision } from './ResumenDecision';

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
