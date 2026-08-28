import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandBlock } from './BrandBlock';

describe('BrandBlock', () => {
  it('renders the MoneyDiary wordmark and tagline', () => {
    render(<BrandBlock />);

    expect(screen.getByText('MoneyDiary')).toBeInTheDocument();
    expect(screen.getByText('Tu mes, un veredicto claro.')).toBeInTheDocument();
  });

  // ── fresh-review SUGGESTION: /login had no heading at all ────────────────

  it('renders the wordmark as an <h1> when asHeading is true (login context)', () => {
    render(<BrandBlock asHeading />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'MoneyDiary' }),
    ).toBeInTheDocument();
  });

  it('contributes no heading by default (Sidebar chrome, plain text)', () => {
    render(<BrandBlock />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
