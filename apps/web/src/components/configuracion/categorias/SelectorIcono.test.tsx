import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IconoCategoria } from '@/api/catalogo-constantes';
import { SelectorIcono } from './SelectorIcono';

/**
 * SelectorIcono.test.tsx (categoria-iconografia, ADR-045, CATICO-01/08,
 * design.md "UI", WCTG-04). A `fieldset`/`legend` "Icono (opcional)"
 * wrapping 26 native radios (25 allowlisted icons, order = `ICONOS_CATEGORIA`,
 * plus "Sin icono" FIRST) — native radios give arrow-key navigation for
 * free (verified empirically against this repo's jsdom+user-event setup:
 * both controlled-`checked` arrow-key roving and Space-to-select work with
 * zero extra wiring). Each option's accessible name is `ETIQUETA_ICONO`
 * (Spanish, human-readable), never the raw lucide kebab-case identifier —
 * this is the enforcement point for CATICO-08's picker half.
 */
describe('SelectorIcono', () => {
  it('renders a fieldset/legend with 26 radio options, "Sin icono" first, each with a Spanish accessible name (CATICO-08)', () => {
    render(<SelectorIcono name="icono" value={null} onChange={() => {}} />);

    expect(
      screen.getByRole('group', { name: 'Icono (opcional)' }),
    ).toBeInTheDocument();
    const opciones = screen.getAllByRole('radio');
    expect(opciones).toHaveLength(26);
    expect(opciones[0]).toHaveAccessibleName('Sin icono');
    // Human-readable label, never the raw lucide identifier (CATICO-08).
    expect(screen.getByRole('radio', { name: 'Hogar' })).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: 'house' }),
    ).not.toBeInTheDocument();
  });

  it('checks the option matching `value`, and none when value is an unrecognized icono', () => {
    render(<SelectorIcono name="icono" value="house" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Hogar' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Sin icono' })).not.toBeChecked();
  });

  it('clicking an option calls onChange with that icono value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectorIcono name="icono" value={null} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Hogar' }));

    expect(onChange).toHaveBeenCalledWith('house');
  });

  it('clicking "Sin icono" after a real value is selected calls onChange with null (clears the pick)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectorIcono name="icono" value="house" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Sin icono' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('ArrowRight moves focus and selection to the next option (native keyboard nav, WCTG-04)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectorIcono name="icono" value={null} onChange={onChange} />);

    screen.getByRole('radio', { name: 'Sin icono' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(
      screen.getByRole('radio', { name: 'Carrito de compras' }),
    ).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith('shopping-cart');
  });

  /**
   * Tab into the group (not `.focus()` on a specific radio, unlike the
   * ArrowRight case above) plus Space-to-select — the deferred case from
   * PR4's SelectorIcono validation: only ArrowRight nav was exercised there.
   * `value` is an unrecognized/retired name here (CATICO-06's "no match"
   * case, cast because `SelectorIcono` never validates membership at the
   * type level either), so NO radio starts checked — native radio-group tab
   * behavior lands Tab on the FIRST option in DOM order ("Sin icono",
   * CATICO-08) when none is checked, and Space then explicitly selects it.
   * Landing on an already-checked "Sin icono" (i.e. `value={null}`) would
   * make Space a no-op re-select and not actually exercise the "Space picks
   * the Tab-focused option" path this test exists to pin.
   */
  it('Tab entra al grupo de radios (ninguna marcada) y Space selecciona la opción enfocada (WCTG-04)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectorIcono
        name="icono"
        value={'icono-retirado' as IconoCategoria}
        onChange={onChange}
      />,
    );

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Sin icono' })).toHaveFocus();
    await user.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('disabled disables every radio option', () => {
    render(
      <SelectorIcono name="icono" value={null} onChange={() => {}} disabled />,
    );

    for (const opcion of screen.getAllByRole('radio')) {
      expect(opcion).toBeDisabled();
    }
  });
});
