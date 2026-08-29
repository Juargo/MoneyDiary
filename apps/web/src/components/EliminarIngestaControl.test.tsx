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
import { EliminarIngestaControl } from './EliminarIngestaControl';
import {
  UNDO_GRACE_MS,
  deshacerEliminacionPendiente,
  getPendingIds,
  getUndoSnapshot,
  resetUndoManagerParaTests,
} from '@/lib/undo-manager';

/**
 * EliminarIngestaControl.test.tsx — design-hardening change (undo grace
 * window, resolves critique P1). Same rewiring as
 * `EliminarMovimientoControl.test.tsx`: Confirmar schedules a delayed
 * commit via `undo-manager.ts` instead of firing the DELETE synchronously.
 * See that file's docstring for the fake-timer/`userEvent` interaction
 * strategy this file mirrors.
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

async function abrirYConfirmar() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }),
  );
  await screen.findByRole('alertdialog');
  const confirmarButton = screen.getByRole('button', { name: 'Confirmar' });
  vi.useFakeTimers();
  fireEvent.click(confirmarButton);
}

describe('EliminarIngestaControl', () => {
  afterEach(() => {
    resetUndoManagerParaTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('exposes a distinguishing accessible name including the banco and fecha (a11y)', () => {
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    expect(
      screen.getByRole('button', {
        name: /Eliminar cartola BancoEstado \(2026-07-15\)/i,
      }),
    ).toBeInTheDocument();
  });

  it('clicking "Eliminar" opens an alertdialog stating the exact impact count and the truthful (not "cannot be undone") copy', async () => {
    const user = userEvent.setup();
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(
      screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Se eliminarán 12 movimientos de BancoEstado',
    );
    expect(dialog).toHaveTextContent(
      'Podrás deshacer durante unos segundos después de confirmar.',
    );
    expect(dialog).not.toHaveTextContent('no se puede deshacer');
  });

  it('for a fallida ingesta, states the impact without the misleading "0 movimientos" (US-004)', async () => {
    const user = userEvent.setup();
    render(
      <EliminarIngestaControl
        id="ingesta-2"
        banco="Santander"
        fechaLabel="2026-07-20"
        estado="fallido"
        totalTransacciones={0}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(
      screen.getByRole('button', { name: /Eliminar cartola Santander/i }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Se eliminará esta cartola fallida de Santander',
    );
    expect(dialog).not.toHaveTextContent('movimientos');
    expect(dialog).toHaveTextContent(
      'Podrás deshacer durante unos segundos después de confirmar.',
    );
  });

  it('moves focus to the confirm button when the dialog opens', async () => {
    const user = userEvent.setup();
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(
      screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }),
    );
    await screen.findByRole('alertdialog');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus(),
    );
  });

  it('Cancelar closes the dialog without scheduling a delete and returns focus to the trigger', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    const user = userEvent.setup();
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    const trigger = screen.getByRole('button', {
      name: /Eliminar cartola BancoEstado/i,
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
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    const trigger = screen.getByRole('button', {
      name: /Eliminar cartola BancoEstado/i,
    });
    await user.click(trigger);
    await screen.findByRole('alertdialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(getUndoSnapshot()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('Confirmar closes the dialog immediately, WITHOUT firing the DELETE', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await abrirYConfirmar();

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('schedules the delayed delete via the shared undo manager with the ingesta message', async () => {
    mockFetchOnce({ ok: true, status: 204 });
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await abrirYConfirmar();

    expect(getUndoSnapshot()).toMatchObject({
      kind: 'pendiente',
      mensaje: 'Cartola eliminada.',
    });
  });

  it('grace-window expiry fires exactly one DELETE for the scheduled id', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await abrirYConfirmar();
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_GRACE_MS);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/ingestas/ingesta-1', {
      method: 'DELETE',
      keepalive: false,
    });
  });

  // Adversarial-review fix (defect 1, applied uniformly to the single-row
  // flows too): the id must stay hidden (reported by `getPendingIds()`,
  // which `ListaIngestas` filters on) for the FULL DELETE round-trip, not
  // just until the grace window expires.
  it('the id stays reported as pending for the full DELETE round-trip, not just until grace expires', async () => {
    let resolverFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolverFetch = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await abrirYConfirmar();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_GRACE_MS);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Grace expired and the DELETE is in flight — this is the exact bug:
    // the id must NOT have reappeared yet.
    expect(getPendingIds()).toEqual(new Set(['ingesta-1']));

    await act(async () => {
      resolverFetch({ ok: true, status: 204 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getPendingIds()).toEqual(new Set());
  });

  it('undo before the grace window expires cancels the scheduled delete — no DELETE fires', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

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
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await abrirYConfirmar();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_GRACE_MS);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getUndoSnapshot()).toMatchObject({ kind: 'error' });
  });

  // Touch-target quick win (round 2, P2): destructive confirms under a
  // distracted thumb get the house default 36px control, not the 24px
  // `xs` size used for compact inline rows. Asserted via Button's own
  // `data-size` contract, not class strings.
  it('renders Confirmar and Cancelar at the default (36px) touch target, not xs', async () => {
    const user = userEvent.setup();
    render(
      <EliminarIngestaControl
        id="ingesta-1"
        banco="BancoEstado"
        fechaLabel="2026-07-15"
        estado="exitoso"
        totalTransacciones={12}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(
      screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }),
    );
    await screen.findByRole('alertdialog');

    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveAttribute(
      'data-size',
      'default',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute(
      'data-size',
      'default',
    );
  });

  // issue #500: demo (esDemo) client-side honesty — the server already
  // rejects a demo DELETE (IngestaDemoSoloLecturaError), this proactively
  // disables the trigger so a demo session never even gets to try.
  describe('demo session (esDemo, issue #500)', () => {
    it('disables the trigger and clicking it does not open the dialog', async () => {
      const fetchMock = mockFetchOnce({ ok: true, status: 204 });
      const user = userEvent.setup();
      render(
        <EliminarIngestaControl
          id="ingesta-1"
          banco="BancoEstado"
          fechaLabel="2026-07-15"
          estado="exitoso"
          totalTransacciones={12}
          esDemo
        />,
        { wrapper: crearWrapper() },
      );

      const trigger = screen.getByRole('button', {
        name: /Eliminar cartola BancoEstado/i,
      });
      expect(trigger).toBeDisabled();

      await user.click(trigger);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('esDemo=false (default) leaves the trigger enabled, unchanged', () => {
      render(
        <EliminarIngestaControl
          id="ingesta-1"
          banco="BancoEstado"
          fechaLabel="2026-07-15"
          estado="exitoso"
          totalTransacciones={12}
        />,
        { wrapper: crearWrapper() },
      );

      expect(
        screen.getByRole('button', {
          name: /Eliminar cartola BancoEstado/i,
        }),
      ).toBeEnabled();
    });
  });
});
