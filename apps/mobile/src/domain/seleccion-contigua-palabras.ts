/**
 * seleccion-contigua-palabras.ts (issue #745, patrón desde movimiento
 * mobile) — ported verbatim from
 * `apps/web/src/domain/seleccion-contigua-palabras.ts`.
 *
 * Pure reducer behind the word-picking interaction that lets a user build a
 * classification pattern by tapping the words of a transaction's
 * description. Owner-approved design hard rule: the selection must ALWAYS
 * be a contiguous span of the description, enforced in the INTERACTION
 * itself rather than validated afterwards.
 *
 * `RangoPalabras` can only ever represent a contiguous inclusive range
 * (`inicio <= fin`) — there is no way to construct a "gap" (e.g. words 0
 * and 2 without word 1) with this type, so contiguity is a structural
 * guarantee, not a runtime check. Every branch below either grows/shrinks
 * the range by exactly one edge or resets it to a fresh single-word range;
 * none of them can produce a hole.
 *
 * Interaction (tap word at `indice`):
 *   - no selection yet              → select just that word.
 *   - the only selected word again  → clear the selection.
 *   - the range's left edge         → shrink from the left.
 *   - the range's right edge        → shrink from the right.
 *   - immediately before the range  → extend left by one word.
 *   - immediately after the range   → extend right by one word.
 *   - a word strictly inside the range (not an edge) → reset to a fresh
 *     single-word selection AT that word. Removing just an interior word
 *     would require representing a gap, which `RangoPalabras` cannot
 *     express — resetting there is the one outcome that stays contiguous
 *     and still gives the tap an unsurprising, visible effect.
 *   - any other word (not adjacent, not inside) → reset to a fresh
 *     single-word selection there, same reasoning as above.
 *
 * Pure: no React Native, no fetch, no env.
 */
export interface RangoPalabras {
  readonly inicio: number;
  readonly fin: number;
}

export function alternarPalabra(
  rango: RangoPalabras | null,
  indice: number,
): RangoPalabras | null {
  if (rango === null) {
    return { inicio: indice, fin: indice };
  }

  const { inicio, fin } = rango;

  if (indice >= inicio && indice <= fin) {
    if (inicio === fin) {
      return null;
    }
    if (indice === inicio) {
      return { inicio: inicio + 1, fin };
    }
    if (indice === fin) {
      return { inicio, fin: fin - 1 };
    }
    return { inicio: indice, fin: indice };
  }

  if (indice === inicio - 1) {
    return { inicio: indice, fin };
  }
  if (indice === fin + 1) {
    return { inicio, fin: indice };
  }

  return { inicio: indice, fin: indice };
}
