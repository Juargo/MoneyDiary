import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('renders the requested type (e.g. date)', () => {
    render(<Input type="date" aria-label="Fecha" />);
    expect(screen.getByLabelText('Fecha')).toHaveAttribute('type', 'date');
  });

  it('applies the aria-invalid destructive styling grammar', () => {
    render(<Input aria-label="Monto" aria-invalid="true" />);
    const input = screen.getByLabelText('Monto');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toContain('aria-invalid:border-destructive');
    expect(input.className).toContain('aria-invalid:ring-destructive/20');
  });

  it('forwards a ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Nombre" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
