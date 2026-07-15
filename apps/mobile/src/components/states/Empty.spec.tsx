import { render, screen } from '@testing-library/react-native';
import { Empty } from './Empty';

// RED-first (T3.7, sprint3-mvp-mobile, MOB-03): empty state (sinIngreso)
// shows copy distinct from "$0" / "0%" — there is no income this period,
// which is a different condition than a bucket totaling zero.
describe('Empty', () => {
  it('renders empty-state copy distinct from $0 or 0%', async () => {
    await render(<Empty />);
    expect(screen.getByText('Sin ingresos registrados este período')).toBeOnTheScreen();
    expect(screen.queryByText('$0')).not.toBeOnTheScreen();
    expect(screen.queryByText('0%')).not.toBeOnTheScreen();
  });
});
