import {
  render,
  screen,
  within,
  fireEvent,
} from '@testing-library/react-native';
import { LeyendaGasto } from './LeyendaGasto';
import type { ItemLeyenda } from '../domain/resumen-view-model';

// US-050 PR4b (design §1.7/§1.4a, MOB-08): rewritten from a 3-item
// percent-only legend to a 5-row list dispatched on `ItemLeyenda.kind`
// (never a boolean flag). US-056 PR1 (D-10/D-11/T-01): rows become
// Pressable navigation targets — binding decision 2 reversed.
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

  // NOTE: this test is superseded by US-056 MOB-08 delta (rows are now Pressable).
  // It is REMOVED here; the US-056 T-01 RED cases below replace the inertness contract.
  // (Kept as a comment to trace the supersession — US-050 binding decision 2 reversed.)

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

  it('renders the 5 rows in the fixed MOB-08 order: Necesidades, Gustos, Ahorro, Ingresos, Sin categoría', async () => {
    await render(
      <LeyendaGasto principales={principales} complemento={complemento} />,
    );
    const rows = screen.getAllByTestId('leyenda-fila');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText('Necesidades')).toBeOnTheScreen();
    expect(within(rows[1]).getByText('Gustos')).toBeOnTheScreen();
    expect(within(rows[2]).getByText('Ahorro')).toBeOnTheScreen();
    expect(within(rows[3]).getByText('Ingresos')).toBeOnTheScreen();
    expect(
      within(rows[4]).getByText('Sin categoría', { exact: false }),
    ).toBeOnTheScreen();
  });

  it('renders exactly 2 rows (Ingresos, Sin categoría) when there is no spend', async () => {
    await render(
      <LeyendaGasto
        principales={[]}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={() => undefined}
      />,
    );
    const rows = screen.getAllByTestId(/^leyenda-fila-/);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Ingresos')).toBeOnTheScreen();
    expect(
      within(rows[1]).getByText('Sin categoría', { exact: false }),
    ).toBeOnTheScreen();
  });
});

// US-056 T-01 RED — legend pressability + navigation + periodo threading
// All cases below MUST FAIL before GREEN implementation.
// RED evidence: rows are inert Views with shared testID="leyenda-fila";
// onNavegar prop does not exist; periodo prop does not exist.

const onNavegar = jest.fn();

const principalesNav: readonly ItemLeyenda[] = [
  {
    kind: 'gasto',
    bucket: 'Necesidades',
    porcentaje: 50,
    montoLabel: '-$500.000',
  },
  { kind: 'gasto', bucket: 'Deseos', porcentaje: 30, montoLabel: '-$300.000' },
  { kind: 'gasto', bucket: 'Ahorro', porcentaje: 20, montoLabel: '-$200.000' },
];

const complementoNav: readonly ItemLeyenda[] = [
  { kind: 'ingreso', montoLabel: '+$1.000.000' },
  {
    kind: 'sinCategoria',
    bucket: 'SinCategoria',
    montoLabel: '-$0',
    cantidadLabel: '3 tx',
  },
];

describe('LeyendaGasto — US-056 pressability + navigation (T-01 RED)', () => {
  beforeEach(() => {
    onNavegar.mockClear();
  });

  it('each spend-bucket row is a Pressable with accessibilityRole button', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo="2026-07"
        onNavegar={onNavegar}
      />,
    );
    expect(
      screen.getByTestId('leyenda-fila-Necesidades'),
    ).toHaveAccessibilityState({});
    expect(screen.getByTestId('leyenda-fila-Deseos')).toBeTruthy();
    expect(screen.getByTestId('leyenda-fila-Ahorro')).toBeTruthy();
    // All 5 rows must have accessibilityRole="button"
    const rows = screen.getAllByTestId(/^leyenda-fila-/);
    expect(rows).toHaveLength(5);
    rows.forEach((row) => {
      expect(row.props.accessibilityRole).toBe('button');
    });
  });

  it('pressing Necesidades row calls onNavegar with /bucket/Necesidades?periodo=2026-07', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo="2026-07"
        onNavegar={onNavegar}
      />,
    );
    fireEvent.press(screen.getByTestId('leyenda-fila-Necesidades'));
    expect(onNavegar).toHaveBeenCalledWith(
      '/bucket/Necesidades?periodo=2026-07',
    );
  });

  it('pressing SinCategoria row calls onNavegar with /bucket/SinCategoria?destacar=sin-categoria&periodo=2026-07', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo="2026-07"
        onNavegar={onNavegar}
      />,
    );
    fireEvent.press(screen.getByTestId('leyenda-fila-SinCategoria'));
    expect(onNavegar).toHaveBeenCalledWith(
      '/bucket/SinCategoria?destacar=sin-categoria&periodo=2026-07',
    );
  });

  it('pressing Ingresos row calls onNavegar with /ingresos?periodo=2026-07', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo="2026-07"
        onNavegar={onNavegar}
      />,
    );
    fireEvent.press(screen.getByTestId('leyenda-fila-ingreso'));
    expect(onNavegar).toHaveBeenCalledWith('/ingresos?periodo=2026-07');
  });

  it('testIDs resolve uniquely: leyenda-fila-Necesidades, -Deseos, -Ahorro, -ingreso, -SinCategoria', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo="2026-07"
        onNavegar={onNavegar}
      />,
    );
    expect(screen.getByTestId('leyenda-fila-Necesidades')).toBeTruthy();
    expect(screen.getByTestId('leyenda-fila-Deseos')).toBeTruthy();
    expect(screen.getByTestId('leyenda-fila-Ahorro')).toBeTruthy();
    expect(screen.getByTestId('leyenda-fila-ingreso')).toBeTruthy();
    expect(screen.getByTestId('leyenda-fila-SinCategoria')).toBeTruthy();
  });
});
