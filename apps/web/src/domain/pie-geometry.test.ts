import { describe, expect, it } from 'vitest';
import { calcularAngulos, arcoPath, radioEtiqueta } from './pie-geometry';

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

  // US-047 D-01: `rInterior` is a trailing OPTIONAL parameter — omitting it
  // must not change a single byte of what `arcoPath` returns today. This is
  // the regression contract that lets the donut ring land without touching
  // any of the 6 cases above.
  it('omitiendo rInterior devuelve el mismo string EXACTO de hoy (contrato de regresión, D-01)', () => {
    const d = arcoPath(120, 80, 60, 45, 135);
    expect(d).toBe('M 120 80 L 162.426 37.574 A 60 60 0 0 1 162.426 122.426 Z');
  });

  // rInterior === undefined must behave identically to omitting it entirely —
  // both degrade to the same byte-identical filled-wedge path.
  it('rInterior === undefined se comporta igual que omitirlo (D-01)', () => {
    const conOmision = arcoPath(120, 80, 60, 45, 135);
    const conUndefined = arcoPath(120, 80, 60, 45, 135, undefined);
    expect(conUndefined).toBe(conOmision);
  });

  it('con rInterior > 0 arranca en el borde exterior (no en M cx cy) y referencia ambos radios — el anillo tiene agujero (D-01)', () => {
    const d = arcoPath(120, 80, 60, 45, 135, 30);
    expect(d.startsWith('M 120 80')).toBe(false);
    expect(d).toContain('A 60 60'); // outer radius
    expect(d).toContain('A 30 30'); // inner radius (the hole)
  });

  it('un barrido completo (0→360) con rInterior > 0 emite dos subpaths con sweep-flag opuesto y sin NaN — un mes 100% en un solo bucket es un ANILLO, no un disco (D-01)', () => {
    const d = arcoPath(100, 100, 80, 0, 360, 40);
    expect(d).not.toContain('NaN');
    // Two independent closed subpaths — one per concentric circle.
    expect((d.match(/M /g) ?? []).length).toBe(2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
    // Outer circle keeps the pre-existing forward sweep (flag 1); the inner
    // circle is drawn with the OPPOSITE sweep flag (0) so the default
    // non-zero fill rule punches the hole.
    expect(d).toContain('A 80 80 0 1 1');
    expect(d).toContain('A 40 40 0 1 0');
  });

  it('rInterior >= r degrada al wedge relleno (rInterior = 0) en vez de invertirse/auto-cruzarse (D-01 guard)', () => {
    const relleno = arcoPath(120, 80, 60, 45, 135);
    expect(arcoPath(120, 80, 60, 45, 135, 60)).toBe(relleno); // rInterior === r
    expect(arcoPath(120, 80, 60, 45, 135, 90)).toBe(relleno); // rInterior > r
  });
});

describe('radioEtiqueta', () => {
  it('devuelve el radio de la banda media (r + rInterior) / 2 (D-01)', () => {
    expect(radioEtiqueta(80, 40)).toBe(60);
    expect(radioEtiqueta(100, 0)).toBe(50);
  });
});
