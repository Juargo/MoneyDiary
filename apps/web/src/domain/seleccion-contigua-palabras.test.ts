import { describe, expect, it } from 'vitest';
import { alternarPalabra } from './seleccion-contigua-palabras';
import type { RangoPalabras } from './seleccion-contigua-palabras';

/**
 * seleccion-contigua-palabras.test.ts (issue #745, patrón desde movimiento)
 * — pure reducer behind the word-picking interaction. The hard rule (owner-
 * approved design) is that the selected words must ALWAYS form a contiguous
 * span: this is enforced by construction in `alternarPalabra` itself (every
 * branch either grows/shrinks the range by exactly one edge, or resets to a
 * fresh single-word range), not by validating an arbitrary set afterwards.
 *
 * Tested as a plain reducer (`rango` in → `rango` out) — no React needed to
 * prove the interaction never produces a non-contiguous result.
 */
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
    // Falsifiable by construction: a "remove just this index" implementation
    // would have to represent {0,1,3,4} — not a valid RangoPalabras at all,
    // so the type itself makes that outcome unrepresentable.
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
