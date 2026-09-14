import { describe, expect, it } from 'vitest';
import { agruparPreviewPorCategoria } from './agrupar-preview-por-categoria';
import {
  unaFilaIngreso,
  unaFilaPreview,
  unCatalogo,
} from '@/test-utils/preview-fixtures';
import type { CatalogoEstado } from '@/api/types';

/**
 * agruparPreviewPorCategoria (cartola-decision-agrupada) — pure, presentation-
 * only grouping for the read-only accordion the decision step shows. Rules
 * mirrored from the change's proposal:
 *
 * 1. Classified, non-duplicate, categoría resolvable → group by
 *    `(bucket, categoriaId)`.
 * 2. Ingreso rows (`sugerido.categoriaId === null`, the immutable backend
 *    verdict) → their own group, keyed by bucket alone — no "· Sin
 *    categoría" suffix (these rows need no categoría at all, see
 *    `FilaRevision`'s own copy).
 * 3. `sugerido === null` → single "Sin clasificar" group. A `categoriaId ===
 *    null` on a bucket OTHER than Ingreso (unreachable through today's
 *    classifier) falls into this SAME group rather than a speculative shape
 *    of its own (YAGNI) — the least-surprising existing group for it.
 * 4. `categoriaId` present but not resolvable in the catalog (loading,
 *    error, or stale/deleted categoría) → its own group keyed by
 *    `(bucket, categoriaId)`, headline "Categoría no disponible" — kept
 *    separate from a real "Sin categoría" group so a temporarily-unavailable
 *    catalog never silently merges into it.
 * 5. Duplicates → single "Duplicadas (no se importan)" group, always last.
 * 6. Order: `BUCKETS_ASIGNABLES` order, then Ingreso, then Sin clasificar,
 *    then Duplicadas. Within a bucket: named categorías sorted
 *    `localeCompare('es')`, then "categoría no disponible" subgroups by id.
 *    Rows keep file order within every group.
 */
