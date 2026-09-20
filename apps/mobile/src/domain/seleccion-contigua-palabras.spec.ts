/**
 * seleccion-contigua-palabras.spec.ts (issue #745, patrón desde movimiento
 * mobile) — ported verbatim from
 * `apps/web/src/domain/seleccion-contigua-palabras.test.ts`, same cases.
 * Tested as a plain reducer, no React/RN needed — see
 * `seleccion-contigua-palabras.ts`'s own docblock for the contiguity
 * invariant this pins.
 */
import { alternarPalabra } from './seleccion-contigua-palabras';
import type { RangoPalabras } from './seleccion-contigua-palabras';

describe('alternarPalabra', () => {
  it('starting from no selection, clicking a word selects just that word', () => {
    expect(alternarPalabra(null, 2)).toEqual({ inicio: 2, fin: 2 });
  });

  it('clicking the only selected word again clears the selection', () => {
    const rango: RangoPalabras = { inicio: 2, fin: 2 };
    expect(alternarPalabra(rango, 2)).toBeNull();
  });

  it('clicking the word immediately before the range extends it leftward', () => {
    const rango: RangoPalabras = { inicio: 2, fin: 3 };
    expect(alternarPalabra(rango, 1)).toEqual({ inicio: 1, fin: 3 });
  });

  it('clicking the word immediately after the range extends it rightward', () => {
    const rango: RangoPalabras = { inicio: 2, fin: 3 };
    expect(alternarPalabra(rango, 4)).toEqual({ inicio: 2, fin: 4 });
  });

  it('clicking the leftmost word of a multi-word range shrinks it from the left', () => {
    const rango: RangoPalabras = { inicio: 2, fin: 4 };
    expect(alternarPalabra(rango, 2)).toEqual({ inicio: 3, fin: 4 });
  });

  it('clicking the rightmost word of a multi-word range shrinks it from the right', () => {
    const rango: RangoPalabras = { inicio: 2, fin: 4 };
    expect(alternarPalabra(rango, 4)).toEqual({ inicio: 2, fin: 3 });
  });

  it('clicking a word strictly inside the range (not an edge) resets to a fresh single-word selection at that word — never removes just the middle and leaves a hole', () => {
    const rango: RangoPalabras = { inicio: 0, fin: 4 };
    const resultado = alternarPalabra(rango, 2);
    expect(resultado).toEqual({ inicio: 2, fin: 2 });
    expect(resultado!.inicio).toBeLessThanOrEqual(resultado!.fin);
  });

  it('clicking a word far away (not adjacent, not inside) resets to a fresh single-word selection there — never produces a gap', () => {
    const rango: RangoPalabras = { inicio: 0, fin: 1 };
    expect(alternarPalabra(rango, 5)).toEqual({ inicio: 5, fin: 5 });
  });

  it('every reachable result satisfies inicio <= fin (contiguity invariant), across a scripted sequence of clicks', () => {
    const secuenciaIndices = [3, 4, 5, 3, 4, 0, 1, 2, 7, 6, 6];
    let rango: RangoPalabras | null = null;
    for (const indice of secuenciaIndices) {
      rango = alternarPalabra(rango, indice);
      if (rango !== null) {
        expect(rango.inicio).toBeLessThanOrEqual(rango.fin);
      }
    }
  });
});
