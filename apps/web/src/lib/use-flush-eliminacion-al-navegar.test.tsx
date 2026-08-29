import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useFlushEliminacionAlNavegar } from './use-flush-eliminacion-al-navegar';
import { programarEliminacion } from './undo-manager';

function Probe({ watchKey }: { readonly watchKey: string }) {
  useFlushEliminacionAlNavegar(watchKey);
  return null;
}

describe('useFlushEliminacionAlNavegar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes the pending delete when watchKey changes (route navigation)', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Probe watchKey="/ingestas" />);
    programarEliminacion({
      ids: ['ingesta-1'],
      mensaje: 'Cartola eliminada.',
      onCommit,
      onPageHide: vi.fn(),
    });

    rerender(<Probe watchKey="/semaforo" />);

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('flushes the pending delete on unmount', () => {
    const onCommit = vi.fn();
    const { unmount } = render(<Probe watchKey="/ingestas" />);
    programarEliminacion({
      ids: ['ingesta-1'],
      mensaje: 'Cartola eliminada.',
      onCommit,
      onPageHide: vi.fn(),
    });

    unmount();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nothing is pending', () => {
    const { rerender, unmount } = render(<Probe watchKey="/a" />);
    expect(() => rerender(<Probe watchKey="/b" />)).not.toThrow();
    expect(() => unmount()).not.toThrow();
  });
});
