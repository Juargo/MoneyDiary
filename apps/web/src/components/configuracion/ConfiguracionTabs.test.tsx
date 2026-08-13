import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfiguracionTabs } from './ConfiguracionTabs';

describe('ConfiguracionTabs', () => {
  it('Perfil lleva aria-current="page" — CA-02', () => {
    render(<ConfiguracionTabs />);

    const perfil = screen.getByText('Perfil');
    expect(perfil).toHaveAttribute('aria-current', 'page');
  });

  it('Categorías es un botón inerte, mismo tratamiento que el placeholder de NavItem', () => {
    render(<ConfiguracionTabs />);

    const categorias = screen.getByRole('button', { name: 'Categorías' });
    expect(categorias).toBeDisabled();
    expect(categorias).toHaveAttribute('aria-disabled', 'true');
    expect(categorias).toHaveAttribute('type', 'button');
  });
});