describe('agruparPreviewPorCategoria', () => {
  const catalogo = unCatalogo();

  it('agrupa una fila clasificada por (bucket, categoriaId), con el nombre resuelto del catálogo', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        tipo: 'categoria',
        clave: 'categoria::Necesidades::cat-nec-1',
        bucket: 'Necesidades',
        categoriaId: 'cat-nec-1',
        categoriaNombre: 'Supermercado',
        filas: [fila],
      },
    ]);
  });

  it('fusiona varias filas de la misma (bucket, categoriaId) en un único grupo, preservando el orden del archivo', () => {
    const fila1 = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const fila2 = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila1, fila2], catalogo);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.filas).toEqual([fila1, fila2]);
  });

  it('una fila Ingreso (categoriaId null, sugerido.bucket Ingreso) forma su propio grupo sin sufijo "Sin categoría"', () => {
    const fila = unaFilaIngreso();

    const grupos = agruparPreviewPorCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        tipo: 'ingreso',
        clave: 'ingreso',
        bucket: 'Ingreso',
        filas: [fila],
      },
    ]);
  });

  it('un categoriaId null para un bucket que NO es Ingreso cae en "Sin clasificar" (hoy inalcanzable, YAGNI: sin forma especulativa propia)', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: null },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        tipo: 'sin-clasificar',
        clave: 'sin-clasificar',
        filas: [fila],
      },
    ]);
  });

  it('una fila sin sugerido va al grupo "Sin clasificar"', () => {
    const fila = unaFilaPreview({ sugerido: null });

    const grupos = agruparPreviewPorCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        tipo: 'sin-clasificar',
        clave: 'sin-clasificar',
        filas: [fila],
      },
    ]);
  });

  it('una fila duplicada va al grupo "Duplicadas", sin importar su sugerido', () => {
    const fila = unaFilaPreview({
      esDuplicado: true,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        tipo: 'duplicadas',
        clave: 'duplicadas',
        filas: [fila],
      },
    ]);
  });

  it('un categoriaId no encontrado en el catálogo (listo) cae en "Categoría no disponible", no en "Sin categoría"', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-borrada' },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        tipo: 'categoria-no-disponible',
        clave: 'categoria-no-disponible::Necesidades::cat-borrada',
        bucket: 'Necesidades',
        categoriaId: 'cat-borrada',
        filas: [fila],
      },
    ]);
  });

  it('con el catálogo aún cargando, toda fila con categoriaId cae en "Categoría no disponible"', () => {
    const cargando: CatalogoEstado = { tag: 'cargando' };
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila], cargando);

    expect(grupos).toEqual([
      {
        tipo: 'categoria-no-disponible',
        clave: 'categoria-no-disponible::Necesidades::cat-nec-1',
        bucket: 'Necesidades',
        categoriaId: 'cat-nec-1',
        filas: [fila],
      },
    ]);
  });

  it('con el catálogo en error, toda fila con categoriaId cae en "Categoría no disponible"', () => {
    const error: CatalogoEstado = { tag: 'error' };
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila], error);

    expect(grupos).toEqual([
      {
        tipo: 'categoria-no-disponible',
        clave: 'categoria-no-disponible::Deseos::cat-des-1',
        bucket: 'Deseos',
        categoriaId: 'cat-des-1',
        filas: [fila],
      },
    ]);
  });

  it('ordena por bucket canónico (Necesidades, Deseos, Ahorro), luego Ingreso, luego Sin clasificar, luego Duplicadas', () => {
    const filaAhorro = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Ahorro', categoriaId: 'cat-ahorro-1' },
    });
    const filaDeseos = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
    });
    const filaNecesidades = unaFilaPreview({
      rowIndex: 2,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaIngreso = unaFilaIngreso({ rowIndex: 3 });
    const filaSinClasificar = unaFilaPreview({ rowIndex: 4, sugerido: null });
    const filaDuplicada = unaFilaPreview({ rowIndex: 5, esDuplicado: true });

    const catalogoConAhorro = unCatalogo({
      grupos: [
        ...(catalogo as Extract<CatalogoEstado, { tag: 'listo' }>).grupos,
        {
          bucket: 'Ahorro',
          categorias: [
            {
              id: 'cat-ahorro-1',
              nombre: 'Fondo de emergencia',
              bucket: 'Ahorro',
              patrones: [],
              transaccionesCount: 0,
            },
          ],
        },
      ],
    });

    const grupos = agruparPreviewPorCategoria(
      [
        filaAhorro,
        filaDeseos,
        filaNecesidades,
        filaIngreso,
        filaSinClasificar,
        filaDuplicada,
      ],
      catalogoConAhorro,
    );

    expect(grupos.map((g) => g.clave)).toEqual([
      'categoria::Necesidades::cat-nec-1',
      'categoria::Deseos::cat-des-1',
      'categoria::Ahorro::cat-ahorro-1',
      'ingreso',
      'sin-clasificar',
      'duplicadas',
    ]);
  });

  it('dentro de un bucket, ordena las categorías por nombre (localeCompare es), categorías no disponibles al final', () => {
    const catalogoDosCategorias = unCatalogo({
      grupos: [
        {
          bucket: 'Necesidades',
          categorias: [
            {
              id: 'cat-z',
              nombre: 'Zapatería',
              bucket: 'Necesidades',
              patrones: [],
              transaccionesCount: 0,
            },
            {
              id: 'cat-a',
              nombre: 'Arriendo',
              bucket: 'Necesidades',
              patrones: [],
              transaccionesCount: 0,
            },
          ],
        },
      ],
    });
    const filaZ = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-z' },
    });
    const filaA = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-a' },
    });
    const filaNoDisponible = unaFilaPreview({
      rowIndex: 2,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-borrada' },
    });

    const grupos = agruparPreviewPorCategoria(
      [filaZ, filaA, filaNoDisponible],
      catalogoDosCategorias,
    );

    expect(grupos.map((g) => g.clave)).toEqual([
      'categoria::Necesidades::cat-a',
      'categoria::Necesidades::cat-z',
      'categoria-no-disponible::Necesidades::cat-borrada',
    ]);
  });

  it('sin filas, no produce ningún grupo', () => {
    expect(agruparPreviewPorCategoria([], catalogo)).toEqual([]);
  });
});
