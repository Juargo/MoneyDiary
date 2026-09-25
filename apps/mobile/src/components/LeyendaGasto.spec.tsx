import {
  render,
  screen,
  within,
  fireEvent,
} from '@testing-library/react-native';
import { LeyendaGasto } from './LeyendaGasto';
import type { ItemLeyenda } from '../domain/resumen-view-model';

// US-050 PR4b (design §1.7/§1.4a, MOB-08): rewritten from a 3-item
// percent-only legend to a row list dispatched on `ItemLeyenda.kind` (never
// a boolean flag). US-056 PR1 (D-10/D-11/T-01/T-02): rows become Pressable
// navigation targets — binding decision 2 reversed. Issue #778 tramo5b PR2:
// `complemento` is now just `[ingreso]` — the `'sinCategoria'` kind is
// retired from `ItemLeyenda` entirely (mirrors apps/web's own PR1).
const noop = () => undefined;

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
];

describe('LeyendaGasto', () => {
  it('renders three 50/30/20 rows then Ingresos (issue #778 tramo5b PR2 retired the Sin categoría row)', async () => {
    await render(
      <LeyendaGasto
        principales={principales}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.getAllByTestId(/^leyenda-fila-/)).toHaveLength(4);
  });

  it('renders the UI labels, never the raw domain names', async () => {
    await render(
      <LeyendaGasto
        principales={principales}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('Gustos')).toBeOnTheScreen();
    expect(screen.getByText('Ahorro')).toBeOnTheScreen();
    expect(screen.getByText('Ingresos')).toBeOnTheScreen();
    expect(screen.queryByText('Deseos')).not.toBeOnTheScreen();
    expect(screen.queryByText('SinCategoria')).not.toBeOnTheScreen();
  });

  it('shows the ring % on spend rows only', async () => {
    await render(
      <LeyendaGasto
        principales={principales}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.getByText('50%')).toBeOnTheScreen();
    expect(screen.getByText('30%')).toBeOnTheScreen();
    expect(screen.getByText('20%')).toBeOnTheScreen();
  });

  it('signs amounts by kind: + for ingreso, − for gasto', async () => {
    await render(
      <LeyendaGasto
        principales={principales}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(screen.getByText('+$1.000.000')).toBeOnTheScreen();
    expect(screen.getByText('-$500.000')).toBeOnTheScreen();
  });

  // NOTE: "renders zero buttons and zero chevrons (binding decision 2)" test
  // is REMOVED — superseded by US-056 MOB-08 delta (rows are now Pressable).
  // US-050 binding decision 2 reversed.

  // Issue #778 tramo5b PR2: the Sin categoría row (SinCategoria bucket,
  // "N tx" + drill-down to `/bucket/SinCategoria?destacar=sin-categoria`) is
  // RETIRED. `ItemLeyenda` no longer even has a `'sinCategoria'` kind (a
  // compile-time guarantee, not just a runtime one), so `complemento` can
  // only ever be `[ingreso]` — this asserts nothing resembling that old row
  // renders, and its expanded accessible name never appears either.
  it('never renders a Sin categoría row or its expanded accessible name (issue #778 tramo5b PR2)', async () => {
    await render(
      <LeyendaGasto
        principales={principales}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    expect(
      screen.queryByText('Sin grupo ni categoría', { exact: false }),
    ).not.toBeOnTheScreen();
    expect(screen.queryByText(/ tx$/)).not.toBeOnTheScreen();
    expect(
      screen.queryByLabelText(/transacciones sin grupo ni categoría/),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByTestId('leyenda-fila-SinCategoria'),
    ).not.toBeOnTheScreen();
  });

  it('renders the 4 rows in the fixed order: Necesidades, Gustos, Ahorro, Ingresos', async () => {
    await render(
      <LeyendaGasto
        principales={principales}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    const rows = screen.getAllByTestId(/^leyenda-fila-/);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText('Necesidades')).toBeOnTheScreen();
    expect(within(rows[1]).getByText('Gustos')).toBeOnTheScreen();
    expect(within(rows[2]).getByText('Ahorro')).toBeOnTheScreen();
    expect(within(rows[3]).getByText('Ingresos')).toBeOnTheScreen();
  });

  it('renders exactly 1 row (Ingresos) when there is no spend', async () => {
    await render(
      <LeyendaGasto
        principales={[]}
        complemento={complemento}
        periodo="2026-07"
        onNavegar={noop}
      />,
    );
    const rows = screen.getAllByTestId(/^leyenda-fila-/);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Ingresos')).toBeOnTheScreen();
  });
});

// US-056 T-01 RED → T-02 GREEN — legend pressability + navigation + periodo threading

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
];

describe('LeyendaGasto — US-056 pressability + navigation (T-01 RED → T-02 GREEN)', () => {
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
    // All 4 rows must carry unique testIDs and accessibilityRole="button"
    const rows = screen.getAllByTestId(/^leyenda-fila-/);
    expect(rows).toHaveLength(4);
    rows.forEach((row) => {
      expect(row.props.accessibilityRole).toBe('button');
    });
    // Spend-bucket rows exist by unique testID
    expect(screen.getByTestId('leyenda-fila-Necesidades')).toBeTruthy();
    expect(screen.getByTestId('leyenda-fila-Deseos')).toBeTruthy();
    expect(screen.getByTestId('leyenda-fila-Ahorro')).toBeTruthy();
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

  // Issue #778 tramo5b PR2: there is no more SinCategoria row to press — the
  // legend never mounts a `leyenda-fila-SinCategoria` testID at all.
  it('never mounts a leyenda-fila-SinCategoria row (issue #778 tramo5b PR2)', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo="2026-07"
        onNavegar={onNavegar}
      />,
    );
    expect(
      screen.queryByTestId('leyenda-fila-SinCategoria'),
    ).not.toBeOnTheScreen();
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

  it('testIDs resolve uniquely: leyenda-fila-Necesidades, -Deseos, -Ahorro, -ingreso', async () => {
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
  });

  // Fix 1 (MOB-08): pressing the Deseos row must use the wire key 'Deseos',
  // NOT the display label «Gustos» — the path is /bucket/Deseos, never /bucket/Gustos.
  it('pressing Deseos row calls onNavegar with /bucket/Deseos?periodo=2026-06 (wire key, not display label)', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo="2026-06"
        onNavegar={onNavegar}
      />,
    );
    fireEvent.press(screen.getByTestId('leyenda-fila-Deseos'));
    expect(onNavegar).toHaveBeenCalledWith('/bucket/Deseos?periodo=2026-06');
  });

  // Fix 2: when periodo is undefined, paths must omit the ?periodo= suffix entirely
  // — never produce ?periodo=undefined.
  it('omits ?periodo= entirely when periodo is undefined', async () => {
    await render(
      <LeyendaGasto
        principales={principalesNav}
        complemento={complementoNav}
        periodo={undefined}
        onNavegar={onNavegar}
      />,
    );
    fireEvent.press(screen.getByTestId('leyenda-fila-Necesidades'));
    expect(onNavegar).toHaveBeenLastCalledWith('/bucket/Necesidades');

    onNavegar.mockClear();

    fireEvent.press(screen.getByTestId('leyenda-fila-ingreso'));
    expect(onNavegar).toHaveBeenLastCalledWith('/ingresos');
  });
});
