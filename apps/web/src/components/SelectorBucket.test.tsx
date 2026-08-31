import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectorBucket } from './SelectorBucket';

// SelectorBucket (2026-08-30) — segmented control of native radio inputs
// replacing the per-row bucket `<select>` (FilaRevision). Presentational
// only: no state, no catalog knowledge beyond the `buckets` prop it's given.

describe('SelectorBucket', () => {
  it('renders a group with the full accessible name via aria-label', () => {
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value=""
        onChange={vi.fn()}
        buckets={['Necesidades', 'Deseos', 'Ahorro']}
      />,
    );

    const group = screen.getByLabelText(/Fila 3: bucket/i);
    expect(group).toBeInTheDocument();
    expect(group).toHaveAccessibleName('Fila 3: bucket');
  });

  it('renders one "Sin categoría" option plus one option per bucket, using UI labels (Deseos -> Gustos)', () => {
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value=""
        onChange={vi.fn()}
        buckets={['Necesidades', 'Deseos', 'Ahorro']}
      />,
    );

    const group = screen.getByLabelText(/Fila 3: bucket/i);
    const radios = within(group).getAllByRole('radio');
    expect(
      radios.map(
        (r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Sin categoría',
        'Necesidades',
        'Gustos',
        'Ahorro',
      ]),
    );
    expect(radios).toHaveLength(4);
  });

  it('option VALUE stays the domain key ("Deseos"), never the UI label ("Gustos")', () => {
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value=""
        onChange={vi.fn()}
        buckets={['Deseos']}
      />,
    );

    const group = screen.getByLabelText(/Fila 3: bucket/i);
    const gustosRadio = within(group).getByRole('radio', {
      name: 'Gustos',
    }) as HTMLInputElement;
    expect(gustosRadio.value).toBe('Deseos');
  });

  it('checks the "Sin categoría" radio when value is ""', () => {
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value=""
        onChange={vi.fn()}
        buckets={['Necesidades']}
      />,
    );

    const group = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(group).getByRole('radio', { name: 'Sin categoría' }),
    ).toBeChecked();
    expect(
      within(group).getByRole('radio', { name: 'Necesidades' }),
    ).not.toBeChecked();
  });

  it('checks the radio matching a non-empty value', () => {
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value="Necesidades"
        onChange={vi.fn()}
        buckets={['Necesidades', 'Deseos']}
      />,
    );

    const group = screen.getByLabelText(/Fila 3: bucket/i);
    expect(
      within(group).getByRole('radio', { name: 'Necesidades' }),
    ).toBeChecked();
    expect(
      within(group).getByRole('radio', { name: 'Sin categoría' }),
    ).not.toBeChecked();
  });

  it('clicking an option calls onChange with the domain key', async () => {
    const onChange = vi.fn();
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value=""
        onChange={onChange}
        buckets={['Necesidades', 'Deseos']}
      />,
    );

    const group = screen.getByLabelText(/Fila 3: bucket/i);
    await userEvent.click(within(group).getByRole('radio', { name: 'Gustos' }));

    expect(onChange).toHaveBeenCalledWith('Deseos');
  });

  it('is disabled when the disabled prop is true', () => {
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value=""
        onChange={vi.fn()}
        buckets={['Necesidades']}
        disabled
      />,
    );

    const group = screen.getByLabelText(/Fila 3: bucket/i);
    expect(group).toBeDisabled();
  });

  it('shows the visible short column label, hidden from sighted sm+ users (sm:sr-only)', () => {
    render(
      <SelectorBucket
        label="Fila 3: bucket"
        columnLabel="Bucket"
        value=""
        onChange={vi.fn()}
        buckets={['Necesidades']}
      />,
    );

    const visibleLabel = screen.getByText('Bucket');
    expect(visibleLabel.className).toMatch(/sm:sr-only/);
  });

  it('two instances on the same page do not share a radio group (independent name per instance)', async () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();

    render(
      <>
        <SelectorBucket
          label="Fila 1: bucket"
          columnLabel="Bucket"
          value=""
          onChange={onChangeA}
          buckets={['Necesidades']}
        />
        <SelectorBucket
          label="Fila 2: bucket"
          columnLabel="Bucket"
          value=""
          onChange={onChangeB}
          buckets={['Necesidades']}
        />
      </>,
    );

    const groupA = screen.getByLabelText(/Fila 1: bucket/i);
    const groupB = screen.getByLabelText(/Fila 2: bucket/i);
    const radioA = within(groupA).getByRole('radio', { name: 'Necesidades' });
    const radioB = within(groupB).getByRole('radio', { name: 'Necesidades' });

    expect(radioA.getAttribute('name')).not.toBe(radioB.getAttribute('name'));

    await userEvent.click(radioA);
    expect(onChangeA).toHaveBeenCalledWith('Necesidades');
    expect(onChangeB).not.toHaveBeenCalled();
  });

  it('renders one decorative (aria-hidden) icon per chip without changing the radio names', () => {
    const { container } = render(
      <SelectorBucket
        label="Fila 1: bucket"
        columnLabel="Bucket"
        value=""
        onChange={vi.fn()}
        buckets={['Necesidades', 'Deseos', 'Ahorro']}
      />,
    );

    const iconos = container.querySelectorAll('label svg[aria-hidden="true"]');
    expect(iconos).toHaveLength(4);
    expect(
      screen.getAllByRole('radio').map((r) => r.getAttribute('value')),
    ).toEqual(['', 'Necesidades', 'Deseos', 'Ahorro']);
    expect(screen.getByRole('radio', { name: 'Gustos' })).toBeInTheDocument();
  });
});
