/**
 * PerfilPanel.spec.tsx — US-044 PR4b, T4b.1 (15 cases)
 *
 * `io` (patchPerfil / patchPassword) is injected as a prop rather than
 * module-mocked. This mirrors the same DIP pattern guardar-perfil.ts already
 * uses for its own unit tests: inject io functions, never import them inside
 * the function under test. PerfilPanel accepts `io` as an optional prop (prod
 * default: the real api/perfil functions). The spec passes in jest.fn()
 * pairs directly — no jest.mock hoisting required.
 *
 * `act(async () => { fireEvent.changeText(...) })` is required to flush React
 * 18 concurrent-mode state updates before fireEvent.press reads the committed
 * state from the new render's closure. Without explicit `act`, the controlled
 * TextInput's onChangeText triggers setNombre but the re-render may not be
 * flushed before the next fireEvent.press.
 *
 * Coverage per tasks.md T4b.1 (15 cases):
 *  1. Renders 4 CampoTexto fields (Nombre / Email / Password actual / Password nueva)
 *  2. null email renders empty without crashing (MCFG-02)
 *  3. Google block: Vinculada: {email} when googleVinculado + email present
 *  4. Google block: Vinculada (no email) when googleVinculado + email null
 *  5. Google block: No vinculada when !googleVinculado
 *  6. Non-tautological: Desvincular absent AND Vinculada/No vinculada present (class 3)
 *  7. Submit nombre-only: one request (patchPerfil), patchPassword never called (class 4)
 *  8. Submit email change: sends passwordActual in the patch (MCFG-03)
 *  9. Profile failure: renders mensajeDeApiError, patchPassword never called
 * 10. Password failure after profile success: partial-success copy + role="alert"
 * 11. Full success: «Cambios guardados. Se cerraron tus otras sesiones.»
 * 12. ok message renders with liveRegion (perfil-ok-region testID)
 * 13. Error message renders inside role="alert" region
 * 14. sin-cambios: ok «No hay cambios para guardar.»
 * 15. falta-password-actual: error «Ingresa tu password actual.»
 */

import React from 'react';
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import type { MeDto } from '../../domain/resumen.types';
import type { ApiResult } from '../../domain/api-error';
import type { PerfilPatch, PasswordPatch } from '../../domain/guardar-perfil';
import { PerfilPanel } from './PerfilPanel';

const baseMe: MeDto = {
  userId: 'user-1',
  email: 'test@example.com',
  nombre: 'Jorge',
  esDemo: false,
  googleVinculado: false,
};

function buildIo(overrides?: {
  patchPerfil?: jest.MockedFunction<
    (p: PerfilPatch) => Promise<ApiResult<void>>
  >;
  patchPassword?: jest.MockedFunction<
    (p: PasswordPatch) => Promise<ApiResult<void>>
  >;
}) {
  const patchPerfil =
    overrides?.patchPerfil ??
    jest.fn<Promise<ApiResult<void>>, [PerfilPatch]>().mockResolvedValue({
      ok: true,
      value: undefined,
    });
  const patchPassword =
    overrides?.patchPassword ??
    jest.fn<Promise<ApiResult<void>>, [PasswordPatch]>().mockResolvedValue({
      ok: true,
      value: undefined,
    });
  return { patchPerfil, patchPassword };
}

/** Helper: fill form fields and flush state updates via act before submitting. */
async function llenarYEnviar(
  fields: Partial<{
    nombre: string;
    email: string;
    passwordActual: string;
    passwordNueva: string;
  }>,
) {
  await act(async () => {
    if (fields.nombre !== undefined) {
      fireEvent.changeText(screen.getByLabelText('Nombre'), fields.nombre);
    }
    if (fields.email !== undefined) {
      fireEvent.changeText(screen.getByLabelText('Email'), fields.email);
    }
    if (fields.passwordActual !== undefined) {
      fireEvent.changeText(
        screen.getByLabelText('Password actual'),
        fields.passwordActual,
      );
    }
    if (fields.passwordNueva !== undefined) {
      fireEvent.changeText(
        screen.getByLabelText('Password nueva'),
        fields.passwordNueva,
      );
    }
  });
  fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));
}

