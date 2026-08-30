import { screen } from '@testing-library/react';
import { SemaforoHeroCard } from './SemaforoHeroCard';
import { renderConRouter } from '@/test/router-harness';

/**
 * SemaforoHeroCard — design critique P0 fix (impeccable audit): the semáforo
 * is the product's core promise (PRODUCT.md principle 1, "the monthly
 * verdict comes first") but used to render as a text-xs pill buried in the
 * chart card's header, upstaged by IngresoCard's 4xl mint hero. This card
 * becomes the FIRST card on the dashboard, at IngresoCard's own display
 * scale (`text-4xl`), so the verdict wins the squint test.
 *
 * Reuses `resolverEstiloSemaforo` (no forked style table, `lib/semaforo-estilos.ts`
 * stays the single source of estado → (label, cara, className)).
 */
describe('SemaforoHeroCard', () => {
  it('renders "Semáforo: Verde" at display scale (spec: verdict wins the squint test)', async () => {
    renderConRouter(
      <SemaforoHeroCard estadoGlobal="verde" periodo="2026-07" />,
    );

    const veredicto = await screen.findByText('Semáforo: Verde');
    expect(veredicto).toBeInTheDocument();
    expect(veredicto.className).toMatch(/\btext-4xl\b/);
  });

  it.each([
    ['verde', 'Tus gastos del mes están dentro del plan.'],
    ['amarillo', 'Vas ajustado este mes — revisa el detalle para no pasarte.'],
    ['rojo', 'Te pasaste del plan este mes. Revisa el detalle para ver dónde.'],
  ])(
    'renders the calm supporting line for estado "%s"',
    async (estado, copiaEsperada) => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={estado} periodo="2026-07" />,
      );
      expect(await screen.findByText(copiaEsperada)).toBeInTheDocument();
    },
  );

  it('navigates to /semaforo carrying the current periodo, with an accessible name combining verdict and period (a11y)', async () => {
    renderConRouter(
      <SemaforoHeroCard estadoGlobal="verde" periodo="2026-07" />,
    );

    const link = await screen.findByRole('link', {
      name: /Semáforo: Verde.*julio 2026/,
    });
    expect(link).toBeInTheDocument();

    await link.click();
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  it('keeps the face emoji decorative (aria-hidden) so the label text is the only carrier of meaning', async () => {
    renderConRouter(<SemaforoHeroCard estadoGlobal="rojo" periodo="2026-07" />);
    await screen.findByText('Semáforo: Rojo');

    const cara = screen.getByText('☹️');
    expect(cara).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the semaforo-global testid so smoke anchors survive the redesign (was on the chart card header)', async () => {
    renderConRouter(
      <SemaforoHeroCard estadoGlobal="verde" periodo="2026-07" />,
    );
    expect(await screen.findByTestId('semaforo-global')).toBeInTheDocument();
  });

  // ── Colorize pass (2026-08-29): the card wears its estado via a subtle
  // wash of the EXISTING semaforo-*/-100 surface tokens, reusing the same
  // fill the estado chip already carries — foreground text stays ink/
  // muted-foreground (verified AA on every wash) per the Two-Tier Color
  // Rule. "Sin datos" keeps the neutral `bg-card` surface unchanged.
  it.each([
    ['verde', 'bg-semaforo-verde'],
    ['amarillo', 'bg-semaforo-amarillo'],
    ['rojo', 'bg-semaforo-rojo'],
  ])(
    'wears estado "%s" as the card surface wash',
    async (estado, claseEsperada) => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={estado} periodo="2026-07" />,
      );
      const tarjeta = await screen.findByTestId('semaforo-global');
      expect(tarjeta.className).toMatch(new RegExp(`\\b${claseEsperada}\\b`));
    },
  );

  it('keeps a neutral bg-card surface (no estado wash) when there is no verdict yet', async () => {
    renderConRouter(<SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />);
    const tarjeta = await screen.findByTestId('semaforo-global');
    expect(tarjeta.className).toMatch(/\bbg-card\b/);
    expect(tarjeta.className).not.toMatch(/\bbg-semaforo-/);
  });

  it('is keyboard-operable with Space (WG5-12 precedent from SemaforoTag)', async () => {
    renderConRouter(
      <SemaforoHeroCard estadoGlobal="verde" periodo="2026-07" />,
    );
    const link = await screen.findByRole('link', { name: /Semáforo: Verde/ });
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
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      expect(await screen.findByText('Sin datos')).toBeInTheDocument();
    });

    it('renders the empty-state supporting line', async () => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      expect(
        await screen.findByText('Carga una cartola para conocer tu mes'),
      ).toBeInTheDocument();
    });

    it('renders a real CTA button linking to /subir (fixes: empty state without CTA)', async () => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      const cta = await screen.findByRole('link', { name: 'Subir cartola' });
      expect(cta).toBeInTheDocument();

      await cta.click();
      expect(await screen.findByTestId('subir-sentinel')).toBeInTheDocument();
    });

    it('does not render a /semaforo verdict link when there is no verdict yet', async () => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      await screen.findByText('Sin datos');
      expect(
        screen.queryByRole('link', { name: /^Semáforo:/ }),
      ).not.toBeInTheDocument();
    });

    it('still carries the semaforo-global testid in the empty state', async () => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      expect(await screen.findByTestId('semaforo-global')).toBeInTheDocument();
    });
  });
});
