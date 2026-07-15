import { render, screen } from '@testing-library/react-native';
import { fireEvent } from '@testing-library/react-native';
import { ErrorState } from './Error';

// RED-first (T3.7, sprint3-mvp-mobile, MOB-02/MOB-03): error copy differs
// subtly by ApiError tag, and a retry affordance is always present so the
// user isn't stuck on a dead screen.
describe('ErrorState', () => {
  it('renders network-specific copy for a network error', async () => {
    await render(<ErrorState error={{ tag: 'network' }} onRetry={() => {}} />);
    expect(screen.getByText(/conexión/i)).toBeOnTheScreen();
  });

  it('renders unauthorized-specific copy for a 401', async () => {
    await render(<ErrorState error={{ tag: 'unauthorized' }} onRetry={() => {}} />);
    expect(screen.getByText(/acceso/i)).toBeOnTheScreen();
  });

  it('renders parse-specific copy for a malformed body', async () => {
    await render(<ErrorState error={{ tag: 'parse' }} onRetry={() => {}} />);
    expect(screen.getByText(/inesperada/i)).toBeOnTheScreen();
  });

  it('renders http-specific copy including the status for other failures', async () => {
    await render(<ErrorState error={{ tag: 'http', status: 500 }} onRetry={() => {}} />);
    expect(screen.getByText(/500/)).toBeOnTheScreen();
  });

  it('calls onRetry when the retry affordance is pressed', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState error={{ tag: 'network' }} onRetry={onRetry} />);
    fireEvent.press(screen.getByText('Reintentar'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
