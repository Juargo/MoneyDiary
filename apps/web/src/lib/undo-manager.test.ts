import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UNDO_GRACE_MS,
  deshacerEliminacionPendiente,
  flushEliminacionPendiente,
  getPendingIds,
  getUndoSnapshot,
  pausarEliminacionPendiente,
  programarEliminacion,
  reanudarEliminacionPendiente,
  reportarErrorEliminacion,
  resetUndoManagerParaTests,
  subscribeUndo,
} from './undo-manager';

/**
 * undo-manager.test.ts — design-hardening change (undo grace window for
 * every destructive delete). Unit-tests the pure timer/state machine behind
 * `UndoToast` and the three delete flows, independent of React/DOM: fake
 * timers exercise the grace window, pause/resume, forced flush, and the
 * "new delete while one pending flushes the previous" rule directly.
 */

describe('undo-manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Drain whatever is pending/errored so one test's state never leaks
    // into the next (module singleton — state persists across `it` blocks
    // otherwise).
    resetUndoManagerParaTests();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('reports the scheduled ids as pending immediately', () => {
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit: vi.fn(),
      onPageHide: vi.fn(),
    });

    expect(getPendingIds()).toEqual(new Set(['tx-1']));
    expect(getUndoSnapshot()).toMatchObject({
      kind: 'pendiente',
      mensaje: 'Movimiento eliminado.',
      graceMs: UNDO_GRACE_MS,
      paused: false,
    });
  });

  it('undo within the window cancels the timer, clears pending ids, and never calls onCommit', () => {
    const onCommit = vi.fn();
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit,
      onPageHide: vi.fn(),
    });

    vi.advanceTimersByTime(3000);
    deshacerEliminacionPendiente();

    expect(getPendingIds()).toEqual(new Set());
    expect(getUndoSnapshot()).toBeNull();

    vi.advanceTimersByTime(UNDO_GRACE_MS);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('window expiry fires onCommit exactly once and clears pending state (and, once the void onCommit settles, the committing set too)', async () => {
    const onCommit = vi.fn();
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit,
      onPageHide: vi.fn(),
    });

    vi.advanceTimersByTime(UNDO_GRACE_MS);

    expect(onCommit).toHaveBeenCalledTimes(1);
    // `pending` is already null — `getUndoSnapshot()` (the toast) reflects
    // that immediately, even though the id is still briefly "committing".
    expect(getUndoSnapshot()).toBeNull();
    // Committing window fix: the id stays reported for one microtask past
    // the synchronous `onCommit()` return, until its wrapped promise
    // settles.
    await Promise.resolve();
    await Promise.resolve();
    expect(getPendingIds()).toEqual(new Set());

    // Nothing else fires later.
    vi.advanceTimersByTime(UNDO_GRACE_MS);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('starting a new delete while one is pending flushes the previous one immediately', async () => {
    const onCommitPrevious = vi.fn();
    const onCommitNext = vi.fn();
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit: onCommitPrevious,
      onPageHide: vi.fn(),
    });

    vi.advanceTimersByTime(1000);
    programarEliminacion({
      ids: ['tx-2'],
      mensaje: 'Movimiento eliminado.',
      onCommit: onCommitNext,
      onPageHide: vi.fn(),
    });

    expect(onCommitPrevious).toHaveBeenCalledTimes(1);
    expect(onCommitNext).not.toHaveBeenCalled();
    // tx-1 is still momentarily "committing" (its void onCommit hasn't
    // settled yet) — both ids are reported until that microtask drains.
    await Promise.resolve();
    await Promise.resolve();
    expect(getPendingIds()).toEqual(new Set(['tx-2']));

    vi.advanceTimersByTime(UNDO_GRACE_MS);
    expect(onCommitNext).toHaveBeenCalledTimes(1);
  });

  it('flushEliminacionPendiente commits early (unmount/navigation) and is a no-op with nothing pending', async () => {
    const onCommit = vi.fn();
    programarEliminacion({
      ids: ['ingesta-1'],
      mensaje: 'Cartola eliminada.',
      onCommit,
      onPageHide: vi.fn(),
    });

    vi.advanceTimersByTime(500);
    flushEliminacionPendiente();

    expect(onCommit).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(getPendingIds()).toEqual(new Set());

    // No-op: nothing pending now.
    flushEliminacionPendiente();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('pause stops the timer from firing and resume continues it for exactly the remaining time', () => {
    const onCommit = vi.fn();
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit,
      onPageHide: vi.fn(),
    });

    vi.advanceTimersByTime(2000);
    pausarEliminacionPendiente();
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    // Well past the original grace window, but paused — must NOT fire.
    vi.advanceTimersByTime(UNDO_GRACE_MS);
    expect(onCommit).not.toHaveBeenCalled();

    reanudarEliminacionPendiente();
    expect(getUndoSnapshot()).toMatchObject({ paused: false });

    // Exactly the remaining 5000ms (7000 - 2000 elapsed before pause).
    vi.advanceTimersByTime(UNDO_GRACE_MS - 2000 - 1);
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('pause/resume are no-ops when nothing is pending or already in that state', () => {
    expect(() => pausarEliminacionPendiente()).not.toThrow();
    expect(() => reanudarEliminacionPendiente()).not.toThrow();

    const onCommit = vi.fn();
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit,
      onPageHide: vi.fn(),
    });
    pausarEliminacionPendiente();
    // Already paused — second call must not double-subtract elapsed time.
    vi.advanceTimersByTime(1000);
    pausarEliminacionPendiente();
    reanudarEliminacionPendiente();
    vi.advanceTimersByTime(UNDO_GRACE_MS - 1);
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('reportarErrorEliminacion surfaces an error snapshot that auto-dismisses', () => {
    reportarErrorEliminacion('No se pudo eliminar el movimiento.');

    expect(getUndoSnapshot()).toEqual({
      kind: 'error',
      mensaje: 'No se pudo eliminar el movimiento.',
    });

    vi.advanceTimersByTime(6000);
    expect(getUndoSnapshot()).toBeNull();
  });

  it('scheduling a new delete clears a stale error banner', () => {
    reportarErrorEliminacion('No se pudo eliminar el movimiento.');
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit: vi.fn(),
      onPageHide: vi.fn(),
    });

    expect(getUndoSnapshot()).toMatchObject({ kind: 'pendiente' });
  });

  it('notifies subscribers on every state transition (schedule, pause, resume, undo, commit)', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUndo(listener);

    programarEliminacion({
      ids: ['tx-1'],
      mensaje: 'Movimiento eliminado.',
      onCommit: vi.fn(),
      onPageHide: vi.fn(),
    });
    expect(listener).toHaveBeenCalledTimes(1);

    pausarEliminacionPendiente();
    expect(listener).toHaveBeenCalledTimes(2);

    reanudarEliminacionPendiente();
    expect(listener).toHaveBeenCalledTimes(3);

    deshacerEliminacionPendiente();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    programarEliminacion({
      ids: ['tx-2'],
      mensaje: 'Movimiento eliminado.',
      onCommit: vi.fn(),
      onPageHide: vi.fn(),
    });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('pagehide fires onPageHide (keepalive escape hatch) instead of onCommit, and clears pending', () => {
    const onCommit = vi.fn();
    const onPageHide = vi.fn();
    programarEliminacion({
      ids: ['ingesta-1', 'ingesta-2'],
      mensaje: '2 cartolas eliminadas.',
      onCommit,
      onPageHide,
    });

    window.dispatchEvent(new Event('pagehide'));

    expect(onPageHide).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(getPendingIds()).toEqual(new Set());
  });

  it('pagehide is a no-op when nothing is pending', () => {
    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
  });

  // Adversarial-review fix (defect 1): the old behavior cleared `pending`
  // (and therefore `getPendingIds()`) the INSTANT the grace window expired,
  // before the real (possibly long-running, e.g. sequential bulk) mutation
  // in `onCommit` ever settled — rows reappeared for the whole in-flight
  // window. A user could then re-select and re-delete an already-deleted
  // row, producing a false "no se pudo eliminar" (404) for a delete that
  // actually succeeded. Fix: ids stay reported by `getPendingIds()`
  // (pending ∪ "committing") until the `onCommit` promise settles.
  describe('committing window (ids stay hidden until onCommit settles)', () => {
    it('keeps ids reported as pending while the async onCommit is in flight, and clears them once it resolves', async () => {
      let resolverCommit: () => void = () => {};
      const onCommit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolverCommit = resolve;
          }),
      );
      programarEliminacion({
        ids: ['ingesta-1', 'ingesta-2'],
        mensaje: '2 cartolas eliminadas.',
        onCommit,
        onPageHide: vi.fn(),
      });

      vi.advanceTimersByTime(UNDO_GRACE_MS);
      expect(onCommit).toHaveBeenCalledTimes(1);

      // Grace expired, but the mutation is still in flight — ids must
      // STILL be reported as pending (this is the exact bug: the old code
      // cleared them here already).
      expect(getPendingIds()).toEqual(new Set(['ingesta-1', 'ingesta-2']));

      resolverCommit();
      await vi.waitFor(() => {
        expect(getPendingIds()).toEqual(new Set());
      });
    });

    it('clears ids on a REJECTED onCommit too (failure still ends the committing window)', async () => {
      let rejectCommit: () => void = () => {};
      const onCommit = vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectCommit = () => reject(new Error('boom'));
          }),
      );
      programarEliminacion({
        ids: ['tx-1'],
        mensaje: 'Movimiento eliminado.',
        onCommit,
        onPageHide: vi.fn(),
      });

      vi.advanceTimersByTime(UNDO_GRACE_MS);
      expect(getPendingIds()).toEqual(new Set(['tx-1']));

      rejectCommit();
      await vi.waitFor(() => {
        expect(getPendingIds()).toEqual(new Set());
      });
    });

    it('keeps a synchronous (non-Promise-returning) onCommit compatible — resolves the committing window on the next microtask', async () => {
      const onCommit = vi.fn(); // returns undefined, like the pre-fix callers
      programarEliminacion({
        ids: ['tx-1'],
        mensaje: 'Movimiento eliminado.',
        onCommit,
        onPageHide: vi.fn(),
      });

      vi.advanceTimersByTime(UNDO_GRACE_MS);
      await vi.waitFor(() => {
        expect(getPendingIds()).toEqual(new Set());
      });
    });

    it('two overlapping committing batches with distinct ids both stay hidden until EACH settles independently', async () => {
      let resolverA: () => void = () => {};
      let resolverB: () => void = () => {};
      programarEliminacion({
        ids: ['a-1'],
        mensaje: 'A eliminado.',
        onCommit: () => new Promise<void>((resolve) => (resolverA = resolve)),
        onPageHide: vi.fn(),
      });
      vi.advanceTimersByTime(UNDO_GRACE_MS);
      // Batch A is now committing (not pending) — scheduling B does not
      // flush it (nothing is `pending` right now, only committing).
      programarEliminacion({
        ids: ['b-1'],
        mensaje: 'B eliminado.',
        onCommit: () => new Promise<void>((resolve) => (resolverB = resolve)),
        onPageHide: vi.fn(),
      });
      vi.advanceTimersByTime(UNDO_GRACE_MS);

      expect(getPendingIds()).toEqual(new Set(['a-1', 'b-1']));

      resolverA();
      await vi.waitFor(() => {
        expect(getPendingIds()).toEqual(new Set(['b-1']));
      });

      resolverB();
      await vi.waitFor(() => {
        expect(getPendingIds()).toEqual(new Set());
      });
    });

    it('flushEliminacionPendiente() also keeps the flushed ids hidden until the async onCommit settles', async () => {
      let resolverCommit: () => void = () => {};
      programarEliminacion({
        ids: ['tx-1'],
        mensaje: 'Movimiento eliminado.',
        onCommit: () =>
          new Promise<void>((resolve) => {
            resolverCommit = resolve;
          }),
        onPageHide: vi.fn(),
      });

      flushEliminacionPendiente();
      expect(getPendingIds()).toEqual(new Set(['tx-1']));

      resolverCommit();
      await vi.waitFor(() => {
        expect(getPendingIds()).toEqual(new Set());
      });
    });
  });
});
