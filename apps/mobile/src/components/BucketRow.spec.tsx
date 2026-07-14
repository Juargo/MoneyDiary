import { render, screen } from '@testing-library/react-native';
import { BucketRow } from './BucketRow';

// RED-first (T3.7, sprint3-mvp-mobile, MOB-03/MOB-06): renders the CLP total
// (already formatted upstream by the view-model) and the percentage-or-null
// label as-is — a `null` porcentajeBp resolves to SIN_PORCENTAJE_LABEL
// ('—') in the view-model, never "0%" here; this row is a dumb renderer.
describe('BucketRow', () => {
  it('renders the bucket label, formatted total, and percentage label', async () => {
    await render(
      <BucketRow
        bucket="Necesidades"
        total="$500.000"
        porcentajeLabel="50%"
        estadoSemaforo="verde"
      />,
    );
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('$500.000')).toBeOnTheScreen();
    expect(screen.getByText('50%')).toBeOnTheScreen();
  });

  it('renders the sentinel label as-is when porcentaje is null (never "0%")', async () => {
    await render(
      <BucketRow
        bucket="Deseos"
        total="$0"
        porcentajeLabel="—"
        estadoSemaforo={null}
      />,
    );
    expect(screen.getByText('—')).toBeOnTheScreen();
    expect(screen.queryByText('0%')).not.toBeOnTheScreen();
  });

  it('renders a true 0% distinctly from the null sentinel', async () => {
    await render(
      <BucketRow
        bucket="Ahorro"
        total="$0"
        porcentajeLabel="0%"
        estadoSemaforo="rojo"
      />,
    );
    expect(screen.getByText('0%')).toBeOnTheScreen();
  });
});
