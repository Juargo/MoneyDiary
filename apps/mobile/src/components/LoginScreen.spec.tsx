import { render, screen, fireEvent } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';

// RED-first (C2.3, MOB-06 §9.2): the Google affordance is fully optional and
// additive — `mostrarGoogle`/`onGoogleSubmit` — so every existing password
// login behavior (already covered end-to-end via `app/login.spec.tsx`) stays
// untouched. `LoginEstado` is NOT extended: one state machine, one generic
// error message for every failure cause (password or Google alike).
describe('LoginScreen — Google affordance (MOB-06)', () => {
  const baseProps = {
    email: '',
    password: '',
    onChangeEmail: () => {},
    onChangePassword: () => {},
    onSubmit: () => {},
  };

  it('does not render the Google button when mostrarGoogle is false/absent', async () => {
    await render(<LoginScreen {...baseProps} estado={{ fase: 'idle' }} />);
    expect(screen.queryByTestId('login-google')).toBeNull();
  });

  it('renders the Google button below the submit button when mostrarGoogle is true', async () => {
    await render(
      <LoginScreen
        {...baseProps}
        estado={{ fase: 'idle' }}
        mostrarGoogle={true}
        onGoogleSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId('login-google')).toBeOnTheScreen();
  });

  it('calls onGoogleSubmit when the Google button is pressed', async () => {
    const onGoogleSubmit = jest.fn();
    await render(
      <LoginScreen
        {...baseProps}
        estado={{ fase: 'idle' }}
        mostrarGoogle={true}
        onGoogleSubmit={onGoogleSubmit}
      />,
    );

    await fireEvent.press(screen.getByTestId('login-google'));
    expect(onGoogleSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables both affordances while submitting (LoginEstado is not extended)', async () => {
    await render(
      <LoginScreen
        {...baseProps}
        estado={{ fase: 'submitting' }}
        mostrarGoogle={true}
        onGoogleSubmit={() => {}}
      />,
    );

    expect(
      screen.getByTestId('login-submit').props.accessibilityState,
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByTestId('login-google').props.accessibilityState,
    ).toHaveProperty('disabled', true);
  });

  it('shows the same generic error message regardless of which flow failed', async () => {
    await render(
      <LoginScreen
        {...baseProps}
        estado={{ fase: 'error' }}
        mostrarGoogle={true}
        onGoogleSubmit={() => {}}
      />,
    );

    expect(
      screen.getByText(
        'No pudimos iniciar sesión. Verifica tus datos e intenta de nuevo.',
      ),
    ).toBeOnTheScreen();
  });
});
