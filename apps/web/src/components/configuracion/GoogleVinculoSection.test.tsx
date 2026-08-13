import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ME_QUERY_KEY } from '@/api/use-me';
import type { MeDto } from '@/api/types';
import { GoogleVinculoSection } from './GoogleVinculoSection';

const ME_VINCULADA: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: true,
};

const ME_NO_VINCULADA: MeDto = { ...ME_VINCULADA, googleVinculado: false };

/**
 * `GoogleVinculoSection` monta un `useVincularGoogle`/`useDesvincularGoogle`
 * real (`useMutation`), así que necesita un `QueryClientProvider` real +
 * `fetch` global stubeado — mismo patrón `use-guardar-perfil.test.tsx`. No
 * necesita router: a diferencia de `PerfilForm`, esta sección NO intercepta
 * `tag: 'unauthorized'` (fuera de alcance de esta tarea — `mensajeDeApiError`
 * ya devuelve `''` para ese tag, total sobre `ApiError`).
 */
function renderSeccion(
  me: MeDto,
  overrides: Partial<{
    readonly onAbrirDialogo: () => void;
    readonly onDesvinculado: () => void;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ME_QUERY_KEY, me);

  const onAbrirDialogo = overrides.onAbrirDialogo ?? vi.fn();
  const onDesvinculado = overrides.onDesvinculado ?? vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <GoogleVinculoSection
        me={me}
        onAbrirDialogo={onAbrirDialogo}
        onDesvinculado={onDesvinculado}
      />
    </QueryClientProvider>,
  );

  return { onAbrirDialogo, onDesvinculado, queryClient };
}

describe('GoogleVinculoSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('vinculada: pill "Vinculada: {email}" + botón Desvincular', () => {
    renderSeccion(ME_VINCULADA);
    expect(screen.getByText('Vinculada: ana@example.com')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desvincular' }),
    ).toBeInTheDocument();
  });

  it('no vinculada: pill "No vinculada" + botón Vincular con Google', () => {
    renderSeccion(ME_NO_VINCULADA);
    expect(screen.getByText('No vinculada')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Vincular con Google' }),
    ).toBeInTheDocument();
  });

  it('email null estando vinculada renderiza "Vinculada" sin dos puntos ni dirección', () => {
    renderSeccion({ ...ME_VINCULADA, email: null });
    expect(screen.getByText('Vinculada')).toBeInTheDocument();
    expect(screen.queryByText(/Vinculada:/)).not.toBeInTheDocument();
  });

  it('clic en el trigger abre el diálogo y limpia el aviso de Google (onAbrirDialogo)', async () => {
    const user = userEvent.setup();
    const { onAbrirDialogo } = renderSeccion(ME_NO_VINCULADA);

    await user.click(
      screen.getByRole('button', { name: 'Vincular con Google' }),
    );

    expect(onAbrirDialogo).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('Cancelar cierra el diálogo y restaura el foco al trigger', async () => {
    const user = userEvent.setup();
    renderSeccion(ME_NO_VINCULADA);

    const trigger = screen.getByRole('button', {
      name: 'Vincular con Google',
    });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Escape cierra el diálogo y restaura el foco al trigger', async () => {
    const user = userEvent.setup();
    renderSeccion(ME_NO_VINCULADA);

    const trigger = screen.getByRole('button', {
      name: 'Vincular con Google',
    });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('desvincular con éxito cierra el diálogo, restaura el foco, invalida auth-me y avisa al padre', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    const { onDesvinculado, queryClient } = renderSeccion(ME_VINCULADA);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const trigger = screen.getByRole('button', { name: 'Desvincular' });
    await user.click(trigger);
    await user.type(screen.getByLabelText('Password actual'), 'actual123');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Desvincular',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
    expect(onDesvinculado).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ME_QUERY_KEY });
  });

  it('vincular con éxito navega vía window.location.assign, el diálogo no necesita cerrarse', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
        }),
      }),
    );
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      writable: true,
      configurable: true,
    });

    renderSeccion(ME_NO_VINCULADA);

    await user.click(
      screen.getByRole('button', { name: 'Vincular con Google' }),
    );
    await user.type(screen.getByLabelText('Password actual'), 'actual123');
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      ),
    );
  });

  it('password incorrecta muestra el error inline y mantiene el diálogo abierto', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'x', code: 'PERFIL_RECHAZADO' }),
      }),
    );

    renderSeccion(ME_VINCULADA);

    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    await user.type(screen.getByLabelText('Password actual'), 'mala');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Desvincular',
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se pudo completar la acción. Revisa tu password actual.',
      ),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('cuenta demo: nota role=note y botón deshabilitado', () => {
    renderSeccion({ ...ME_NO_VINCULADA, esDemo: true, email: null });

    expect(
      screen.getByRole('button', { name: 'Vincular con Google' }),
    ).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.',
    );
  });
});
