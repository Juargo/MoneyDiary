import { render, screen } from '@testing-library/react-native';
import { SemaforoBadge } from './SemaforoBadge';

// RED-first (T3.7, sprint3-mvp-mobile, MOB-03/MOB-06): asserts the visible
// label per `estadoSemaforo` value, including `null` (no crash, distinct
// copy — never silently rendered as one of the known states).
describe('SemaforoBadge', () => {
  it('renders the green label for "verde"', async () => {
    await render(<SemaforoBadge estadoSemaforo="verde" />);
    expect(screen.getByText('Verde')).toBeOnTheScreen();
  });

  it('renders the yellow label for "amarillo"', async () => {
    await render(<SemaforoBadge estadoSemaforo="amarillo" />);
    expect(screen.getByText('Amarillo')).toBeOnTheScreen();
  });

  it('renders the red label for "rojo"', async () => {
    await render(<SemaforoBadge estadoSemaforo="rojo" />);
    expect(screen.getByText('Rojo')).toBeOnTheScreen();
  });

  it('renders a distinct "sin datos" label for null, not a crash', async () => {
    await render(<SemaforoBadge estadoSemaforo={null} />);
    expect(screen.getByText('Sin datos')).toBeOnTheScreen();
  });
});
