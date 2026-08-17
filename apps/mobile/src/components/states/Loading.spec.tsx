import { render, screen } from '@testing-library/react-native';
import { Loading } from './Loading';

// RED-first (T3.7, sprint3-mvp-mobile, MOB-03): loading state shows a
// spinner + label, and MUST NOT render bucket data or error copy (MOB-03
// "no partial/undefined content while transitioning").
describe('Loading', () => {
  it('renders a loading indicator and label', async () => {
    await render(<Loading />);
    expect(screen.getByText('Cargando resumen…')).toBeOnTheScreen();
    expect(screen.getByTestId('loading-spinner')).toBeOnTheScreen();
  });
});
