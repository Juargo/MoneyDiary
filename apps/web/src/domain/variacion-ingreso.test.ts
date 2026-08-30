import { describe, expect, it } from 'vitest';
import { calcularVariacionIngreso, type MesIngreso } from './variacion-ingreso';

// Redesign 2026-08-30 (income card mock): "+12% vs mes anterior" trend pill.
// Pure BigInt percent delta over the annual `meses` payload (raw decimal
// strings, spec W1-01: NEVER parseFloat on money) — rounded half-away-from-
// zero to an integer. Degrades to null (no pill) whenever the comparison is
// not honestly computable: no previous month in the window, previous month
// empty or zero, current month empty, malformed amount.
describe('calcularVariacionIngreso', () => {
  const mes = (
    periodo: string,
    totalIngreso: string,
    sinIngreso = false,
  ): MesIngreso => ({ periodo, totalIngreso, sinIngreso });

  it('labels a rise with an explicit plus sign [mock: +12% vs mes anterior]', () => {
    const meses = [mes('2026-06', '1000000'), mes('2026-07', '1120000')];
    expect(calcularVariacionIngreso('2026-07', meses)).toEqual({
      etiqueta: '+12% vs mes anterior',
      direccion: 'sube',
    });
  });

  it('labels a drop with the minus sign BigInt already carries', () => {
    const meses = [mes('2026-06', '1000000'), mes('2026-07', '920000')];
    expect(calcularVariacionIngreso('2026-07', meses)).toEqual({
      etiqueta: '-8% vs mes anterior',
      direccion: 'baja',
    });
  });

  it('labels an exact tie as sin cambio', () => {
    const meses = [mes('2026-06', '750000'), mes('2026-07', '750000')];
    expect(calcularVariacionIngreso('2026-07', meses)).toEqual({
      etiqueta: 'Sin cambio vs mes anterior',
      direccion: 'igual',
    });
  });

  it('rounds half away from zero in both directions', () => {
    // +12.5% -> +13%, -12.5% -> -13%
    expect(
      calcularVariacionIngreso('2026-07', [
        mes('2026-06', '1000'),
        mes('2026-07', '1125'),
      ]),
    ).toEqual({ etiqueta: '+13% vs mes anterior', direccion: 'sube' });
    expect(
      calcularVariacionIngreso('2026-07', [
        mes('2026-06', '1000'),
        mes('2026-07', '875'),
      ]),
    ).toEqual({ etiqueta: '-13% vs mes anterior', direccion: 'baja' });
  });

  it('rounds a sub-half remainder toward zero', () => {
    // +12.4% -> +12%
    const meses = [mes('2026-06', '1000'), mes('2026-07', '1124')];
    expect(calcularVariacionIngreso('2026-07', meses)).toEqual({
      etiqueta: '+12% vs mes anterior',
      direccion: 'sube',
    });
  });

  it('is BigInt-exact beyond Number.MAX_SAFE_INTEGER', () => {
    const meses = [
      mes('2026-06', '9007199254740993'),
      mes('2026-07', '18014398509481986'),
    ];
    expect(calcularVariacionIngreso('2026-07', meses)).toEqual({
      etiqueta: '+100% vs mes anterior',
      direccion: 'sube',
    });
  });

  it('returns null when the current month opens the window (no previous month)', () => {
    const meses = [mes('2026-01', '500000'), mes('2026-02', '600000')];
    expect(calcularVariacionIngreso('2026-01', meses)).toBeNull();
  });

  it('returns null when the current periodo is not in the data', () => {
    const meses = [mes('2026-06', '500000'), mes('2026-07', '600000')];
    expect(calcularVariacionIngreso('2026-09', meses)).toBeNull();
  });

  it('returns null when the previous month is sinIngreso', () => {
    const meses = [mes('2026-06', '0', true), mes('2026-07', '600000')];
    expect(calcularVariacionIngreso('2026-07', meses)).toBeNull();
  });

  it('returns null when the previous total is zero (division has no honest base)', () => {
    const meses = [mes('2026-06', '0'), mes('2026-07', '600000')];
    expect(calcularVariacionIngreso('2026-07', meses)).toBeNull();
  });

  it('returns null when the current month is sinIngreso', () => {
    const meses = [mes('2026-06', '600000'), mes('2026-07', '0', true)];
    expect(calcularVariacionIngreso('2026-07', meses)).toBeNull();
  });

  it('returns null on a malformed amount instead of guessing', () => {
    const meses = [mes('2026-06', 'no-un-numero'), mes('2026-07', '600000')];
    expect(calcularVariacionIngreso('2026-07', meses)).toBeNull();
  });

  it('returns null on an empty window', () => {
    expect(calcularVariacionIngreso('2026-07', [])).toBeNull();
  });
});
