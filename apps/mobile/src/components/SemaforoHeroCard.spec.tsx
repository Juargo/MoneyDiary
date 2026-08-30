import { render, screen } from '@testing-library/react-native';
import { SemaforoHeroCard } from './SemaforoHeroCard';

/**
 * SemaforoHeroCard (mobile) — mock-driven redesign (2026-08-30), mirroring
 * web's hero: ring indicator, "Semáforo: {label}" title with the rebranded
 * labels (single table, `theme/semaforo-estilos.ts`), tinted verdict box,
 * and a decorative worst→best scale. NOT pressable: no /semaforo detail
 * route exists on mobile (MOB-15 precedent — no affordance without a
 * destination). Carries `testID="semaforo-global"` (Maestro/spec anchor,
 * moved here from `SemaforoTag`, same move web made).
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
  ])('renders estado "%s" with its rebranded label', async (estado, titulo) => {
    await render(<SemaforoHeroCard estadoGlobal={estado} veredicto={null} />);
    expect(screen.getByText(titulo)).toBeOnTheScreen();
  });

  it('renders the verdict copy (bold lead + detail) when provided', async () => {
    await render(
      <SemaforoHeroCard estadoGlobal="rojo" veredicto={veredictoRojo} />,
    );
    expect(screen.getByText(/Tu veredicto es En peligro\./)).toBeOnTheScreen();
    expect(screen.getByText(/la lógica de mayor riesgo/)).toBeOnTheScreen();
  });

  it('omits the verdict box when no veredicto is provided', async () => {
    await render(<SemaforoHeroCard estadoGlobal="verde" veredicto={null} />);
    expect(screen.queryByText(/Tu veredicto es/)).not.toBeOnTheScreen();
  });

  it('renders the worst→best scale labels', async () => {
    await render(<SemaforoHeroCard estadoGlobal="verde" veredicto={null} />);
    // The scale is deliberately aria-hidden (decorative, redundant with the
    // title) — opt in to hidden elements to assert it still renders.
    const conOcultos = { includeHiddenElements: true } as const;
    expect(screen.getByText('En peligro', conOcultos)).toBeOnTheScreen();
    expect(screen.getByText('Saludable', conOcultos)).toBeOnTheScreen();
    expect(
      screen.getAllByText('Muy Saludable', conOcultos).length,
    ).toBeGreaterThan(0);
  });

  it('carries testID="semaforo-global" and is NOT a button (no destination on mobile)', async () => {
    await render(<SemaforoHeroCard estadoGlobal="verde" veredicto={null} />);
    const hero = screen.getByTestId('semaforo-global');
    expect(hero).toBeOnTheScreen();
    expect(hero.props.accessibilityRole).not.toBe('button');
    expect(hero.props.onPress).toBeUndefined();
  });

  describe('estadoGlobal null (SIN_DATOS)', () => {
    it('renders "Sin datos" calmly with the supporting line, no verdict, no scale', async () => {
      await render(<SemaforoHeroCard estadoGlobal={null} veredicto={null} />);
      expect(screen.getByText('Sin datos')).toBeOnTheScreen();
      expect(
        screen.getByText('Carga una cartola para conocer tu mes'),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/Tu veredicto es/)).not.toBeOnTheScreen();
      expect(
        screen.queryByText('En peligro', { includeHiddenElements: true }),
      ).not.toBeOnTheScreen();
    });

    it('still carries the semaforo-global testID in the empty state', async () => {
      await render(<SemaforoHeroCard estadoGlobal={null} veredicto={null} />);
      expect(screen.getByTestId('semaforo-global')).toBeOnTheScreen();
    });
  });

  it('does not coerce an unknown estado into a known verdict', async () => {
    await render(<SemaforoHeroCard estadoGlobal="fucsia" veredicto={null} />);
    expect(screen.getByText('Sin datos')).toBeOnTheScreen();
  });
});
