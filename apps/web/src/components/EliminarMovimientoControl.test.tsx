import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EliminarMovimientoControl } from './EliminarMovimientoControl';

/**
 * EliminarMovimientoControl.test.tsx — SDD `correccion-movimientos-manuales`
 * PR 3 (design D-03, spec WEB-DEL-01). Structural clone of
 * `EliminarIngestaControl.test.tsx`: same InlineConfirm shell, same
 * error-stays-open idiom, same esDemo proactive-disable idiom. The dialog
 * discloses fecha/monto/descripcion (WEB-DEL-01) instead of banco/estado/
 * totalTransacciones (this control has no per-row "impact count" — deleting
 * one row is always exactly one row).
 */

function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const PROPS = {
  id: 'tx-1',
  fechaLabel: '2026-07-15',
  descripcion: 'Bono navidad',
  montoLabel: '+$50.000',
};

describe('EliminarMovimientoControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exposes a distinguishing accessible name including fecha and descripcion (a11y, per-row disambiguation)', () => {
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    expect(
      screen.getByRole('button', {
        name: /Eliminar movimiento Bono navidad \(2026-07-15\)/i,
      }),
    ).toBeInTheDocument();
  });

  it('clicking "Eliminar" opens an alertdialog disclosing fecha, monto and descripcion (WEB-DEL-01)', async () => {
    const user = userEvent.setup();
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await user.click(
      screen.getByRole('button', { name: /Eliminar movimiento Bono navidad/i }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('2026-07-15');
    expect(dialog).toHaveTextContent('Bono navidad');
    expect(dialog).toHaveTextContent('+$50.000');
    expect(dialog).toHaveTextContent('Esta acción no se puede deshacer.');
  });

  it('moves focus to the confirm button when the dialog opens', async () => {
    const user = userEvent.setup();
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await user.click(
      screen.getByRole('button', { name: /Eliminar movimiento Bono navidad/i }),
    );
    await screen.findByRole('alertdialog');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus(),
    );
  });

  it('Cancelar closes the dialog without issuing a DELETE and returns focus to the trigger', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    const user = userEvent.setup();
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    const trigger = screen.getByRole('button', {
      name: /Eliminar movimiento Bono navidad/i,
    });
    await user.click(trigger);
    await screen.findByRole('alertdialog');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('Escape closes the dialog without issuing a DELETE and returns focus to the trigger', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    const user = userEvent.setup();
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    const trigger = screen.getByRole('button', {
      name: /Eliminar movimiento Bono navidad/i,
    });
    await user.click(trigger);
    await screen.findByRole('alertdialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('Confirmar fires the DELETE and on success closes the dialog and calls onEliminado', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    const onEliminado = vi.fn();
    const user = userEvent.setup();
    render(<EliminarMovimientoControl {...PROPS} onEliminado={onEliminado} />, {
      wrapper: crearWrapper(),
    });

    await user.click(
      screen.getByRole('button', { name: /Eliminar movimiento Bono navidad/i }),
    );
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/movimientos/tx-1', {
        method: 'DELETE',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(onEliminado).toHaveBeenCalledTimes(1);
  });

  it('disables the confirm button while the mutation is pending', async () => {
    let resolverFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolverFetch = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await user.click(
      screen.getByRole('button', { name: /Eliminar movimiento Bono navidad/i }),
    );
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled(),
    );
    resolverFetch({ ok: true, status: 204 });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
  });

  it('on a failed delete shows an error message and KEEPS the dialog open for retry (WEB-DEL-01)', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const user = userEvent.setup();
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await user.click(
      screen.getByRole('button', { name: /Eliminar movimiento Bono navidad/i }),
    );
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  describe('demo session (esDemo)', () => {
    it('disables the trigger and clicking it does not open the dialog', async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 204 });
      const user = userEvent.setup();
      render(<EliminarMovimientoControl {...PROPS} esDemo />, {
        wrapper: crearWrapper(),
      });

      const trigger = screen.getByRole('button', {
        name: /Eliminar movimiento Bono navidad/i,
      });
      expect(trigger).toBeDisabled();

      await user.click(trigger);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('esDemo=false (default) leaves the trigger enabled, unchanged', () => {
      render(<EliminarMovimientoControl {...PROPS} />, {
        wrapper: crearWrapper(),
      });

      expect(
        screen.getByRole('button', {
          name: /Eliminar movimiento Bono navidad/i,
        }),
      ).toBeEnabled();
    });
  });
});
