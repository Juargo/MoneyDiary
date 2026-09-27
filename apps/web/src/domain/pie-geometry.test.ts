import { describe, expect, it } from 'vitest';
import { calcularAngulos, arcoPath } from './pie-geometry';

// DOM port of apps/mobile/src/domain/pie-geometry.spec.ts — the arc math is
// platform-agnostic (no react-native-svg import in the source module either),
// so the port is verbatim.
describe('calcularAngulos', () => {
  it('acumula fracciones en tramos [inicio, fin] en grados, arrancando en 0', () => {
    expect(calcularAngulos([0.5, 0.25, 0.25])).toEqual([
      { inicio: 0, fin: 180 },
      { inicio: 180, fin: 270 },
      { inicio: 270, fin: 360 },
    ]);
  });

  it('cierra SIEMPRE en 360 aunque las fracciones no sumen exacto (truncamiento BigInt)', () => {
    const angulos = calcularAngulos([0.333333, 0.333333, 0.333333]);
    expect(angulos[angulos.length - 1].fin).toBe(360);
  });

  it('una sola fracción completa cubre el círculo entero', () => {
    expect(calcularAngulos([1])).toEqual([{ inicio: 0, fin: 360 }]);
  });
});

describe('arcoPath', () => {
  it('arranca en el centro y cierra el wedge (Z)', () => {
    const d = arcoPath(100, 100, 80, 0, 90);
    expect(d.startsWith('M 100 100')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(d).toContain('A 80 80');
  });

  it('marca large-arc-flag=1 cuando el barrido supera 180°', () => {
    const chico = arcoPath(100, 100, 80, 0, 90); // 90° → flag 0
    const grande = arcoPath(100, 100, 80, 0, 270); // 270° → flag 1
    expect(chico).toContain('A 80 80 0 0 1');
    expect(grande).toContain('A 80 80 0 1 1');
  });

  it('un barrido completo (0→360) produce un path cerrado sin NaN', () => {
    const d = arcoPath(100, 100, 80, 0, 360);
    expect(d).not.toContain('NaN');
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  // Characterisation pin (this change, Phase 3): byte-exact contract for the
  // filled full-360° sweep, pinned BEFORE the annular branches are removed in
  // Phase 4 — the restructured branch must keep emitting this exact string.
  it('un barrido completo (0→360) emite el string EXACTO de hoy para el wedge relleno', () => {
    const d = arcoPath(100, 100, 80, 0, 360);
    expect(d).toBe(
      'M 100 100 L 100 20 A 80 80 0 1 1 100 180 A 80 80 0 1 1 100 20 Z',
    );
  });

  // Filled-wedge regression contract: this exact string must never change
  // byte-for-byte, since it is the shape the live dashboard now always
  // renders.
  it('devuelve el mismo string EXACTO de hoy para el wedge relleno (contrato de regresión)', () => {
    const d = arcoPath(120, 80, 60, 45, 135);
    expect(d).toBe('M 120 80 L 162.426 37.574 A 60 60 0 0 1 162.426 122.426 Z');
  });
});
