/**
 * CeldaFecha.spec.tsx — bucket-detalle-lista-rediseño mobile port (Cambio 3/4).
 *
 * Proves the RN accessibility claim the task asked NOT to assume: an
 * explicit `accessibilityLabel` on the parent `<Text>` wins over its
 * children's own text content for the computed accessible name — it is not
 * concatenated with "03 LUN". Verified against
 * `@testing-library/react-native`'s own `computeAriaLabel` (checked in
 * `node_modules/@testing-library/react-native/dist/helpers/accessibility.js`):
 * it returns `instance.props.accessibilityLabel` for an element that has one,
 * WITHOUT ever descending into that element's children — so `getByLabelText`
 * only matches the outer wrapper, never the inner day/weekday `<Text>`s.
 */

import { render, screen } from '@testing-library/react-native';
import { CeldaFecha } from './CeldaFecha';

describe('CeldaFecha', () => {
  it('renders the visible day and uppercased weekday', async () => {
    await render(
      <CeldaFecha
        dia="03"
        diaSemana="lun"
        fechaLargaLabel="3 de agosto de 2026"
      />,
    );
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('LUN')).toBeTruthy();
  });

  it('exposes fechaLargaLabel as the accessibilityLabel of the wrapping Text', async () => {
    await render(
      <CeldaFecha
        dia="03"
        diaSemana="lun"
        fechaLargaLabel="3 de agosto de 2026"
      />,
    );
    const wrapper = screen.getByLabelText('3 de agosto de 2026');
    expect(wrapper).toBeTruthy();
    expect(wrapper.props.accessibilityLabel).toBe('3 de agosto de 2026');
  });

  it(
    'the explicit accessibilityLabel wins over the children text — ' +
      'getByLabelText matches only the wrapper, never the inner day/weekday ' +
      'Text nodes (they carry no accessibilityLabel of their own)',
    async () => {
      await render(
        <CeldaFecha
          dia="03"
          diaSemana="lun"
          fechaLargaLabel="3 de agosto de 2026"
        />,
      );
      // Only one element in the whole tree exposes this accessible name.
      const matches = screen.getAllByLabelText('3 de agosto de 2026');
      expect(matches).toHaveLength(1);
      // Querying by the RAW visible fragments as a label (not as plain text)
      // finds nothing — proving the inner Texts never surface their own
      // content as an accessibilityLabel; only getByText (visual content)
      // finds them, exercised in the test above.
      expect(screen.queryByLabelText('03')).toBeNull();
      expect(screen.queryByLabelText('LUN')).toBeNull();
      expect(screen.queryByLabelText('03 LUN')).toBeNull();
    },
  );
});
