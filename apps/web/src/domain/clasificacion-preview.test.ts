import { describe, expect, it } from 'vitest';
import {
  esFilaIngreso,
  esFilaSeleccionable,
  estaClasificada,
} from './clasificacion-preview';
import { unaFilaPreview } from '@/test-utils/preview-fixtures';

const sinEdits = new Map<number, string | null>();

describe('esFilaIngreso', () => {
  it('is true when the server classified the row as Ingreso', () => {
    const fila = unaFilaPreview({
      cargo: '0',
      abono: '900000',
      sugerido: { bucket: 'Ingreso', categoriaId: null },
    });
    expect(esFilaIngreso(fila)).toBe(true);
  });

  it('is false for a gasto bucket, for SinCategoria (sugerido null) and for an unknown bucket', () => {
    expect(
      esFilaIngreso(
        unaFilaPreview({
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-1' },
        }),
      ),
    ).toBe(false);
    expect(esFilaIngreso(unaFilaPreview({ sugerido: null }))).toBe(false);
    expect(
      esFilaIngreso(
        unaFilaPreview({ sugerido: { bucket: 'Otros', categoriaId: null } }),
      ),
    ).toBe(false);
  });

  // ADR-024: the rule lives in the backend; this module reads its verdict.
  it('never re-derives the rule from the amounts (abono>0 alone is not enough)', () => {
    const fila = unaFilaPreview({
      cargo: '0',
      abono: '900000',
      sugerido: null,
    });
    expect(esFilaIngreso(fila)).toBe(false);
  });
});

describe('estaClasificada', () => {
  it('counts an income row as classified even though its categoría is null', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Ingreso', categoriaId: null },
    });
    expect(estaClasificada(fila, sinEdits)).toBe(true);
  });

  it('stays classified for income even if a stale edit cleared its categoría', () => {
    const fila = unaFilaPreview({
      rowIndex: 3,
      sugerido: { bucket: 'Ingreso', categoriaId: null },
    });
    expect(estaClasificada(fila, new Map([[3, null]]))).toBe(true);
  });

  it('falls back to the D-05 merge rule for every non-income row', () => {
    const conSugerido = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-1' },
    });
    expect(estaClasificada(conSugerido, sinEdits)).toBe(true);
    // edits win: an explicit null un-assigns it
    expect(estaClasificada(conSugerido, new Map([[1, null]]))).toBe(false);
    expect(estaClasificada(unaFilaPreview({ sugerido: null }), sinEdits)).toBe(
      false,
    );
  });
});

describe('esFilaSeleccionable', () => {
  it('excludes duplicates and income rows, includes ordinary gasto rows', () => {
    expect(esFilaSeleccionable(unaFilaPreview({}))).toBe(true);
    expect(esFilaSeleccionable(unaFilaPreview({ esDuplicado: true }))).toBe(
      false,
    );
    expect(
      esFilaSeleccionable(
        unaFilaPreview({ sugerido: { bucket: 'Ingreso', categoriaId: null } }),
      ),
    ).toBe(false);
  });
});
