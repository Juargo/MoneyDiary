import type { PreviewFilaDto } from '@/api/types';

/**
 * resolverCategoriaMerged — the D-05 merge rule ("edits win over
 * `sugerido.categoriaId`") extracted from `PreviewMuestra`'s inline
 * `filasConMerged` map (round-10 critique CRITICAL follow-up): a shared
 * single source of truth so any caller that needs to know "is this row
 * classified right now" — `PreviewMuestra`'s own progress/filter/render
 * logic AND `SubirCartola`'s discard-confirm honest count — reads the exact
 * same rule instead of two copies that could silently drift apart (the
 * drift is exactly how the discard-confirm count went dishonest the first
 * time: it used the raw `filas.length` instead of this rule).
 *
 * `edits` presence (not its value) means "the user touched this row" — an
 * explicit `null` un-assigns a row that had a `sugerido` categoría; a
 * missing entry falls back to `sugerido?.categoriaId`. Presentation-only
 * (ADR-024): never a recomputation of amounts, dedup, or classification
 * rules, just reading which value currently wins for a given row.
 */
export function resolverCategoriaMerged(
  fila: Pick<PreviewFilaDto, 'rowIndex' | 'sugerido'>,
  edits: ReadonlyMap<number, string | null>,
): string | null {
  return edits.has(fila.rowIndex)
    ? (edits.get(fila.rowIndex) ?? null)
    : (fila.sugerido?.categoriaId ?? null);
}
