import { render, screen, fireEvent } from '@testing-library/react-native';
import { SelectorChips } from './SelectorChips';

describe('SelectorChips (US-044 PR3a)', () => {
  const buckets = ['Necesidades', 'Deseos', 'Ahorro'] as const;

  it('renders radiogroup container and radio chips for accessibility', async () => {
    await render(
      <SelectorChips
        label="Bucket"
        options={buckets}
        value="Necesidades"
        onChange={() => {}}
        testID="selector-chips-test"
      />,
    );

    expect(screen.getByTestId('selector-chips-test')).toHaveProp(
      'accessibilityRole',
      'radiogroup',
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('marks accessibilityState.checked on the selected chip only', async () => {
    await render(
      <SelectorChips
        label="Bucket"
        options={buckets}
        value="Deseos"
        onChange={() => {}}
      />,
    );

    const radioNecesidades = screen.getByLabelText('Necesidades');
    const radioDeseos = screen.getByLabelText('Deseos');
    const radioAhorro = screen.getByLabelText('Ahorro');

    expect(radioNecesidades.props.accessibilityState).toHaveProperty(
      'checked',
      false,
    );
    expect(radioDeseos.props.accessibilityState).toHaveProperty(
      'checked',
      true,
    );
    expect(radioAhorro.props.accessibilityState).toHaveProperty(
      'checked',
      false,
    );
  });

  it('calls onChange with the option value when a chip is tapped', async () => {
    const onChange = jest.fn();
    await render(
      <SelectorChips
        label="Bucket"
        options={buckets}
        value="Necesidades"
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Ahorro'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Ahorro');
  });

  it('renders N chips for N options', async () => {
    const cuatroOpciones = ['Uno', 'Dos', 'Tres', 'Cuatro'] as const;
    await render(
      <SelectorChips
        options={cuatroOpciones}
        value="Uno"
        onChange={() => {}}
      />,
    );

    const chips = screen.getAllByRole('radio');
    expect(chips).toHaveLength(4);
  });

  it('renders the label above the group when provided', async () => {
    const { rerender } = await render(
      <SelectorChips
        options={buckets}
        value="Necesidades"
        onChange={() => {}}
      />,
    );

    expect(screen.queryByText('Bucket (obligatorio)')).toBeNull();

    await rerender(
      <SelectorChips
        label="Bucket (obligatorio)"
        options={buckets}
        value="Necesidades"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText('Bucket (obligatorio)')).toBeOnTheScreen();
  });

  it.each([
    {
      nombre: 'buckets',
      label: 'Bucket',
      options: ['Necesidades', 'Deseos', 'Ahorro'] as const,
      selected: 'Deseos',
    },
    {
      nombre: 'match types',
      label: 'Tipo de coincidencia',
      options: ['CONTAINS', 'STARTS_WITH', 'REGEX'] as const,
      selected: 'CONTAINS',
    },
  ])(
    'works parametrized for $nombre (one component serving multiple domains, D-17)',
    async ({ label, options, selected }) => {
      const onChange = jest.fn();
      await render(
        <SelectorChips
          label={label}
          options={options}
          value={selected}
          onChange={onChange}
        />,
      );

      expect(screen.getByText(label)).toBeOnTheScreen();
      const chips = screen.getAllByRole('radio');
      expect(chips).toHaveLength(3);

      const selectedRadio = screen.getByLabelText(selected);
      expect(selectedRadio.props.accessibilityState).toHaveProperty(
        'checked',
        true,
      );
    },
  );
});
