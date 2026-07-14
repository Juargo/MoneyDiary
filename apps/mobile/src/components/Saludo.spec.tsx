import { render, screen } from '@testing-library/react-native';
import { Saludo } from './Saludo';

// Suite de ejemplo (ADR-017): render bajo jest-expo + queries de RNTL +
// matchers built-in. Verifica que el arnés de componentes mobile está montado.
//
// Nota (T2.8, sprint3-mvp-mobile): a partir de RNTL v14, `render()` es
// async por defecto (ver "Migration to 14.0" del README del paquete
// instalado) — se agrega `await` aquí, mismo comportamiento probado, sin
// cambiar la lógica del componente ni del assertion.
describe('Saludo', () => {
  it('renderiza el nombre recibido', async () => {
    await render(<Saludo nombre="Jorge" />);
    expect(screen.getByText('Hola, Jorge')).toBeOnTheScreen();
  });
});
