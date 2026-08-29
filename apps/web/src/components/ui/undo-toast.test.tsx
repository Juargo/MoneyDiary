import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { UndoToast } from './undo-toast';
import {
  getPendingIds,
  getUndoSnapshot,
  programarEliminacion,
  reportarErrorEliminacion,
  resetUndoManagerParaTests,
} from '@/lib/undo-manager';

/**
 * undo-toast.test.tsx — design-hardening change (undo grace window).
 * `UndoToast` is a pure reader of the `undo-manager` singleton: no props,
 * mounted once at the router root. Tests drive state through the manager's
 * own functions (the same ones the three delete flows call) rather than
 * mocking the module, so the test exercises the real integration.
 */

function schedulePending(overrides?: { mensaje?: string }) {
  act(() => {
    programarEliminacion({
      ids: ['tx-1'],
      mensaje: overrides?.mensaje ?? 'Movimiento eliminado.',
      onCommit: vi.fn(),
      onPageHide: vi.fn(),
    });
  });
}

function scheduleError(mensaje: string) {
  act(() => {
    reportarErrorEliminacion(mensaje);
  });
}

describe('UndoToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Drain any pending/errored state left by a test so it can't leak into
    // the next one (module singleton).
    resetUndoManagerParaTests();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders nothing when there is no pending action', () => {
    render(<UndoToast />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a polite status region with the message and a "Deshacer" button while pending', () => {
    render(<UndoToast />);
    schedulePending({ mensaje: 'Movimiento eliminado.' });

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Movimiento eliminado.');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(
      screen.getByRole('button', { name: 'Deshacer' }),
    ).toBeInTheDocument();
  });

  it('pluralized bulk message renders verbatim', () => {
    render(<UndoToast />);
    schedulePending({ mensaje: '3 cartolas eliminadas.' });

    expect(screen.getByRole('status')).toHaveTextContent(
      '3 cartolas eliminadas.',
    );
  });

  it('"Deshacer" cancels the pending delete via the manager', () => {
    // `fireEvent` (not `userEvent`, which schedules its own real-time
    // delays that deadlock alongside fake timers) — a plain click is
    // enough to exercise the button's onClick wiring.
    render(<UndoToast />);
    schedulePending();
    expect(getPendingIds()).toEqual(new Set(['tx-1']));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    });

    expect(getPendingIds()).toEqual(new Set());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('the "Deshacer" button is a real, tabbable button at the house default size', () => {
    render(<UndoToast />);
    schedulePending();

    const button = screen.getByRole('button', { name: 'Deshacer' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('data-size', 'default');
  });

  it('hover pauses the underlying timer (not just the CSS animation)', () => {
    render(<UndoToast />);
    schedulePending();

    const toast = screen.getByRole('status');
    act(() => {
      fireEvent.mouseEnter(toast);
    });
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    act(() => {
      fireEvent.mouseLeave(toast);
    });
    expect(getUndoSnapshot()).toMatchObject({ paused: false });
  });

  it('focus inside the toast pauses the timer and blur resumes it', () => {
    render(<UndoToast />);
    schedulePending();

    const button = screen.getByRole('button', { name: 'Deshacer' });
    button.focus();
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    button.blur();
    expect(getUndoSnapshot()).toMatchObject({ paused: false });
  });

  // Adversarial-review fix (defect 2): hover and focus-within must compose
  // as two INDEPENDENT conditions — resuming on mouseleave while focus is
  // still inside (or on blur while the mouse is still hovering) would
  // resume the countdown out from under a keyboard user, a WCAG 2.2.1
  // violation. Both orderings must keep the timer paused until BOTH
  // conditions clear.
  it('hover → focus → unhover keeps the timer paused (mouse leaves, focus remains)', () => {
    render(<UndoToast />);
    schedulePending();

    const toast = screen.getByRole('status');
    const button = screen.getByRole('button', { name: 'Deshacer' });

    fireEvent.mouseEnter(toast);
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    button.focus();
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    fireEvent.mouseLeave(toast);
    // Focus is still inside — must NOT resume.
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    button.blur();
    // Now both conditions are clear — resumes.
    expect(getUndoSnapshot()).toMatchObject({ paused: false });
  });

  it('focus → hover → blur keeps the timer paused (focus leaves, mouse remains)', () => {
    render(<UndoToast />);
    schedulePending();

    const toast = screen.getByRole('status');
    const button = screen.getByRole('button', { name: 'Deshacer' });

    button.focus();
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    fireEvent.mouseEnter(toast);
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    button.blur();
    // The mouse is still hovering — must NOT resume.
    expect(getUndoSnapshot()).toMatchObject({ paused: true });

    fireEvent.mouseLeave(toast);
    // Now both conditions are clear — resumes.
    expect(getUndoSnapshot()).toMatchObject({ paused: false });
  });

  it('shows an alert-role destructive message on deferred delete failure, with no "Deshacer" button', () => {
    render(<UndoToast />);
    scheduleError('No se pudo eliminar el movimiento.');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No se pudo eliminar el movimiento.');
    expect(
      screen.queryByRole('button', { name: 'Deshacer' }),
    ).not.toBeInTheDocument();
  });

  it('respects prefers-reduced-motion: renders static text instead of an animated progress bar', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(<UndoToast />);
    schedulePending();

    expect(screen.queryByTestId('undo-toast-progress')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/deshacer/i);
    vi.unstubAllGlobals();
  });

  it('renders the animated progress bar when motion is not reduced', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(<UndoToast />);
    schedulePending();

    expect(screen.getByTestId('undo-toast-progress')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('has no axe violations while pending', async () => {
    // axe-core's own async internals rely on real timers/microtasks — fake
    // timers here would hang the run (unrelated to the undo countdown this
    // suite otherwise fakes).
    vi.useRealTimers();
    const { container } = render(<UndoToast />);
    schedulePending();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the error state', async () => {
    vi.useRealTimers();
    const { container } = render(<UndoToast />);
    scheduleError('No se pudo eliminar el movimiento.');

    expect(await axe(container)).toHaveNoViolations();
  });
});
