import { render, screen } from '@testing-library/react-native';
import { ResumenScreen } from './ResumenScreen';
import type { ResumenViewModel } from '../domain/resumen-view-model';

// US-050 PR4b (design §1.7/D-06): re-scoped from "the whole screen" to "the
// month block" — `ScrollView`/`Header` moved up into the route shell
// (Phase 5b). Asserts the Maestro anchors — the "Distribución del gasto"
// heading and `testID="semaforo-global"` (now on `SemaforoTag` itself) —
// plus income, the 5-row legend, and the removal of "Ver detalles ›"
// (MOB-15) and the IDEAL inset (already removed in PR4a, reconfirmed here).
// US-056 PR1 (D-10/T-02): `periodo` and `onNavegar` are now required props.
const viewModel: ResumenViewModel = {
  periodo: '2026-07',
  totalIngreso: '$1.000.000',
  sinIngreso: false,
  buckets: [
    {
      bucket: 'Necesidades',
      total: '$500.000',
      porcentajeLabel: '50%',
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Deseos',
      total: '$300.000',
      porcentajeLabel: '30%',
      estadoSemaforo: 'amarillo',
    },
    {
      bucket: 'Ahorro',
      total: '$200.000',
      porcentajeLabel: '20%',
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'SinCategoria',
      total: '$0',
      porcentajeLabel: '—',
      estadoSemaforo: null,
    },
  ],
  distribucionGasto: [
    { bucket: 'Necesidades', porcentaje: 47, fraccion: 0.47 },
    { bucket: 'Deseos', porcentaje: 28, fraccion: 0.28 },
    { bucket: 'Ahorro', porcentaje: 19, fraccion: 0.19 },
    { bucket: 'SinCategoria', porcentaje: 6, fraccion: 0.06 },
  ],
  estadoGlobal: 'verde',
  leyendaPrincipal: [
    {
      kind: 'gasto',
      bucket: 'Necesidades',
      porcentaje: 47,
      montoLabel: '-$500.000',
    },
    {
      kind: 'gasto',
      bucket: 'Deseos',
      porcentaje: 28,
      montoLabel: '-$300.000',
    },
    {
      kind: 'gasto',
      bucket: 'Ahorro',
      porcentaje: 19,
      montoLabel: '-$200.000',
    },
  ],
  leyendaComplemento: [
    { kind: 'ingreso', montoLabel: '+$1.000.000' },
    {
      kind: 'sinCategoria',
      bucket: 'SinCategoria',
      montoLabel: '-$0',
      cantidadLabel: '3 tx',
    },
  ],
};

const noop = () => undefined;

describe('ResumenScreen', () => {
  it('renders the "Distribución del gasto" heading anchor', async () => {
    await render(
      <ResumenScreen
        viewModel={viewModel}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen();
  });

  it('exposes the heading as an accessible header', async () => {
    await render(
      <ResumenScreen
        viewModel={viewModel}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(
      screen.getByRole('header', { name: 'Distribución del gasto' }),
    ).toBeOnTheScreen();
  });

  it('renders totalIngreso formatted as CLP', async () => {
    await render(
      <ResumenScreen
        viewModel={viewModel}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.getByText('$1.000.000')).toBeOnTheScreen();
  });

  it('renders the 5 legend labels', async () => {
    await render(
      <ResumenScreen
        viewModel={viewModel}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('Gustos')).toBeOnTheScreen();
    expect(screen.getByText('Ahorro')).toBeOnTheScreen();
    expect(screen.getByText('Ingresos')).toBeOnTheScreen();
    expect(
      screen.getByText('Sin categoría', { exact: false }),
    ).toBeOnTheScreen();
  });

  it('renders testID="semaforo-global"', async () => {
    await render(
      <ResumenScreen
        viewModel={viewModel}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    const semaforo = screen.getByTestId('semaforo-global');
    expect(semaforo).toBeOnTheScreen();
    // Fix 4 (MOB-08 binding decision 1): SemaforoTag is a static display
    // element, never a button — asserting on the element itself survives the
    // legend rows being Pressable (US-056 delta reversed binding decision 2).
    expect(semaforo.props.accessibilityRole).not.toBe('button');
  });

  it('renders no "Ver detalles ›" affordance anywhere (MOB-15)', async () => {
    await render(
      <ResumenScreen
        viewModel={viewModel}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(
      screen.queryByText('Ver detalles ›', { exact: false }),
    ).not.toBeOnTheScreen();
  });

  it('renders no "IDEAL" element anywhere', async () => {
    await render(
      <ResumenScreen
        viewModel={viewModel}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.queryByText('IDEAL', { exact: false })).not.toBeOnTheScreen();
  });
});
