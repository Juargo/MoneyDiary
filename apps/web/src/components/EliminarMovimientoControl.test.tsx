import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EliminarMovimientoControl } from './EliminarMovimientoControl';
import {
  UNDO_GRACE_MS,
  deshacerEliminacionPendiente,
  getPendingIds,
  getUndoSnapshot,
  resetUndoManagerParaTests,
} from '@/lib/undo-manager';

/**
 * EliminarMovimientoControl.test.tsx — design-hardening change (undo grace
 * window, resolves critique P1). Confirmar no longer fires the DELETE
 * synchronously: it schedules a delayed commit via the shared
 * `undo-manager` singleton and closes its dialog immediately (the caller's
 * list — `IngresosMesTable`/`GrupoMovimientos` — is responsible for hiding
 * the row itself, via `usePendingIds()`; that is exercised in THOSE
 * components' own tests, not here). This file exercises the CONTROL's own
 * contract: what it schedules, when, and with what copy.
 *
 * Timer strategy: dialog interaction (open/cancel/escape/confirm) uses
 * `userEvent` under REAL timers, same as before this change — mixing
 * `userEvent`'s own internal real-timer-based promise machinery with fake
 * timers deadlocks (`await user.click(...)` never resolves). Tests that
 * need to control the grace window switch to `vi.useFakeTimers()` only
 * AFTER the dialog is open, then fire "Confirmar" via `fireEvent` (plain,
 * synchronous — no internal timers of its own) so the `setTimeout` inside
 * `programarEliminacion` is scheduled on the fake clock from the start.
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

async function abrirYConfirmar() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: /Eliminar movimiento Bono navidad/i }),
  );
  await screen.findByRole('alertdialog');
  const confirmarButton = screen.getByRole('button', { name: 'Confirmar' });
  vi.useFakeTimers();
  fireEvent.click(confirmarButton);
}

describe('EliminarMovimientoControl', () => {
  afterEach(() => {
    resetUndoManagerParaTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
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

  it('clicking "Eliminar" opens an alertdialog disclosing fecha, monto, descripcion, and the truthful (not "cannot be undone") copy', async () => {
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
    expect(dialog).toHaveTextContent(
      'Podrás deshacer durante unos segundos después de confirmar.',
    );
    expect(dialog).not.toHaveTextContent('no se puede deshacer');
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

  it('Cancelar closes the dialog without scheduling a delete and returns focus to the trigger', async () => {
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
    expect(getUndoSnapshot()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('Escape closes the dialog without scheduling a delete and returns focus to the trigger', async () => {
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
    expect(getUndoSnapshot()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('Confirmar closes the dialog and calls onEliminado immediately, WITHOUT firing the DELETE', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    const onEliminado = vi.fn();
    render(<EliminarMovimientoControl {...PROPS} onEliminado={onEliminado} />, {
      wrapper: crearWrapper(),
    });

    await abrirYConfirmar();

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onEliminado).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('schedules the delayed delete via the shared undo manager with the movement message', async () => {
    mockFetchOnce({ ok: true, status: 204 });
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await abrirYConfirmar();

    expect(getUndoSnapshot()).toMatchObject({
      kind: 'pendiente',
      mensaje: 'Movimiento eliminado.',
    });
  });

  it('grace-window expiry fires exactly one DELETE for the scheduled id', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await abrirYConfirmar();
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_GRACE_MS);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/movimientos/tx-1', {
      method: 'DELETE',
      keepalive: false,
    });
  });

  // Adversarial-review fix (defect 1, applied uniformly to the single-row
  // flows too): the id must stay hidden (reported by `getPendingIds()`,
  // which the caller list filters on) for the FULL DELETE round-trip, not
  // just until the grace window expires — otherwise the row could flash
  // back into view while its own DELETE is still in flight.
  it('the id stays reported as pending for the full DELETE round-trip, not just until grace expires', async () => {
    let resolverFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolverFetch = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await abrirYConfirmar();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_GRACE_MS);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Grace expired and the DELETE is in flight — this is the exact bug:
    // the id must NOT have reappeared yet.
    expect(getPendingIds()).toEqual(new Set(['tx-1']));

    await act(async () => {
      resolverFetch({ ok: true, status: 204 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getPendingIds()).toEqual(new Set());
  });

  it('undo before the grace window expires cancels the scheduled delete — no DELETE fires', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await abrirYConfirmar();

    act(() => {
      deshacerEliminacionPendiente();
    });
    act(() => {
      vi.advanceTimersByTime(UNDO_GRACE_MS);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on a deferred delete failure, reports the error to the shared undo manager', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    render(<EliminarMovimientoControl {...PROPS} />, {
      wrapper: crearWrapper(),
    });

    await abrirYConfirmar();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_GRACE_MS);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getUndoSnapshot()).toMatchObject({ kind: 'error' });
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
