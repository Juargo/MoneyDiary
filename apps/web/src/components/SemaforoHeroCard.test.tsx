import { screen } from '@testing-library/react';
import { SemaforoHeroCard } from './SemaforoHeroCard';
import { renderConRouter } from '@/test/router-harness';

/**
 * SemaforoHeroCard — single-line status row (2026-08-30, minimalist-ui
 * pass): status dot, "Semáforo · {mes}" label, estado pill (the ONLY
 * colored element), trailing chevron. The verdict copy is GONE — it now
 * lives on `/semaforo`, which this row links to. Navigation/a11y behavior
 * is unchanged from the previous design.
 */
describe('SemaforoHeroCard', () => {
  it.each([
    ['verde', 'Muy Saludable'],
    ['amarillo', 'Saludable'],
    ['rojo', 'En peligro'],
  ])(
    'renders estado "%s" as a link named after its rebranded label, with the label in a translucent pill',
    async (estado, label) => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={estado} periodo="2026-07" />,
      );
      const link = await screen.findByRole('link', {
        name: new RegExp(`Semáforo: ${label}`),
      });
      expect(link).toBeInTheDocument();

      const pill = screen.getByText(label);
      expect(pill.className).toMatch(/\brounded-none\b/);
      expect(pill.className).toMatch(
        new RegExp(`\\btext-semaforo-${estado}-foreground\\b`),
      );

      // Tecno-Analítico (2026-09-02): the pill's surface is a 15% wash of its
      // OWN neon tone plus a hairline of the same tone — not the solid
      // `bg-semaforo-{estado}` tint it used under the light identity.
      //
      // Asserted as a full class string on purpose. The previous
      // `\bbg-semaforo-${estado}\b` regex still MATCHES the new value by
      // accident (the `\b` after "verde" is satisfied by the `-` in
      // `bg-semaforo-verde-foreground/15`), so it would have gone green
      // without ever checking the thing it claims to check.
      expect(pill.className).toContain(`bg-semaforo-${estado}-foreground/15`);
      expect(pill.className).toContain(
        `border-semaforo-${estado}-foreground/40`,
      );
      expect(pill.className).not.toMatch(
        new RegExp(`\\bbg-semaforo-${estado}(?!-foreground)\\b`),
      );
    },
  );

  it('renders as a single line: label + period + pill, no verdict copy anywhere', async () => {
    renderConRouter(<SemaforoHeroCard estadoGlobal="rojo" periodo="2026-07" />);

    const link = await screen.findByRole('link', {
      name: /Semáforo: En peligro/,
    });
    expect(link.textContent).toBe('Semáforo · julio 2026En peligro');
    expect(screen.queryByText(/Tu veredicto es/)).not.toBeInTheDocument();
  });

  it('keeps the row surface flat and neutral (no colored surface, no shadow)', async () => {
    renderConRouter(<SemaforoHeroCard estadoGlobal="rojo" periodo="2026-07" />);
    const fila = await screen.findByTestId('semaforo-global');
    expect(fila.className).toMatch(/\bbg-card\b/);
    expect(fila.className).not.toMatch(/\bbg-semaforo-/);
    expect(fila.className).not.toMatch(/\bshadow-sm\b/);
  });

  it('navigates to /semaforo carrying the current periodo, with an accessible name combining verdict and period (a11y)', async () => {
    renderConRouter(
      <SemaforoHeroCard estadoGlobal="verde" periodo="2026-07" />,
    );

    const link = await screen.findByRole('link', {
      name: /Semáforo: Muy Saludable.*julio 2026/,
    });
    expect(link).toBeInTheDocument();

    await link.click();
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  it('keeps the status dot decorative (aria-hidden) so the pill text is the only carrier of meaning', async () => {
    renderConRouter(<SemaforoHeroCard estadoGlobal="rojo" periodo="2026-07" />);
    const fila = await screen.findByTestId('semaforo-global');
    const punto = fila.querySelector('span[aria-hidden="true"]');
    expect(punto).not.toBeNull();
    expect(punto?.className).toMatch(/\bbg-semaforo-rojo-foreground\b/);
  });

  it('carries the semaforo-global testid so smoke anchors survive the redesign', async () => {
    renderConRouter(
      <SemaforoHeroCard estadoGlobal="verde" periodo="2026-07" />,
    );
    expect(await screen.findByTestId('semaforo-global')).toBeInTheDocument();
  });

  it('is keyboard-operable with Space (WG5-12 precedent from SemaforoTag)', async () => {
    renderConRouter(
      <SemaforoHeroCard estadoGlobal="verde" periodo="2026-07" />,
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
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      expect(await screen.findByText('Sin datos')).toBeInTheDocument();
    });

    it('renders the empty-state supporting line', async () => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      expect(
        await screen.findByText(/Carga una cartola para conocer tu mes/),
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

    it('keeps a flat, neutral bg-card surface with no estado tint', async () => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      const fila = await screen.findByTestId('semaforo-global');
      expect(fila.className).toMatch(/\bbg-card\b/);
      expect(fila.className).not.toMatch(/\bbg-semaforo-/);
      expect(fila.className).not.toMatch(/\bshadow-sm\b/);
    });

    it('still carries the semaforo-global testid in the empty state', async () => {
      renderConRouter(
        <SemaforoHeroCard estadoGlobal={null} periodo="2026-07" />,
      );
      expect(await screen.findByTestId('semaforo-global')).toBeInTheDocument();
    });
  });
});
