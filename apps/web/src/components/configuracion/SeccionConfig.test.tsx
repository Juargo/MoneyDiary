import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeccionConfig, SUPERFICIE_SECCION } from './SeccionConfig';

/**
 * `SeccionConfig` is the one surface primitive `/configuracion` was missing.
 * Every other screen in this app already contains its content on the
 * `rounded-lg border border-border bg-card` surface (`ListaIngestas.tsx:293`,
 * `SubirCartola.tsx:885`, `GrupoMovimientos.tsx:99`, `SemaforoHeroCard.tsx:47`);
 * Configuración was the only one rendering naked sections stacked in a flat
 * column, so it read as a different product.
 *
 * jsdom does no layout, so these assertions cover only what is checkable
 * here: the heading LEVEL and its single visual treatment (the defect being
 * fixed is three sibling `h2`s rendered at two different sizes, which made
 * the screen-reader outline and the visual outline disagree), plus the
 * surface class literal. Real spacing is a browser-only check.
 */
describe('SeccionConfig', () => {
  it('renders the title as an h2 — every section is a peer of every other', () => {
    render(<SeccionConfig titulo="Cuenta de Google">contenido</SeccionConfig>);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Cuenta de Google' }),
    ).toBeInTheDocument();
  });

  it('renders children inside the section', () => {
    render(
      <SeccionConfig titulo="Sesión">
        <button type="button">Cerrar sesión</button>
      </SeccionConfig>,
    );

    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument();
  });

  it('renders the optional description, and omits the <p> entirely when absent', () => {
    const { rerender } = render(
      <SeccionConfig
        titulo="Sesión"
        descripcion="Cerrás la sesión en este dispositivo."
      >
        contenido
      </SeccionConfig>,
    );
    expect(
      screen.getByText('Cerrás la sesión en este dispositivo.'),
    ).toBeInTheDocument();

    rerender(<SeccionConfig titulo="Sesión">contenido</SeccionConfig>);
    expect(
      screen.queryByText('Cerrás la sesión en este dispositivo.'),
    ).not.toBeInTheDocument();
  });

  it('gives every section the same surface treatment — no per-call-site drift', () => {
    render(<SeccionConfig titulo="Sesión">contenido</SeccionConfig>);

    const seccion = screen
      .getByRole('heading', { level: 2, name: 'Sesión' })
      .closest('section');
    expect(seccion?.className).toContain(SUPERFICIE_SECCION);
  });

  /**
   * `--radius: 0rem` (`index.css:150`) is a deliberate decision of this
   * design system: `rounded-lg` resolves to `var(--radius)` = 0. The class
   * is kept because it is the app-wide literal for "container edge" — if the
   * radius token ever moves, every surface moves together. `rounded-xl`
   * (`calc(var(--radius) + 4px)` = 4px) would silently opt this one screen
   * out of that decision, which is exactly what shadcn's stock `ui/card.tsx`
   * does — the reason this file exists instead of a `<Card>` import.
   */
  it('uses the app-wide radius literal, never the +4px rounded-xl of the stock shadcn card', () => {
    expect(SUPERFICIE_SECCION).toContain('rounded-lg');
    expect(SUPERFICIE_SECCION).not.toContain('rounded-xl');
  });
});
