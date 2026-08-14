import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoSelect } from './CampoSelect';

/**
 * CampoSelect.test.tsx (US-043, design.md §1/D-08, WCTG-02, WCFG-12) —
 * `configuracion/` gana su primer `<select>`. Mismo idioma de
 * `CampoTexto.test.tsx`: alcanzable por `getByLabelText`, refleja
 * `required`/`disabled` como atributos nativos, `onChange` recibe el nuevo
 * `value`. Las opciones llegan YA etiquetadas (`{value, label}`) — el
 * lookup `ETIQUETA_BUCKET` (A1) vive en el call site (`NuevaCategoriaForm`),
 * no dentro de este componente genérico.
 */
const OPCIONES_BUCKET = [
  { value: 'Necesidades', label: 'Necesidades' },
  { value: 'Deseos', label: 'Gustos' },
  { value: 'Ahorro', label: 'Ahorro' },
];

describe('CampoSelect', () => {
  it('el select es alcanzable por su label (WCFG-12)', () => {
    render(
      <CampoSelect
        label="Bucket (obligatorio)"
        value="Necesidades"
        onChange={() => {}}
        options={OPCIONES_BUCKET}
      />,
    );

    expect(screen.getByLabelText('Bucket (obligatorio)')).toHaveValue(
      'Necesidades',
    );
  });

  it('renderiza cada opción con su label mostrado, no con su value crudo (A1: Deseos se muestra como Gustos)', () => {
    render(
      <CampoSelect
        label="Bucket (obligatorio)"
        value="Necesidades"
        onChange={() => {}}
        options={OPCIONES_BUCKET}
      />,
    );

    const select = screen.getByLabelText('Bucket (obligatorio)');
    expect(screen.getByRole('option', { name: 'Gustos' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Deseos' }),
    ).not.toBeInTheDocument();
    expect(select).toContainHTML('value="Deseos"');
  });

  it('llama onChange con el nuevo value al elegir una opción', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CampoSelect
        label="Bucket (obligatorio)"
        value="Necesidades"
        onChange={onChange}
        options={OPCIONES_BUCKET}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Bucket (obligatorio)'),
      'Gustos',
    );

    expect(onChange).toHaveBeenCalledWith('Deseos');
  });

  it('required se refleja como atributo nativo', () => {
    render(
      <CampoSelect
        label="Bucket (obligatorio)"
        value="Necesidades"
        onChange={() => {}}
        options={OPCIONES_BUCKET}
        required
      />,
    );
    expect(screen.getByLabelText('Bucket (obligatorio)')).toBeRequired();
  });

  it('disabled deshabilita el select', () => {
    render(
      <CampoSelect
        label="Bucket (obligatorio)"
        value="Necesidades"
        onChange={() => {}}
        options={OPCIONES_BUCKET}
        disabled
      />,
    );
    expect(screen.getByLabelText('Bucket (obligatorio)')).toBeDisabled();
  });
});
