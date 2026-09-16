/**
 * SelectorIcono.spec.tsx (categoria-iconografia, ADR-045, PR6, task 6.2)
 *
 * Mirrors `apps/web/src/components/configuracion/categorias/SelectorIcono.test.tsx`'s
 * cases, adapted to this workspace's own `SelectorChips.tsx` radiogroup
 * convention (`accessibilityRole="radiogroup"`/`"radio"`,
 * `accessibilityState={{ checked }}`) instead of web's native `<input
 * type="radio">` fieldset — there is no keyboard-arrow-nav case here (a
 * mobile-native concept web's DOM radios get for free); presses are the
 * only input this component needs to cover.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ETIQUETA_ICONO } from '../iconos-categoria';
import { SelectorIcono } from './SelectorIcono';
import type { IconoCategoria } from '../../domain/catalogo-constantes';

describe('SelectorIcono (categoria-iconografia, PR6, CATICO-08, MCTG-02/03)', () => {
  it('renders 25 radio options with "Sin icono" first (D-05/CATICO-01 picker order)', async () => {
    await render(<SelectorIcono value={null} onChange={() => {}} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(25);
    expect(radios[0].props.accessibilityLabel).toBe('Sin icono');
  });

  it('exposes a human-readable Spanish accessibilityLabel per option, never the raw lucide id (CATICO-08)', async () => {
    await render(<SelectorIcono value={null} onChange={() => {}} />);

    expect(
      screen.getByRole('radio', { name: ETIQUETA_ICONO.bike }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'bike' })).toBeNull();
  });

  it('marks accessibilityState.checked on the selected option only', async () => {
    await render(<SelectorIcono value="bike" onChange={() => {}} />);

    expect(
      screen.getByRole('radio', { name: ETIQUETA_ICONO.bike }).props
        .accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      screen.getByRole('radio', { name: 'Sin icono' }).props.accessibilityState,
    ).toMatchObject({ checked: false });
  });

  it('an unrecognized value checks NO option (retired/unknown name resolves to no-match, D-04)', async () => {
    await render(
      <SelectorIcono
        value={'icono-retirado' as IconoCategoria}
        onChange={() => {}}
      />,
    );

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.props.accessibilityState).toMatchObject({
        checked: false,
      });
    }
  });

  it('pressing an option calls onChange with that icono value', async () => {
    const onChange = jest.fn();
    await render(<SelectorIcono value={null} onChange={onChange} />);

    fireEvent.press(screen.getByRole('radio', { name: ETIQUETA_ICONO.house }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('house');
  });

  it('pressing "Sin icono" over a selected value calls onChange with null (clear)', async () => {
    const onChange = jest.fn();
    await render(<SelectorIcono value="house" onChange={onChange} />);

    fireEvent.press(screen.getByRole('radio', { name: 'Sin icono' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('propagates disabled to every option', async () => {
    await render(<SelectorIcono value={null} onChange={() => {}} disabled />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.props.accessibilityState).toMatchObject({
        disabled: true,
      });
    }
  });
});
