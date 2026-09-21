import { describe, expect, it } from 'vitest';
import {
  palabrasDeDescripcion,
  patronDesdeRango,
} from './palabras-de-descripcion';

/**
 * palabras-de-descripcion.test.ts (issue #745, patrón desde movimiento) —
 * pure tokenization of a transaction description into words with their
 * original char offsets, plus the literal-substring builder that turns a
 * contiguous word range back into a pattern. This is the piece that
 * guarantees a CONTAINS match by construction (ADR-024): the saved pattern
 * is always a real substring of the original description, never a
 * reassembled/joined string that could drift from it (extra/missing
 * separators, different casing shape, etc).
 */
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
    // The gap between tokens is NOT assumed to be exactly one space — offsets
    // are read straight off the real match position, not `texto.length`
    // arithmetic, so this survives multi-space runs.
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
    // Selecting words 0..1 ("UBER", "EATS") must reproduce the ORIGINAL
    // gap between them (three spaces) — never a normalized single space —
    // because the saved pattern must be a real substring of the
    // description it was extracted from.
    expect(patronDesdeRango(descripcion, palabras, 0, 1)).toBe('UBER   EATS');
  });

  it('builds the literal substring spanning the whole description when every word is selected', () => {
    const descripcion = 'COMPRA SUPERMERCADO LIDER';
    const palabras = palabrasDeDescripcion(descripcion);
    expect(patronDesdeRango(descripcion, palabras, 0, 2)).toBe(descripcion);
  });
});
