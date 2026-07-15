import { render, screen } from '@testing-library/react-native';
import { SemaforoBadge } from './SemaforoBadge';

// The badge now renders a face inside a tinted circle (Stitch mockup); the
// state word is exposed via accessibilityLabel, not visible text. Asserts the
// distinct label per `estadoSemaforo`, including `null` (never silently
// coerced into a known color — MOB-03/MOB-06).
describe('SemaforoBadge', () => {
  it('exposes the green label for "verde"', async () => {
    await render(<SemaforoBadge estadoSemaforo="verde" />);
    expect(screen.getByLabelText('Verde')).toBeOnTheScreen();
  });

  it('exposes the yellow label for "amarillo"', async () => {
    await render(<SemaforoBadge estadoSemaforo="amarillo" />);
    expect(screen.getByLabelText('Amarillo')).toBeOnTheScreen();
  });

  it('exposes the red label for "rojo"', async () => {
    await render(<SemaforoBadge estadoSemaforo="rojo" />);
    expect(screen.getByLabelText('Rojo')).toBeOnTheScreen();
  });

  it('exposes a distinct "Sin datos" label for null, not a crash', async () => {
    await render(<SemaforoBadge estadoSemaforo={null} />);
    expect(screen.getByLabelText('Sin datos')).toBeOnTheScreen();
  });

  it('does not coerce an unknown value into a known color', async () => {
    await render(<SemaforoBadge estadoSemaforo="turquesa" />);
    expect(screen.getByLabelText('Sin datos')).toBeOnTheScreen();
  });
});
