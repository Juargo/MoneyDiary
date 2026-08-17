import { render, screen } from '@testing-library/react-native';
import { LeyendaGasto } from './LeyendaGasto';
import type { ItemLeyenda } from '../domain/resumen-view-model';

// US-050 PR4b (design §1.7/§1.4a, MOB-08): rewritten from a 3-item
// percent-only legend to a 5-row list dispatched on `ItemLeyenda.kind`
// (never a boolean flag). Every row is an inert `View` — non-interactive,
// no chevrons, no navigation (binding decision 2).
const principales: readonly ItemLeyenda[] = [
  {
    kind: 'gasto',
    bucket: 'Necesidades',
    porcentaje: 50,
    montoLabel: '-$500.000',
  },
  { kind: 'gasto', bucket: 'Deseos', porcentaje: 30, montoLabel: '-$300.000' },
  { kind: 'gasto', bucket: 'Ahorro', porcentaje: 20, montoLabel: '-$200.000' },
];

const complemento: readonly ItemLeyenda[] = [
  { kind: 'ingreso', montoLabel: '+$1.000.000' },
  {
    kind: 'sinCategoria',
    bucket: 'SinCategoria',
    montoLabel: '-$0',
    cantidadLabel: '3 tx',
  },
];

describe('LeyendaGasto', () => {
  it('renders exactly 5 rows', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    expect(screen.getAllByTestId('leyenda-fila')).toHaveLength(5);
  });

  it('renders the UI labels, never the raw domain names', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('Gustos')).toBeOnTheScreen();
    expect(screen.getByText('Ahorro')).toBeOnTheScreen();
    expect(screen.getByText('Ingresos')).toBeOnTheScreen();
    expect(
      screen.getByText('Sin categoría', { exact: false }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Deseos')).not.toBeOnTheScreen();
    expect(screen.queryByText('SinCategoria')).not.toBeOnTheScreen();
  });

  it('shows the ring % on spend rows only', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    expect(screen.getByText('50%')).toBeOnTheScreen();
    expect(screen.getByText('30%')).toBeOnTheScreen();
    expect(screen.getByText('20%')).toBeOnTheScreen();
  });

  it('shows "N tx" and no % on the sinCategoria row', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    expect(screen.getByText('3 tx', { exact: false })).toBeOnTheScreen();
    expect(screen.queryByText('3%')).not.toBeOnTheScreen();
  });

  it('signs amounts by kind: + for ingreso, − for the rest', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    expect(screen.getByText('+$1.000.000')).toBeOnTheScreen();
    expect(screen.getByText('-$500.000')).toBeOnTheScreen();
    expect(screen.getByText('-$0')).toBeOnTheScreen();
  });

  it('renders zero buttons and zero chevrons (binding decision 2)', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.queryByText('›')).not.toBeOnTheScreen();
  });

  it('spells out "transacciones sin categorizar" in the sinCategoria row\'s accessible name', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    expect(
      screen.getByLabelText(/transacciones sin categorizar/),
    ).toBeOnTheScreen();
  });

  it('renders a real "0 tx" row for cantidadLabel: \'0 tx\' — never omitted', async () => {
    const complementoCero: readonly ItemLeyenda[] = [
      { kind: 'ingreso', montoLabel: '+$1.000.000' },
      {
        kind: 'sinCategoria',
        bucket: 'SinCategoria',
        montoLabel: '$0',
        cantidadLabel: '0 tx',
      },
    ];
    await render(
      <LeyendaGasto principales={principales} complemento={complementoCero} />,
    );
    expect(screen.getByText('0 tx', { exact: false })).toBeOnTheScreen();
  });
});
