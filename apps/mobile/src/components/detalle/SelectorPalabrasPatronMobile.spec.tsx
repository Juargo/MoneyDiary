/**
 * SelectorPalabrasPatronMobile.spec.tsx (issue #745, patrón desde
 * movimiento mobile) — the word-picking widget RN port of web's
 * `SelectorPalabrasPatron.tsx`. Pure presentational + the pure
 * `alternarPalabra` reducer underneath (already covered on its own by
 * `seleccion-contigua-palabras.spec.ts`) — this suite proves the WIRING:
 * tapping words builds the expected literal substring, and Guardar/Cancelar
 * fire the right callbacks with the right payload.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { SelectorPalabrasPatronMobile } from './SelectorPalabrasPatronMobile';

describe('SelectorPalabrasPatronMobile', () => {
  const onConfirmar = jest.fn<void, [string]>();
  const onCancelar = jest.fn<void, []>();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders one chip per word of the description', async () => {
    await render(
      <SelectorPalabrasPatronMobile
        descripcion="NETFLIX.COM SANTIAGO CL"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    expect(screen.getByText('NETFLIX.COM')).toBeOnTheScreen();
    expect(screen.getByText('SANTIAGO')).toBeOnTheScreen();
    expect(screen.getByText('CL')).toBeOnTheScreen();
  });

  it('shows the "select at least one word" hint and a disabled Guardar patrón before any tap', async () => {
    await render(
      <SelectorPalabrasPatronMobile
        descripcion="UBER EATS"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    expect(
      screen.getByText('Selecciona al menos una palabra.'),
    ).toBeOnTheScreen();
    const guardar = screen.getByRole('button', { name: 'Guardar patrón' });
    expect(guardar.props.accessibilityState?.disabled).toBe(true);
  });

  it('tapping a word selects it, marks it accessibilityState.selected, and previews the literal substring', async () => {
    await render(
      <SelectorPalabrasPatronMobile
        descripcion="NETFLIX.COM SANTIAGO CL"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    const palabra = screen.getByRole('button', { name: 'NETFLIX.COM' });
    await act(async () => {
      fireEvent.press(palabra);
    });

    expect(palabra.props.accessibilityState?.selected).toBe(true);
    expect(
      screen.getByText('Se guardará como: «NETFLIX.COM»'),
    ).toBeOnTheScreen();
  });

  it('tapping two adjacent words builds the contiguous literal substring, preserving original separators', async () => {
    await render(
      <SelectorPalabrasPatronMobile
        descripcion="UBER   EATS SANTIAGO"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'UBER' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'EATS' }));
    });

    const guardar = screen.getByRole('button', { name: 'Guardar patrón' });
    expect(guardar.props.accessibilityState?.disabled).toBeFalsy();

    await act(async () => {
      fireEvent.press(guardar);
    });
    expect(onConfirmar).toHaveBeenCalledWith('UBER   EATS');
  });

  it('pressing Cancelar calls onCancelar without calling onConfirmar', async () => {
    await render(
      <SelectorPalabrasPatronMobile
        descripcion="COPEC"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'COPEC' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    });

    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('pending=true disables word chips and Guardar patrón', async () => {
    await render(
      <SelectorPalabrasPatronMobile
        descripcion="COPEC"
        pending
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    const palabra = screen.getByRole('button', { name: 'COPEC' });
    await act(async () => {
      fireEvent.press(palabra);
    });

    // Disabled: tapping the word must not select it (onConfirmar never
    // reachable), and Guardar patrón itself must report disabled.
    expect(palabra.props.accessibilityState?.selected).toBeFalsy();
    const guardar = screen.getByRole('button', { name: 'Guardar patrón' });
    expect(guardar.props.accessibilityState?.disabled).toBe(true);
  });
});
