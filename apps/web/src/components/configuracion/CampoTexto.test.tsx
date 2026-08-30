import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampoTexto } from './CampoTexto';

describe('CampoTexto', () => {
  it('el input es alcanzable por su label (WCFG-12/CA-05)', () => {
    render(<CampoTexto label="Nombre" value="Ana" onChange={() => {}} />);

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
  });

  it('llama onChange con el nuevo valor al escribir', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CampoTexto label="Nombre" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Nombre'), 'X');

    expect(onChange).toHaveBeenCalledWith('X');
  });

  it('type por defecto es text; puede pedirse email o password', () => {
    const { rerender } = render(
      <CampoTexto label="Email" value="" onChange={() => {}} type="email" />,
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');

    rerender(
      <CampoTexto
        label="Password actual"
        value=""
        onChange={() => {}}
        type="password"
      />,
    );
    expect(screen.getByLabelText('Password actual')).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('required se refleja como atributo nativo', () => {
    render(
      <CampoTexto
        label="Password actual"
        value=""
        onChange={() => {}}
        required
      />,
    );
    expect(screen.getByLabelText('Password actual')).toBeRequired();
  });

  it('disabled deshabilita el input', () => {
    render(<CampoTexto label="Nombre" value="" onChange={() => {}} disabled />);
    expect(screen.getByLabelText('Nombre')).toBeDisabled();
  });

  it('type="date" acepta max (US-060, sustituye el par label+input a mano)', () => {
    render(
      <CampoTexto
        label="Fecha"
        value="2026-08-29"
        onChange={() => {}}
        type="date"
        max="2026-08-29"
      />,
    );
    const input = screen.getByLabelText('Fecha');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('max', '2026-08-29');
  });

  it('inputMode y pattern pasan al input nativo (US-060, campo Monto)', () => {
    render(
      <CampoTexto
        label="Monto"
        value=""
        onChange={() => {}}
        inputMode="numeric"
        pattern="[0-9]*"
      />,
    );
    const input = screen.getByLabelText('Monto');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('pattern', '[0-9]*');
  });
});
