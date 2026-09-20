/**
 * palabras-de-descripcion.spec.ts (issue #745, patrón desde movimiento
 * mobile) — ported verbatim from
 * `apps/web/src/domain/palabras-de-descripcion.test.ts`, same cases, same
 * assertions. See `palabras-de-descripcion.ts`'s own docblock for why this
 * tokenizer/substring pair guarantees a CONTAINS match by construction
 * (ADR-024).
 */
import {
  palabrasDeDescripcion,
  patronDesdeRango,
} from './palabras-de-descripcion';

describe('palabrasDeDescripcion', () => {
  it('splits a simple space-separated description into words with correct offsets', () => {
    const palabras = palabrasDeDescripcion('NETFLIX.COM SANTIAGO CL');
    expect(palabras.map((p) => p.texto)).toEqual([
      'NETFLIX.COM',
      'SANTIAGO',
      'CL',
    ]);
    expect(palabras[0]).toEqual({ texto: 'NETFLIX.COM', inicio: 0, fin: 11 });
    expect(palabras[1]).toEqual({ texto: 'SANTIAGO', inicio: 12, fin: 20 });
    expect(palabras[2]).toEqual({ texto: 'CL', inicio: 21, fin: 23 });
  });

  it('collapses runs of whitespace instead of producing empty tokens', () => {
    const palabras = palabrasDeDescripcion('UBER   EATS');
    expect(palabras.map((p) => p.texto)).toEqual(['UBER', 'EATS']);
    expect(palabras[1].inicio).toBe(7);
  });

  it('returns an empty array for a blank description', () => {
    expect(palabrasDeDescripcion('   ')).toEqual([]);
  });

  it('a single-word description yields exactly one token spanning it', () => {
    const palabras = palabrasDeDescripcion('COPEC');
    expect(palabras).toEqual([{ texto: 'COPEC', inicio: 0, fin: 5 }]);
  });
});

describe('patronDesdeRango', () => {
  it('builds the literal substring for a single selected word', () => {
    const descripcion = 'NETFLIX.COM SANTIAGO CL';
    const palabras = palabrasDeDescripcion(descripcion);
    expect(patronDesdeRango(descripcion, palabras, 0, 0)).toBe('NETFLIX.COM');
  });

  it('builds the literal substring for a contiguous multi-word range, preserving the original separators', () => {
    const descripcion = 'UBER   EATS SANTIAGO';
    const palabras = palabrasDeDescripcion(descripcion);
    expect(patronDesdeRango(descripcion, palabras, 0, 1)).toBe('UBER   EATS');
  });

  it('builds the literal substring spanning the whole description when every word is selected', () => {
    const descripcion = 'COMPRA SUPERMERCADO LIDER';
    const palabras = palabrasDeDescripcion(descripcion);
    expect(patronDesdeRango(descripcion, palabras, 0, 2)).toBe(descripcion);
  });
});
