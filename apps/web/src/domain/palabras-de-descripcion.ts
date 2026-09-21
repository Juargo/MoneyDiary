/**
 * palabras-de-descripcion.ts (issue #745, patrón desde movimiento) — pure
 * tokenization of a transaction description into its words, keeping each
 * word's ORIGINAL char offsets. This is the building block that lets the
 * word-picking UI turn a contiguous word range back into a literal
 * substring of the description (`patronDesdeRango`) instead of
 * reassembling text from the split tokens — reassembly would risk
 * normalizing whitespace/separators away from what the description
 * actually contains, which would break the "saved pattern is a real
 * substring, so it CONTAINS-matches by construction" guarantee (ADR-024:
 * the client never re-implements `coincide()`'s matching logic, it only
 * ever hands the backend a substring that trivially satisfies it).
 *
 * `\S+` (non-whitespace runs) rather than splitting on a single space:
 * descriptions can carry multiple consecutive spaces (bank exports
 * routinely do), and a naive `split(' ')` would produce empty tokens whose
 * offsets no longer line up with `matchAll`'s real match positions.
 */
export interface PalabraDescripcion {
  readonly texto: string;
  /** Char offset in the original description, inclusive. */
  readonly inicio: number;
  /** Char offset in the original description, exclusive. */
  readonly fin: number;
}

export function palabrasDeDescripcion(
  descripcion: string,
): readonly PalabraDescripcion[] {
  return Array.from(descripcion.matchAll(/\S+/g), (m) => ({
    texto: m[0],
    inicio: m.index,
    fin: m.index + m[0].length,
  }));
}

/**
 * patronDesdeRango — the literal substring of `descripcion` spanning words
 * `[indiceInicio, indiceFin]` (inclusive, contiguous). Slicing the ORIGINAL
 * string by char offset — never `palabras.slice(...).map(p =>
 * p.texto).join(' ')` — is what preserves the exact original separators
 * (a double space, a hyphen with no surrounding space, etc.) verbatim.
 */
export function patronDesdeRango(
  descripcion: string,
  palabras: readonly PalabraDescripcion[],
  indiceInicio: number,
  indiceFin: number,
): string {
  return descripcion.slice(
    palabras[indiceInicio].inicio,
    palabras[indiceFin].fin,
  );
}
