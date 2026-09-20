/**
 * OfrecerPatronMobileControl.spec.tsx (issue #745, patrón desde movimiento
 * mobile) — RN port of web's `OfrecerPatronControl.spec.tsx`/`.tsx`. Proves
 * the two-stage offer flow end to end: oferta → seleccion → confirm →
 * `crearPatron` POST with the right payload → onCreado; a rejected offer or
 * a failed creation never touches the caller.
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import type { ApiResult } from '../../domain/api-error';
import { OfrecerPatronMobileControl } from './OfrecerPatronMobileControl';

const mockCrearPatron = jest.fn<Promise<ApiResult<void>>, [unknown]>();

jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearPatron: (input: unknown) => mockCrearPatron(input),
}));

describe('OfrecerPatronMobileControl', () => {
  const onCreado = jest.fn<void, [string]>();
  const onCerrar = jest.fn<void, []>();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the offer prompt with "Crear patrón" / "Ahora no" first', async () => {
    await render(
      <OfrecerPatronMobileControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-1"
        onCreado={onCreado}
        onCerrar={onCerrar}
      />,
    );

    expect(
      screen.getByText(
        '¿Reconocer automáticamente este movimiento en tus próximas cartolas?',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Crear patrón' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeOnTheScreen();
  });

  it('"Ahora no" calls onCerrar without creating anything', async () => {
    await render(
      <OfrecerPatronMobileControl
        descripcion="NETFLIX.COM"
        categoriaId="cat-1"
        onCreado={onCreado}
        onCerrar={onCerrar}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Ahora no' }));
    });

    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(mockCrearPatron).not.toHaveBeenCalled();
  });

  it('"Crear patrón" opens the word picker', async () => {
    await render(
      <OfrecerPatronMobileControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-1"
        onCreado={onCreado}
        onCerrar={onCerrar}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Crear patrón' }));
    });

    expect(
      screen.getByText('Elige las palabras que identifican a este comercio:'),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'NETFLIX.COM' }),
    ).toBeOnTheScreen();
  });

  it('confirming a selection POSTs /api/patrones with matchType CONTAINS and calls onCreado on success', async () => {
    mockCrearPatron.mockResolvedValue({ ok: true, value: undefined });

    await render(
      <OfrecerPatronMobileControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-42"
        onCreado={onCreado}
        onCerrar={onCerrar}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Crear patrón' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'NETFLIX.COM' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(mockCrearPatron).toHaveBeenCalledWith({
        categoriaId: 'cat-42',
        patron: 'NETFLIX.COM',
        matchType: 'CONTAINS',
      });
    });
    expect(onCreado).toHaveBeenCalledWith('NETFLIX.COM');
  });

  it('a failed creation shows the inline catalog error message, keeps the picker mounted, and never calls onCreado/onCerrar', async () => {
    mockCrearPatron.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 409, code: 'PATRON_DUPLICADO' },
    });

    await render(
      <OfrecerPatronMobileControl
        descripcion="COPEC"
        categoriaId="cat-1"
        onCreado={onCreado}
        onCerrar={onCerrar}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Crear patrón' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'COPEC' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Guardar patrón' }));
    });

    await waitFor(() => {
      expect(
        screen.getByText('Ya tienes un patrón con ese texto.'),
      ).toBeOnTheScreen();
    });
    expect(onCreado).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();
    // Picker stays mounted so the user can retry or back out.
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeOnTheScreen();
  });
});
