import { render, screen, fireEvent } from '@testing-library/react-native';
import { CampoTexto } from './CampoTexto';

describe('CampoTexto (US-044 PR3a)', () => {
  it('renders the visible label and current value', async () => {
    await render(
      <CampoTexto label="Nombre" value="Juan Pérez" onChangeText={() => {}} />,
    );

    expect(screen.getByText('Nombre')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Juan Pérez')).toBeOnTheScreen();
  });

  it('fires onChangeText when the user types', async () => {
    const onChangeText = jest.fn();
    await render(
      <CampoTexto label="Nombre" value="Juan" onChangeText={onChangeText} />,
    );

    fireEvent.changeText(screen.getByDisplayValue('Juan'), 'Pedro');
    expect(onChangeText).toHaveBeenCalledWith('Pedro');
  });

  it('passes secureTextEntry prop through to TextInput', async () => {
    const { rerender } = await render(
      <CampoTexto
        label="Contraseña"
        value="secret123"
        onChangeText={() => {}}
        secureTextEntry={true}
      />,
    );

    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(
      true,
    );

    await rerender(
      <CampoTexto
        label="Contraseña"
        value="secret123"
        onChangeText={() => {}}
        secureTextEntry={false}
      />,
    );

    expect(
      screen.getByLabelText('Contraseña').props.secureTextEntry,
    ).toBeFalsy();
  });

  it('forwards editable={false} to TextInput making it non-editable', async () => {
    await render(
      <CampoTexto
        label="Nombre"
        value="Juan"
        onChangeText={() => {}}
        editable={false}
        testID="campo-editable"
      />,
    );

    expect(screen.getByTestId('campo-editable').props.editable).toBe(false);
  });

  it('forwards keyboardType="email-address" to TextInput', async () => {
    await render(
      <CampoTexto
        label="Email"
        value="test@example.com"
        onChangeText={() => {}}
        keyboardType="email-address"
        testID="campo-email"
      />,
    );

    expect(screen.getByTestId('campo-email').props.keyboardType).toBe(
      'email-address',
    );
  });

  it('forwards autoCapitalize="none" to TextInput', async () => {
    await render(
      <CampoTexto
        label="Email"
        value="test@example.com"
        onChangeText={() => {}}
        autoCapitalize="none"
        testID="campo-autocap"
      />,
    );

    expect(screen.getByTestId('campo-autocap').props.autoCapitalize).toBe(
      'none',
    );
  });

  it('renders an error message with alert accessibility role when provided', async () => {
    const { rerender } = await render(
      <CampoTexto label="Email" value="" onChangeText={() => {}} />,
    );

    expect(screen.queryByRole('alert')).toBeNull();

    await rerender(
      <CampoTexto
        label="Email"
        value=""
        onChangeText={() => {}}
        error="El correo electrónico no es válido"
      />,
    );

    const alertElement = screen.getByRole('alert');
    expect(alertElement).toBeOnTheScreen();
    expect(alertElement).toHaveTextContent(
      'El correo electrónico no es válido',
    );
  });

  it('has an accessible name matching the visible label', async () => {
    await render(
      <CampoTexto
        label="Correo electrónico"
        value="test@example.com"
        onChangeText={() => {}}
      />,
    );

    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
  });
});
