import { describe, expect, it } from 'vitest';
import { calcularBarrasIngreso } from './sparkline-ingreso';
import type { MesIngreso } from './variacion-ingreso';

// Redesign 2026-08-30 (income card mock): the right-side bar sparkline —
// last up to 7 months ending at the current periodo, each a height fraction
// of the window max. The ratio itself is presentation GEOMETRY (same
// precedent as the pie slices), but the totals are compared/scaled in BigInt
// so giant amounts never lose precision before the final ratio.
describe('calcularBarrasIngreso', () => {
  const mes = (
    periodo: string,
    totalIngreso: string,
    sinIngreso = false,
  ): MesIngreso => ({ periodo, totalIngreso, sinIngreso });

  const anio = (totales: ReadonlyArray<string>): MesIngreso[] =>
    totales.map((total, i) =>
      mes(`2026-${String(i + 1).padStart(2, '0')}`, total, total === '0'),
    );

  it('windows the last 7 months ending at the current periodo, flagging only the current bar', () => {
    const meses = anio([
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      '0',
      '0',
      '0',
    ]);
    const barras = calcularBarrasIngreso('2026-09', meses);
    expect(barras).toHaveLength(7);
    expect(barras.map((b) => b.periodo)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(barras.map((b) => b.esActual)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('gives the window max a full-height fraction of 1', () => {
    const barras = calcularBarrasIngreso(
      '2026-09',
      anio([
        '100',
        '200',
        '300',
        '400',
        '500',
        '600',
        '700',
        '800',
        '900',
        '0',
        '0',
        '0',
      ]),
    );
    expect(barras.at(-1)?.fraccion).toBe(1);
    // 300/900 = 0.333...
    expect(barras[0]?.fraccion).toBeCloseTo(0.333, 2);
  });

  it('shrinks the window at the start of the year instead of padding it', () => {
    const meses = anio([
      '100',
      '200',
      '300',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
    const barras = calcularBarrasIngreso('2026-03', meses);
    expect(barras.map((b) => b.periodo)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('returns no bars when the window would hold a single month (nothing to compare)', () => {
    const meses = anio([
      '100',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(calcularBarrasIngreso('2026-01', meses)).toEqual([]);
  });

  it('renders empty months as a minimal stub, never a hole', () => {
    const meses = anio([
      '100',
      '0',
      '300',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
    const barras = calcularBarrasIngreso('2026-03', meses);
    expect(barras[1]?.fraccion).toBeGreaterThanOrEqual(0.08);
  });

  it('returns no bars when every month in the window is empty', () => {
    const meses = anio([
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(calcularBarrasIngreso('2026-07', meses)).toEqual([]);
  });

  it('returns no bars when the current periodo is not in the data', () => {
    expect(
      calcularBarrasIngreso('2027-01', anio(Array(12).fill('100'))),
    ).toEqual([]);
  });

  it('keeps proportions BigInt-exact for beyond-safe-integer amounts', () => {
    const meses = [
      mes('2026-06', '9007199254740993'),
      mes('2026-07', '18014398509481986'),
    ];
    const barras = calcularBarrasIngreso('2026-07', meses);
    expect(barras[0]?.fraccion).toBeCloseTo(0.5, 3);
    expect(barras[1]?.fraccion).toBe(1);
  });
});
