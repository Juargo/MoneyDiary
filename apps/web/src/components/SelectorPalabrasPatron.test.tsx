import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectorPalabrasPatron } from './SelectorPalabrasPatron';

/**
 * SelectorPalabrasPatron.test.tsx (issue #745, patrón desde movimiento) —
 * the word-picking widget. Tests the INTERACTION's actual rendered
 * behaviour (button roles, `aria-pressed`, the literal preview text), not
 * just the underlying reducer (already covered in isolation by
 * `seleccion-contigua-palabras.test.ts`) — this file proves the reducer is
 * wired correctly to real button clicks and to the confirm payload.
 */
describe('SelectorPalabrasPatron', () => {
  it('renders one real button per word, none pressed initially, and the confirm action disabled', () => {
    render(
      <SelectorPalabrasPatron
        descripcion="NETFLIX.COM SANTIAGO CL"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    const botones = ['NETFLIX.COM', 'SANTIAGO', 'CL'].map((texto) =>
      screen.getByRole('button', { name: texto }),
    );
    for (const boton of botones) {
      expect(boton.tagName).toBe('BUTTON');
      expect(boton).toHaveAttribute('aria-pressed', 'false');
    }
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeDisabled();
  });

  it('clicking one word selects it and previews the exact literal substring', async () => {
    const user = userEvent.setup();
    render(
      <SelectorPalabrasPatron
        descripcion="NETFLIX.COM SANTIAGO CL"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'NETFLIX.COM' }));

    expect(screen.getByRole('button', { name: 'NETFLIX.COM' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText('«NETFLIX.COM»', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeEnabled();
  });

  it('clicking an adjacent word extends the contiguous range and confirms the joined literal substring (preserving the original separator)', async () => {
    const onConfirmar = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectorPalabrasPatron
        descripcion="UBER   EATS SANTIAGO"
        onConfirmar={onConfirmar}
        onCancelar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'UBER' }));
    await user.click(screen.getByRole('button', { name: 'EATS' }));

    expect(screen.getByRole('button', { name: 'UBER' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'EATS' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'SANTIAGO' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    // Exact separator preserved (three spaces), not normalized to one — this
    // is the payload actually sent to the API, so unlike the on-screen
    // preview (which HTML legitimately collapses visually) this assertion
    // must see the real three-space substring.
    expect(onConfirmar).toHaveBeenCalledExactlyOnceWith('UBER   EATS');
  });

  it('clicking a non-adjacent word resets the selection to just that word — the interaction makes a non-contiguous pick impossible, it never has to be rejected after the fact', async () => {
    const user = userEvent.setup();
    render(
      <SelectorPalabrasPatron
        descripcion="COMPRA SUPERMERCADO LIDER CENTRAL"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'COMPRA' }));
    await user.click(screen.getByRole('button', { name: 'LIDER' }));

    expect(screen.getByRole('button', { name: 'COMPRA' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'LIDER' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('«LIDER»', { exact: false })).toBeInTheDocument();
  });

  it('confirming calls onConfirmar with the exact built pattern text', async () => {
    const onConfirmar = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectorPalabrasPatron
        descripcion="NETFLIX.COM SANTIAGO CL"
        onConfirmar={onConfirmar}
        onCancelar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'NETFLIX.COM' }));
    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    expect(onConfirmar).toHaveBeenCalledExactlyOnceWith('NETFLIX.COM');
  });

  it('cancelling calls onCancelar without ever calling onConfirmar', async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectorPalabrasPatron
        descripcion="NETFLIX.COM SANTIAGO CL"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'NETFLIX.COM' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancelar).toHaveBeenCalledOnce();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('while pending, the confirm action stays disabled even with a valid selection', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SelectorPalabrasPatron
        descripcion="NETFLIX.COM SANTIAGO CL"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'NETFLIX.COM' }));
    rerender(
      <SelectorPalabrasPatron
        descripcion="NETFLIX.COM SANTIAGO CL"
        pending
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeDisabled();
  });
});