describe('PerfilPanel (US-044 PR4b, T4b.1)', () => {
  it('renders all 4 CampoTexto fields', async () => {
    await render(<PerfilPanel me={baseMe} io={buildIo()} />);

    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password actual')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password nueva')).toBeOnTheScreen();
  });

  it('renders email field empty when me.email is null, without crashing (MCFG-02)', async () => {
    await render(
      <PerfilPanel me={{ ...baseMe, email: null }} io={buildIo()} />,
    );

    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
  });

  it('shows "Vinculada: {email}" when googleVinculado and email is present', async () => {
    await render(
      <PerfilPanel
        me={{ ...baseMe, googleVinculado: true, email: 'g@example.com' }}
        io={buildIo()}
      />,
    );

    expect(screen.getByText('Vinculada: g@example.com')).toBeOnTheScreen();
  });

  it('shows "Vinculada" (no email) when googleVinculado and email is null', async () => {
    await render(
      <PerfilPanel
        me={{ ...baseMe, googleVinculado: true, email: null }}
        io={buildIo()}
      />,
    );

    expect(screen.getByText('Vinculada')).toBeOnTheScreen();
  });

  it('shows "No vinculada" when !googleVinculado', async () => {
    await render(
      <PerfilPanel me={{ ...baseMe, googleVinculado: false }} io={buildIo()} />,
    );

    expect(screen.getByText('No vinculada')).toBeOnTheScreen();
  });

  it('never renders Desvincular; Vinculada/No vinculada always present (class 3 non-tautological)', async () => {
    const { rerender } = await render(
      <PerfilPanel me={{ ...baseMe, googleVinculado: true }} io={buildIo()} />,
    );

    // Desvincular and Vincular absent (MCFG-02: no binding controls)
    expect(screen.queryByRole('button', { name: 'Desvincular' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vincular' })).toBeNull();
    // Vinculada present
    expect(screen.getByText('Vinculada: test@example.com')).toBeOnTheScreen();

    await rerender(
      <PerfilPanel me={{ ...baseMe, googleVinculado: false }} io={buildIo()} />,
    );

    // Desvincular and Vincular still absent (MCFG-02)
    expect(screen.queryByRole('button', { name: 'Desvincular' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vincular' })).toBeNull();
    // No vinculada present
    expect(screen.getByText('No vinculada')).toBeOnTheScreen();
  });

  it('nombre-only submit: one patchPerfil call, patchPassword never called (class 4)', async () => {
    const io = buildIo();
    await render(<PerfilPanel me={baseMe} io={io} />);

    await llenarYEnviar({ nombre: 'Nuevo Nombre' });

    await waitFor(() => {
      expect(io.patchPerfil).toHaveBeenCalledTimes(1);
    });
    expect(io.patchPerfil).toHaveBeenCalledWith({ nombre: 'Nuevo Nombre' });
    expect(io.patchPassword).not.toHaveBeenCalled();
  });

  it('email change includes passwordActual in the patch (MCFG-03)', async () => {
    const io = buildIo();
    await render(<PerfilPanel me={baseMe} io={io} />);

    await llenarYEnviar({
      email: 'new@example.com',
      passwordActual: 'mypass123',
    });

    await waitFor(() => {
      expect(io.patchPerfil).toHaveBeenCalledTimes(1);
    });
    expect(io.patchPerfil).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        passwordActual: 'mypass123',
      }),
    );
  });

  it('profile failure: renders error message and never calls patchPassword', async () => {
    const patchPerfilFail = jest
      .fn<Promise<ApiResult<void>>, [PerfilPatch]>()
      .mockResolvedValue({
        ok: false,
        error: { tag: 'http', status: 400, code: 'EMAIL_INVALIDO' },
      });
    const io = buildIo({ patchPerfil: patchPerfilFail });

    await render(<PerfilPanel me={baseMe} io={io} />);

    await llenarYEnviar({ email: 'bad-email', passwordActual: 'pass' });

    await waitFor(() => {
      expect(
        within(screen.getByRole('alert')).getByText('El email no es válido.'),
      ).toBeOnTheScreen();
    });
    expect(io.patchPassword).not.toHaveBeenCalled();
  });

  it('password failure after profile success: partial-success copy in role="alert"', async () => {
    const patchPasswordFail = jest
      .fn<Promise<ApiResult<void>>, [PasswordPatch]>()
      .mockResolvedValue({
        ok: false,
        error: { tag: 'http', status: 403, code: 'PERFIL_RECHAZADO' },
      });
    const io = buildIo({ patchPassword: patchPasswordFail });

    await render(<PerfilPanel me={baseMe} io={io} />);

    // Also change nombre so patchPerfil is called (succeeds via buildIo default),
    // making perfilGuardado: true before patchPassword fails (partial-success case).
    await llenarYEnviar({
      nombre: 'Nuevo Nombre',
      passwordActual: 'pass',
      passwordNueva: 'newpass123',
    });

    await waitFor(() => {
      expect(
        within(screen.getByRole('alert')).getByText(
          'Se guardaron tus datos, pero no se pudo cambiar la password.',
        ),
      ).toBeOnTheScreen();
    });
    // Nombre and Email retain the saved values after partial success
    expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('Nuevo Nombre');
    expect(screen.getByLabelText('Email')).toHaveDisplayValue(
      baseMe.email ?? '',
    );
    expect(io.patchPerfil).toHaveBeenCalledTimes(1);
  });

  it('full success: renders «Cambios guardados. Se cerraron tus otras sesiones.»', async () => {
    const io = buildIo();
    await render(<PerfilPanel me={baseMe} io={io} />);

    await llenarYEnviar({
      passwordActual: 'pass',
      passwordNueva: 'newpass123',
    });

    await waitFor(() => {
      expect(
        screen.getByText('Cambios guardados. Se cerraron tus otras sesiones.'),
      ).toBeOnTheScreen();
    });
    expect(io.patchPassword).toHaveBeenCalledWith({
      passwordActual: 'pass',
      passwordNueva: 'newpass123',
    });
  });

  it('ok message renders inside perfil-ok-region with accessibilityLiveRegion (design §0)', async () => {
    const io = buildIo();
    await render(<PerfilPanel me={baseMe} io={io} />);

    await llenarYEnviar({ nombre: 'Nuevo Nombre' });

    await waitFor(() => {
      expect(screen.getByText('Cambios guardados.')).toBeOnTheScreen();
    });

    expect(screen.getByTestId('perfil-ok-region')).toBeOnTheScreen();
    expect(screen.getByTestId('perfil-ok-region')).toHaveProp(
      'accessibilityLiveRegion',
      'polite',
    );
  });

  it('error message renders inside role="alert" region (design §0)', async () => {
    const patchPerfilFail = jest
      .fn<Promise<ApiResult<void>>, [PerfilPatch]>()
      .mockResolvedValue({
        ok: false,
        error: { tag: 'network' },
      });
    const io = buildIo({ patchPerfil: patchPerfilFail });

    await render(<PerfilPanel me={baseMe} io={io} />);

    await llenarYEnviar({ nombre: 'Nuevo Nombre' });

    await waitFor(() => {
      expect(
        within(screen.getByRole('alert')).getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen();
    });
  });

  it('sin-cambios: renders ok «No hay cambios para guardar.» without calling api', async () => {
    const io = buildIo();
    await render(<PerfilPanel me={baseMe} io={io} />);

    // Submit without making any changes — no act wrapper needed, no state changes
    fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(
        screen.getByText('No hay cambios para guardar.'),
      ).toBeOnTheScreen();
    });
    expect(io.patchPerfil).not.toHaveBeenCalled();
  });

  it('falta-password-actual: renders error «Ingresa tu password actual.» without calling api', async () => {
    const io = buildIo();
    await render(<PerfilPanel me={baseMe} io={io} />);

    // Change email but do not provide passwordActual
    await llenarYEnviar({ email: 'new@example.com' });

    await waitFor(() => {
      expect(screen.getByText('Ingresa tu password actual.')).toBeOnTheScreen();
    });
    expect(io.patchPerfil).not.toHaveBeenCalled();
  });
});

// Default io wiring: proves the production default (no `io` prop) calls the real api/perfil module.
jest.mock('../../api/perfil', () => ({
  patchPerfil: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
  patchPassword: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

describe('PerfilPanel — default io wiring (US-044 PR4b, JD fix)', () => {
  it('omitting io prop routes to api/perfil.patchPerfil by default', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perfilApi = require('../../api/perfil') as {
      patchPerfil: jest.MockedFunction<
        (p: unknown) => Promise<ApiResult<void>>
      >;
    };
    (perfilApi.patchPerfil as jest.Mock).mockClear();

    await render(<PerfilPanel me={baseMe} />);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nombre'), 'Nuevo Nombre');
    });
    fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(perfilApi.patchPerfil).toHaveBeenCalledTimes(1);
    });
  });
});
