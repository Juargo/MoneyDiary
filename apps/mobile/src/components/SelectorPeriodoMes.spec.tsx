import { render, screen, fireEvent } from '@testing-library/react-native';
import { SelectorPeriodoMes } from './SelectorPeriodoMes';

// T-09: SelectorPeriodoMes component spec (US-056, D-13/MDET-04)
// Deterministic clocks: use jest.useFakeTimers with doNotFake list (all timers)
// so RNTL's waitFor/act keeps real timers while only Date is faked.
// Pattern from apps/mobile/app/index.spec.tsx:518-536.

// `doNotFake` must be a mutable array for jest.useFakeTimers's FakeTimersConfig type.
// All timer APIs are excluded so RNTL's waitFor/act keeps real timers — only Date is faked.
// Pattern from apps/mobile/app/index.spec.tsx:518-536.
const FAKE_TIMERS_DONOT_FAKE = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

// Spread into a mutable array so TypeScript accepts it as FakeTimersConfig['doNotFake'].
const FAKE_TIMERS_CONFIG = { doNotFake: [...FAKE_TIMERS_DONOT_FAKE] };

describe('SelectorPeriodoMes', () => {
  it('pressing ‹ calls onChange with mesAnterior result', async () => {
    const onChange = jest.fn();
    await render(<SelectorPeriodoMes periodo="2026-07" onChange={onChange} />);
    fireEvent.press(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(onChange).toHaveBeenCalledWith('2026-06');
  });

  it("pressing ‹ on 2026-01 calls onChange with '2025-12' (Jan→Dec wrap)", async () => {
    const onChange = jest.fn();
    await render(<SelectorPeriodoMes periodo="2026-01" onChange={onChange} />);
    fireEvent.press(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(onChange).toHaveBeenCalledWith('2025-12');
  });

  it("pressing › on 2026-12 calls onChange with '2027-01' (Dec→Jan wrap)", async () => {
    // Pin date to a past month (2026-07) so › is NOT disabled for period 2026-12
    jest.useFakeTimers({
      ...FAKE_TIMERS_CONFIG,
      now: new Date('2026-07-01T12:00:00.000Z'),
    });
    try {
      const onChange = jest.fn();
      await render(
        <SelectorPeriodoMes periodo="2026-12" onChange={onChange} />,
      );
      fireEvent.press(screen.getByRole('button', { name: 'Mes siguiente' }));
      expect(onChange).toHaveBeenCalledWith('2027-01');
    } finally {
      jest.useRealTimers();
    }
  });

  it("label text matches mesCompletoLabel for periodo='2026-07' (e.g. 'julio 2026')", async () => {
    await render(<SelectorPeriodoMes periodo="2026-07" onChange={jest.fn()} />);
    expect(screen.getByText('julio 2026')).toBeTruthy();
  });

  it('› Pressable has accessibilityState.disabled true at current calendar month and pressing it does NOT call onChange', async () => {
    // Pin current date to 2026-08 to match periodo
    jest.useFakeTimers({
      ...FAKE_TIMERS_CONFIG,
      now: new Date('2026-08-15T12:00:00.000Z'),
    });
    try {
      const onChange = jest.fn();
      await render(
        <SelectorPeriodoMes periodo="2026-08" onChange={onChange} />,
      );

      const nextBtn = screen.getByRole('button', { name: 'Mes siguiente' });
      expect(nextBtn.props.accessibilityState?.disabled).toBe(true);

      // Pressing the disabled Pressable should NOT fire onChange
      fireEvent.press(nextBtn);
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('periodo=undefined renders current-month label and disables › arrow', async () => {
    // Pin to agosto 2026
    jest.useFakeTimers({
      ...FAKE_TIMERS_CONFIG,
      now: new Date('2026-08-15T12:00:00.000Z'),
    });
    try {
      await render(
        <SelectorPeriodoMes periodo={undefined} onChange={jest.fn()} />,
      );

      // Label should show current month
      expect(screen.getByText('agosto 2026')).toBeTruthy();
      // › arrow should be disabled (period equals current month)
      const nextBtn = screen.getByRole('button', { name: 'Mes siguiente' });
      expect(nextBtn.props.accessibilityState?.disabled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
