import { render, screen } from '@testing-library/react-native';
import { SemaforoTag } from './SemaforoTag';

// US-050 PR4b (design §1.7/D-12, MOB-09): a static, non-interactive
// indicator — no `Pressable`, no chevron, no navigation (binding decision
// 1). `estadoGlobal` passes through verbatim (ADR-024, never recomputed).
// ADR-018: the state is carried by the visible Spanish word, never by
// colour alone.
describe('SemaforoTag', () => {
  it.each([
    ['verde', 'Verde'],
    ['amarillo', 'Amarillo'],
    ['rojo', 'Rojo'],
  ])(
    'renders the Spanish word as visible text for estado "%s"',
    async (estado, label) => {
      await render(<SemaforoTag estadoGlobal={estado} />);
      expect(screen.getByText(`Semáforo: ${label}`)).toBeOnTheScreen();
    },
  );

  it('renders a distinct "Sin datos" tag for null, never coerced into a colour', async () => {
    await render(<SemaforoTag estadoGlobal={null} />);
    expect(screen.getByText('Semáforo: Sin datos')).toBeOnTheScreen();
  });

  it('renders "Sin datos" for an unknown wire value', async () => {
    await render(<SemaforoTag estadoGlobal="turquesa" />);
    expect(screen.getByText('Semáforo: Sin datos')).toBeOnTheScreen();
  });

  it('is not a button and exposes no press handler', async () => {
    await render(<SemaforoTag estadoGlobal="verde" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
  });

  it('carries the state as real visible text, not colour alone (ADR-018)', async () => {
    await render(<SemaforoTag estadoGlobal="rojo" />);
    // The Spanish word itself is a real text node reachable by getByText —
    // not just a background tint a colourblind/screen-reader user can't see.
    expect(screen.getByText('Semáforo: Rojo')).toBeOnTheScreen();
  });
});
