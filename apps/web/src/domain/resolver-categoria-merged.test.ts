import { describe, expect, it } from 'vitest';
import { resolverCategoriaMerged } from './resolver-categoria-merged';
import { unaFilaPreview } from '@/test-utils/preview-fixtures';

// Fresh-review CRITICAL follow-up (round-10 P1 discard-count fix): extracted
// from `PreviewMuestra`'s inline D-05 merge rule ("edits win over
// sugerido.categoriaId") so `SubirCartola`'s discard confirm can derive the
// SAME honest classified count without duplicating — and risking drift
// from — the one rule that decides whether a row counts as classified.
describe('resolverCategoriaMerged (D-05 merge rule, extracted)', () => {
  it('returns sugerido.categoriaId when the row is untouched (no edits entry)', () => {
    const fila = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    expect(resolverCategoriaMerged(fila, new Map())).toBe('cat-nec-1');
  });

  it('returns null when untouched and sugerido is null (unclassified)', () => {
    const fila = unaFilaPreview({ rowIndex: 0, sugerido: null });
    expect(resolverCategoriaMerged(fila, new Map())).toBeNull();
  });

  it('edits win over sugerido when the row was touched (D-05)', () => {
    const fila = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const edits = new Map([[0, 'cat-des-1']]);
    expect(resolverCategoriaMerged(fila, edits)).toBe('cat-des-1');
  });

  it('an explicit null edit un-assigns a row that had a sugerido categoría', () => {
    const fila = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const edits = new Map<number, string | null>([[0, null]]);
    expect(resolverCategoriaMerged(fila, edits)).toBeNull();
  });

  it('an edit can classify a row that had no sugerido at all', () => {
    const fila = unaFilaPreview({ rowIndex: 2, sugerido: null });
    const edits = new Map([[2, 'cat-nec-1']]);
    expect(resolverCategoriaMerged(fila, edits)).toBe('cat-nec-1');
  });
});
