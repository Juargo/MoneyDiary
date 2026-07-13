import { render, screen } from '@testing-library/react-native';
import { Saludo } from './Saludo';

// Suite de ejemplo (ADR-017): render bajo jest-expo + queries de RNTL +
// matchers built-in. Verifica que el arnés de componentes mobile está montado.
describe('Saludo', () => {
  it('renderiza el nombre recibido', () => {
    render(<Saludo nombre="Jorge" />);
    expect(screen.getByText('Hola, Jorge')).toBeOnTheScreen();
  });
});
