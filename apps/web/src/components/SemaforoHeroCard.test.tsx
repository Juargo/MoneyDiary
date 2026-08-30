import { screen } from '@testing-library/react';
import { SemaforoHeroCard } from './SemaforoHeroCard';
import { renderConRouter } from '@/test/router-harness';

/**
 * SemaforoHeroCard — mock-driven redesign (2026-08-30): neutral card, ring
 * indicator, rebranded labels (Muy Saludable / Saludable / En peligro,
 * single table in `lib/semaforo-estilos.ts`), tinted verdict box carrying
 * `construirVeredictoSemaforo`'s copy, and a decorative worst→best scale.
 * Navigation/a11y behavior is unchanged from the previous design.
 */
describe('SemaforoHeroCard', () => {
  const veredictoRojo = {
    lead: 'Tu veredicto es En peligro.',
    detalle:
      'Aunque Necesidades y Ahorro están en rango, Gustos queda fuera de rango y define el estado global de este mes siguiendo la lógica de mayor riesgo.',
  };

  it.each([
    ['verde', 'Semáforo: Muy Saludable'],
    ['amarillo', 'Semáforo: Saludable'],
    ['rojo', 'Semáforo: En peligro'],
  ])(
    'renders estado "%s" with its rebranded label at display scale',
    async (estado, titulo) => {
      renderConRouter(
        <SemaforoHeroCard
          estadoGlobal={estado}
          periodo="2026-07"
          veredicto={null}
        />,
      );
      const encabezado = await screen.findByText(titulo);
      expect(encabezado).toBeInTheDocument();
      expect(encabezado.className).toMatch(/\btext-4xl\b/);
    },
  );

  it('renders the verdict box with bold lead + detail in the estado chip pair', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="rojo"
        periodo="2026-07"
        veredicto={veredictoRojo}
      />,
    );

    const lead = await screen.findByText('Tu veredicto es En peligro.');
    expect(lead.tagName).toBe('STRONG');
    const caja = lead.closest('p');
    expect(caja?.textContent).toContain('la lógica de mayor riesgo');
    // Estado tint lives in the BOX (chip fill + AA -foreground pair), not
    // on the card surface anymore.
    expect(caja?.className).toMatch(/\bbg-semaforo-rojo\b/);
    expect(caja?.className).toMatch(/\btext-semaforo-rojo-foreground\b/);
  });

  it('omits the verdict box when no veredicto is provided', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="verde"
        periodo="2026-07"
        veredicto={null}
      />,
    );
    await screen.findByText('Semáforo: Muy Saludable');
    expect(screen.queryByText(/Tu veredicto es/)).not.toBeInTheDocument();
  });

  it('keeps the card surface neutral (the estado wash moved into the verdict box)', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="rojo"
        periodo="2026-07"
        veredicto={veredictoRojo}
      />,
    );
    const tarjeta = await screen.findByTestId('semaforo-global');
    expect(tarjeta.className).toMatch(/\bbg-card\b/);
    expect(tarjeta.className).not.toMatch(/\bbg-semaforo-/);
  });

  it('renders the worst→best scale as decoration (aria-hidden), filling only the active segment', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="rojo"
        periodo="2026-07"
        veredicto={veredictoRojo}
      />,
    );
    const tarjeta = await screen.findByTestId('semaforo-global');
    const escala = tarjeta.querySelector('[aria-hidden="true"].grid');
    expect(escala).not.toBeNull();
    expect(escala?.textContent).toBe('En peligroSaludableMuy Saludable');

    const barras = escala?.querySelectorAll('.h-2') ?? [];
    expect(barras).toHaveLength(3);
    expect(barras[0].className).toMatch(/\bbg-semaforo-rojo-foreground\b/);
    expect(barras[1].className).toMatch(/\bbg-border\b/);
    expect(barras[2].className).toMatch(/\bbg-border\b/);
  });

  it('navigates to /semaforo carrying the current periodo, with an accessible name combining verdict and period (a11y)', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="verde"
        periodo="2026-07"
        veredicto={null}
      />,
    );

    const link = await screen.findByRole('link', {
      name: /Semáforo: Muy Saludable.*julio 2026/,
    });
    expect(link).toBeInTheDocument();

    await link.click();
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  it('keeps the ring indicator decorative (aria-hidden) so the label text is the only carrier of meaning', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="rojo"
        periodo="2026-07"
        veredicto={null}
      />,
    );
    const tarjeta = await screen.findByTestId('semaforo-global');
    const anillo = tarjeta.querySelector('span[aria-hidden="true"]');
    expect(anillo).not.toBeNull();
    expect(anillo?.className).toMatch(/\bbg-semaforo-rojo\b/);
    expect(anillo?.querySelector('.border-4')?.className).toMatch(
      /\bborder-semaforo-rojo-foreground\b/,
    );
  });

  it('carries the semaforo-global testid so smoke anchors survive the redesign', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="verde"
        periodo="2026-07"
        veredicto={null}
      />,
    );
    expect(await screen.findByTestId('semaforo-global')).toBeInTheDocument();
  });

  it('is keyboard-operable with Space (WG5-12 precedent from SemaforoTag)', async () => {
    renderConRouter(
      <SemaforoHeroCard
        estadoGlobal="verde"
        periodo="2026-07"
        veredicto={null}
      />,
    );
    const link = await screen.findByRole('link', {
      name: /Semáforo: Muy Saludable/,
    });
    link.focus();
    expect(link).toHaveFocus();

    const evento = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(evento);

    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  describe('estadoGlobal null (SIN_DATOS)', () => {
    it('renders "Sin datos" calmly instead of coercing into a known color', async () => {
      renderConRouter(
        <SemaforoHeroCard
          estadoGlobal={null}
          periodo="2026-07"
          veredicto={null}
        />,
      );
      expect(await screen.findByText('Sin datos')).toBeInTheDocument();
    });

    it('renders the empty-state supporting line', async () => {
      renderConRouter(
        <SemaforoHeroCard
          estadoGlobal={null}
          periodo="2026-07"
          veredicto={null}
        />,
      );
      expect(
        await screen.findByText('Carga una cartola para conocer tu mes'),
      ).toBeInTheDocument();
    });

    it('renders a real CTA button linking to /subir (fixes: empty state without CTA)', async () => {
      renderConRouter(
        <SemaforoHeroCard
          estadoGlobal={null}
          periodo="2026-07"
          veredicto={null}
        />,
      );
      const cta = await screen.findByRole('link', { name: 'Subir cartola' });
      expect(cta).toBeInTheDocument();

      await cta.click();
      expect(await screen.findByTestId('subir-sentinel')).toBeInTheDocument();
    });

    it('does not render a /semaforo verdict link when there is no verdict yet', async () => {
      renderConRouter(
        <SemaforoHeroCard
          estadoGlobal={null}
          periodo="2026-07"
          veredicto={null}
        />,
      );
      await screen.findByText('Sin datos');
      expect(
        screen.queryByRole('link', { name: /^Semáforo:/ }),
      ).not.toBeInTheDocument();
    });

    it('keeps a neutral bg-card surface with no estado tint or scale', async () => {
      renderConRouter(
        <SemaforoHeroCard
          estadoGlobal={null}
          periodo="2026-07"
          veredicto={null}
        />,
      );
      const tarjeta = await screen.findByTestId('semaforo-global');
      expect(tarjeta.className).toMatch(/\bbg-card\b/);
      expect(tarjeta.className).not.toMatch(/\bbg-semaforo-/);
      expect(tarjeta.querySelector('.grid')).toBeNull();
    });

    it('still carries the semaforo-global testid in the empty state', async () => {
      renderConRouter(
        <SemaforoHeroCard
          estadoGlobal={null}
          periodo="2026-07"
          veredicto={null}
        />,
      );
      expect(await screen.findByTestId('semaforo-global')).toBeInTheDocument();
    });
  });
});
