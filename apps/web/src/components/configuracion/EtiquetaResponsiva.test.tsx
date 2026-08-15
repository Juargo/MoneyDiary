import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EtiquetaResponsiva } from './EtiquetaResponsiva';

/**
 * EtiquetaResponsiva.test.tsx (US-063 D-03, WCTM-06) — mechanism only
 * (D-08): jsdom applies no Tailwind CSS, so every span below is "visible" to
 * jsdom regardless of viewport. What these tests prove is that the right
 * STRINGS land on the right literal-class spans for a given input shape —
 * never that a given band is actually visible at a real viewport width,
 * which is `e2e/list-surface.e2e.ts`'s job.
 */
describe('EtiquetaResponsiva', () => {
  it('a 3-band input emits three spans, each with the right class and string', () => {
    render(
      <EtiquetaResponsiva
        movil="Nueva categoría"
        tablet="Nueva"
        escritorio="Nueva categoría"
      />,
    );

    const spans = screen.getAllByText(/Nueva/);
    expect(spans).toHaveLength(3);

    const [movil, tablet, escritorio] = spans;
    expect(movil).toHaveClass('md:hidden');
    expect(movil).toHaveTextContent('Nueva categoría');
    expect(tablet).toHaveClass('hidden', 'md:inline', 'lg:hidden');
    expect(tablet).toHaveTextContent(/^Nueva$/);
    expect(escritorio).toHaveClass('hidden', 'lg:inline');
    expect(escritorio).toHaveTextContent('Nueva categoría');
  });

  it('a 2-band input (tablet omitted) emits only two spans — no empty third span', () => {
    render(<EtiquetaResponsiva movil="Agregar" escritorio="Agregar patrón" />);

    const spans = screen.getAllByText(/Agregar/);
    expect(spans).toHaveLength(2);

    const [movil, escritorio] = spans;
    expect(movil).toHaveClass('md:hidden');
    expect(movil).toHaveTextContent(/^Agregar$/);
    expect(escritorio).toHaveClass('hidden', 'md:inline');
    // The 2-band tablet/desktop-shared span must NOT carry lg:hidden — it
    // is meant to stay visible from `md` all the way up, not cut off at `lg`.
    expect(escritorio).not.toHaveClass('lg:hidden');
    expect(escritorio).toHaveTextContent('Agregar patrón');
  });

  it('the three genuinely distinct footer-note strings all render with their own band class', () => {
    render(
      <EtiquetaResponsiva
        movil="Toca una categoría para editarla o eliminarla."
        tablet="Eliminar en uso: advertencia, transacciones a Sin categoría."
        escritorio="Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría."
      />,
    );

    expect(
      screen.getByText('Toca una categoría para editarla o eliminarla.'),
    ).toHaveClass('md:hidden');
    expect(
      screen.getByText(
        'Eliminar en uso: advertencia, transacciones a Sin categoría.',
      ),
    ).toHaveClass('hidden', 'md:inline', 'lg:hidden');
    expect(
      screen.getByText(
        'Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría.',
      ),
    ).toHaveClass('hidden', 'lg:inline');
  });
});
