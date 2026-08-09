import { render, screen, fireEvent } from '@testing-library/react-native';
import { GoogleLoginButton } from './GoogleLoginButton';
import { COLORS } from '../theme/colors';

// RED-first (C2.1, MOB-06 §9.2): pure presentational button — no fetch, no
// SecureStore, no navigation. `LoginScreen`/`app/login.tsx` own visibility
// and orchestration; this component only renders when its parent decides to
// mount it.
describe('GoogleLoginButton', () => {
  it('renders a secondary, accessible button labeled "Ingresar con Google"', async () => {
    await render(<GoogleLoginButton onPress={() => {}} disabled={false} />);

    const button = screen.getByTestId('login-google');
    expect(button).toBeOnTheScreen();
    expect(button.props.accessibilityRole).toBe('button');
    expect(screen.getByText('Ingresar con Google')).toBeOnTheScreen();

    // Visually secondary: never the filled primary background color
    // (`COLORS.ingreso`) the password submit button uses.
    const flattenStyle = ([] as unknown[]).concat(button.props.style ?? []);
    const backgroundColors = flattenStyle
      .filter((style): style is Record<string, unknown> => !!style)
      .map((style) => style.backgroundColor)
      .filter(Boolean);
    expect(backgroundColors).not.toContain(COLORS.ingreso);
  });

  it('calls onPress when tapped and is disabled while submitting', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(
      <GoogleLoginButton onPress={onPress} disabled={false} />,
    );

    await fireEvent.press(screen.getByTestId('login-google'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<GoogleLoginButton onPress={onPress} disabled={true} />);
    expect(
      screen.getByTestId('login-google').props.accessibilityState,
    ).toHaveProperty('disabled', true);
  });
});
