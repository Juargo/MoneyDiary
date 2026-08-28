import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodoSelector } from './PeriodoSelector';

// Period header backed by the route's search param (design.md D2 — TanStack
// Router search params, not zustand). Pure presentational: the container
// (routes/index.tsx) owns the `navigate({ search: (prev) => ({ ...prev,
// periodo }) })` call; this component only reports the new value via
// `onChange` (period-selector-header WPER-01..07). Props stay verbatim
// `{ periodo, onChange }` (design.md decision #2), so "today" is faked via
// vitest's system clock rather than an extra prop. Uses `fireEvent` (not
// `userEvent`) — `userEvent`'s async click scheduling hangs under fake
// timers.
describe('PeriodoSelector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the formatted month label prominently', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />);
    expect(screen.getByText('julio 2026')).toBeInTheDocument();
  });

  it('calls onChange with the previous month when "Mes anterior" is activated', () => {
    const onChange = vi.fn();
    render(<PeriodoSelector periodo="2026-07" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));

    expect(onChange).toHaveBeenLastCalledWith('2026-06');
  });

  it('calls onChange with the next month when "Mes siguiente" is activated and not at the current month', () => {
    const onChange = vi.fn();
    render(<PeriodoSelector periodo="2026-06" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(onChange).toHaveBeenLastCalledWith('2026-07');
  });

  it('disables "Mes siguiente" when viewing the current month', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />);

    expect(
      screen.getByRole('button', { name: 'Mes siguiente' }),
    ).toBeDisabled();
  });

  it('calls onChange with the current month when "Ir al mes actual" is activated', () => {
    const onChange = vi.fn();
    render(<PeriodoSelector periodo="2026-03" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ir al mes actual' }));

    expect(onChange).toHaveBeenLastCalledWith('2026-07');
  });

  it('disables "Ir al mes actual" when already viewing the current month', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />);

    expect(
      screen.getByRole('button', { name: 'Ir al mes actual' }),
    ).toBeDisabled();
  });

  it('gives prev, next, and Hoy distinct Spanish aria-labels', () => {
    render(<PeriodoSelector periodo="2026-06" onChange={() => {}} />);

    expect(
      screen.getByRole('button', { name: 'Mes anterior' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mes siguiente' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ir al mes actual' }),
    ).toBeInTheDocument();
  });

  // month-year-picker (WMYP-01, 03, 06): the label becomes a popover trigger
  // that opens a month grid to jump directly to any (year, month).
  it('clicking the period label opens the popover and shows the month grid', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /cambiar mes y año/i }));

    expect(
      screen.getByRole('button', { name: /marzo 2026/i }),
    ).toBeInTheDocument();
  });

  it('selecting an enabled month fires onChange with the composed YYYY-MM and closes the popover', () => {
    const onChange = vi.fn();
    render(<PeriodoSelector periodo="2026-07" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /cambiar mes y año/i }));
    fireEvent.click(screen.getByRole('button', { name: /marzo 2026/i }));

    expect(onChange).toHaveBeenCalledWith('2026-03');
    expect(
      screen.queryByRole('button', { name: /marzo 2026/i }),
    ).not.toBeInTheDocument();
  });

  it('Escape closes the popover and returns focus to the trigger', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />);

    const trigger = screen.getByRole('button', { name: /cambiar mes y año/i });
    fireEvent.click(trigger);
    expect(
      screen.getByRole('button', { name: /marzo 2026/i }),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: /marzo 2026/i }), {
      key: 'Escape',
    });
    // Radix restores focus to the trigger via a rAF-scheduled callback on
    // unmount; fake timers mock rAF too, so it must be flushed explicitly.
    vi.advanceTimersByTime(100);

    expect(
      screen.queryByRole('button', { name: /marzo 2026/i }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('prev/next arrows and Hoy still work exactly as before, unaffected by the popover', () => {
    const onChange = vi.fn();
    render(<PeriodoSelector periodo="2026-06" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-05');

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-07');

    fireEvent.click(screen.getByRole('button', { name: 'Ir al mes actual' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-07');
  });

  // keyboard-month-navigation (power-user efficiency round, critique
  // round-7 P2): ArrowLeft/ArrowRight navigate months when focus is
  // anywhere inside the selector group (container keydown handler), not
  // just via the chevron buttons' own click handlers.
  describe('keyboard navigation', () => {
    it('ArrowLeft anywhere in the group navigates to the previous month', () => {
      const onChange = vi.fn();
      render(<PeriodoSelector periodo="2026-06" onChange={onChange} />);

      fireEvent.keyDown(screen.getByRole('button', { name: 'Mes anterior' }), {
        key: 'ArrowLeft',
      });

      expect(onChange).toHaveBeenCalledWith('2026-05');
    });

    it('ArrowRight anywhere in the group navigates to the next month when not at the bound', () => {
      const onChange = vi.fn();
      render(<PeriodoSelector periodo="2026-06" onChange={onChange} />);

      fireEvent.keyDown(
        screen.getByRole('button', { name: /cambiar mes y año/i }),
        { key: 'ArrowRight' },
      );

      expect(onChange).toHaveBeenCalledWith('2026-07');
    });

    it('ArrowRight respects the current-month bound, same as the chevron button', () => {
      const onChange = vi.fn();
      render(<PeriodoSelector periodo="2026-07" onChange={onChange} />);

      fireEvent.keyDown(screen.getByRole('button', { name: 'Mes anterior' }), {
        key: 'ArrowRight',
      });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('arrow keys fired inside the open popover do not double-trigger month navigation', () => {
      const onChange = vi.fn();
      render(<PeriodoSelector periodo="2026-07" onChange={onChange} />);

      fireEvent.click(
        screen.getByRole('button', { name: /cambiar mes y año/i }),
      );
      const celdaMarzo = screen.getByRole('button', { name: /marzo 2026/i });

      fireEvent.keyDown(celdaMarzo, { key: 'ArrowLeft' });
      fireEvent.keyDown(celdaMarzo, { key: 'ArrowRight' });

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
