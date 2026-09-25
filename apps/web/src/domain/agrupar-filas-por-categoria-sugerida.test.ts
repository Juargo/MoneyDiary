import { describe, expect, it } from 'vitest';
import { agruparFilasPorCategoriaSugerida } from './agrupar-filas-por-categoria-sugerida';
import {
  unaFilaIngreso,
  unaFilaPreview,
  unCatalogo,
} from '@/test-utils/preview-fixtures';

/**
 * agruparFilasPorCategoriaSugerida (preview-agrupacion-categoria T2) — pure
 * grouping for the EDITABLE review table (`PreviewMuestra`). Rules from the
 * feature document's product decisions:
 *
 * 1. Grouping key = the SERVER SUGGESTION (`fila.sugerido`), never the
 *    merged edit — a row stays in its original group until the preview is
 *    reloaded.
 * 2. `sugerido: { bucket: 'Ingreso', categoriaId: null }` → one "Ingreso"
 *    group.
 * 3. `sugerido: null` → one "Sin categoría" group, always LAST.
 * 4. A `categoriaId` not resolvable in the catalog still groups by
 *    `(bucket, categoriaId)`, with a safe label fallback.
 * 5. Group order: `BUCKETS_ASIGNABLES` order, then Ingreso, then category
 *    name `localeCompare('es')` within a bucket, "Sin categoría" last.
 * 6. Rows inside a group: `fecha` ascending, `rowIndex` tiebreak.
 * 7. Duplicate rows group by their `sugerido` like any other row — no
 *    separate "Duplicadas" shape here (unlike the read-only decision-step
 *    summary in `agrupar-preview-por-categoria.ts`, out of scope for T2).
 */
describe('agruparFilasPorCategoriaSugerida', () => {
  const catalogo = unCatalogo();

  it('agrupa una fila clasificada por (bucket, categoriaId) del sugerido, con nombre e ícono resueltos del catálogo', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida([fila], catalogo);

    expect(grupos).toEqual([
      {
        clave: 'categoria::Necesidades::cat-nec-1',
        bucket: 'Necesidades',
        categoriaId: 'cat-nec-1',
        categoriaNombre: 'Supermercado',
        icono: null,
        filas: [fila],
      },
    ]);
  });

  it('resuelve el ícono de la categoría desde el catálogo cuando la categoría lo trae', () => {
    const catalogoConIcono = unCatalogo({
      grupos: [
        {
          bucket: 'Necesidades',
          categorias: [
            {
              id: 'cat-nec-1',
              nombre: 'Supermercado',
              bucket: 'Necesidades',
              patrones: [],
              transaccionesCount: 0,
              icono: 'shopping-cart',
            },
          ],
        },
      ],
    });
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida([fila], catalogoConIcono);

    expect(grupos[0]?.icono).toBe('shopping-cart');
  });

  it('fusiona varias filas del mismo (bucket, categoriaId) en un único grupo', () => {
    const fila1 = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const fila2 = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida([fila1, fila2], catalogo);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.filas).toEqual([fila1, fila2]);
  });

  it('una fila Ingreso forma su propio grupo "Ingreso" sin categoriaId', () => {
    const fila = unaFilaIngreso();

    const grupos = agruparFilasPorCategoriaSugerida([fila], catalogo);

    expect(grupos).toEqual([
      {
        clave: 'ingreso',
        bucket: 'Ingreso',
        categoriaId: null,
        categoriaNombre: 'Ingreso',
        icono: null,
        filas: [fila],
      },
    ]);
  });

  it('una fila sin sugerido (sugerido: null) cae en el grupo "Sin categoría"', () => {
    const fila = unaFilaPreview({ sugerido: null });

    const grupos = agruparFilasPorCategoriaSugerida([fila], catalogo);

    expect(grupos).toEqual([
      {
        clave: 'sin-categoria',
        bucket: null,
        categoriaId: null,
        categoriaNombre: 'Sin categoría',
        icono: null,
        filas: [fila],
      },
    ]);
  });

  it('el grupo "Sin categoría" siempre queda al final, incluso si aparece primero en el archivo', () => {
    const filaSinCategoria = unaFilaPreview({ rowIndex: 0, sugerido: null });
    const filaClasificada = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida(
      [filaSinCategoria, filaClasificada],
      catalogo,
    );

    expect(grupos.map((g) => g.clave)).toEqual([
      'categoria::Necesidades::cat-nec-1',
      'sin-categoria',
    ]);
  });

  it('un categoriaId no resoluble en el catálogo igual agrupa por id, con un nombre de respaldo', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-borrada' },
    });

    const grupos = agruparFilasPorCategoriaSugerida([fila], catalogo);

    expect(grupos).toEqual([
      {
        clave: 'categoria::Necesidades::cat-borrada',
        bucket: 'Necesidades',
        categoriaId: 'cat-borrada',
        categoriaNombre: 'Categoría no disponible',
        icono: null,
        filas: [fila],
      },
    ]);
  });

  it('con catálogo cargando, ninguna categoría es resoluble — todas caen al nombre de respaldo, no revienta', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida([fila], {
      tag: 'cargando',
    });

    expect(grupos[0]?.categoriaNombre).toBe('Categoría no disponible');
    expect(grupos[0]?.icono).toBeNull();
  });

  it('con catálogo en error, ninguna categoría es resoluble — no revienta', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida([fila], { tag: 'error' });

    expect(grupos[0]?.categoriaNombre).toBe('Categoría no disponible');
  });

  it('orden determinístico: BUCKETS_ASIGNABLES, luego Ingreso, luego nombre es-CL dentro de un bucket, "Sin categoría" al final', () => {
    const filaAhorro = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Ahorro', categoriaId: 'cat-ahorro-1' },
    });
    const filaIngreso = unaFilaIngreso({ rowIndex: 1 });
    const filaSinCategoria = unaFilaPreview({ rowIndex: 2, sugerido: null });
    const filaDeseoZ = unaFilaPreview({
      rowIndex: 3,
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-z' },
    });
    const filaDeseoA = unaFilaPreview({
      rowIndex: 4,
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-a' },
    });
    const filaNecesidad = unaFilaPreview({
      rowIndex: 5,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const catalogoCompleto = unCatalogo({
      grupos: [
        {
          bucket: 'Necesidades',
          categorias: [
            {
              id: 'cat-nec-1',
              nombre: 'Supermercado',
              bucket: 'Necesidades',
              patrones: [],
              transaccionesCount: 0,
            },
          ],
        },
        {
          bucket: 'Deseos',
          categorias: [
            {
              id: 'cat-des-z',
              nombre: 'Zapatillas',
              bucket: 'Deseos',
              patrones: [],
              transaccionesCount: 0,
            },
            {
              id: 'cat-des-a',
              nombre: 'Antojos',
              bucket: 'Deseos',
              patrones: [],
              transaccionesCount: 0,
            },
          ],
        },
        {
          bucket: 'Ahorro',
          categorias: [
            {
              id: 'cat-ahorro-1',
              nombre: 'Fondo mutuo',
              bucket: 'Ahorro',
              patrones: [],
              transaccionesCount: 0,
            },
          ],
        },
      ],
    });

    const grupos = agruparFilasPorCategoriaSugerida(
      [
        filaAhorro,
        filaIngreso,
        filaSinCategoria,
        filaDeseoZ,
        filaDeseoA,
        filaNecesidad,
      ],
      catalogoCompleto,
    );

    expect(grupos.map((g) => g.categoriaNombre)).toEqual([
      'Supermercado', // Necesidades
      'Antojos', // Deseos, alfabético antes de Zapatillas
      'Zapatillas', // Deseos
      'Fondo mutuo', // Ahorro
      'Ingreso',
      'Sin categoría', // siempre al final
    ]);
  });

  it('S1: con el mismo categoriaNombre en el mismo bucket (dos categoriaId no resolubles), el desempate final es por clave — orden idéntico sin importar el orden del archivo', () => {
    const filaX = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-x' },
    });
    const filaY = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-y' },
    });

    const gruposXY = agruparFilasPorCategoriaSugerida([filaX, filaY], catalogo);
    const gruposYX = agruparFilasPorCategoriaSugerida([filaY, filaX], catalogo);

    // Precondition: both ids must be absent from the fixture so the groups tie
    // on the fallback name — otherwise this passes through name ordering and
    // no longer exercises the clave tiebreak.
    expect(gruposXY.map((g) => g.categoriaNombre)).toEqual([
      'Categoría no disponible',
      'Categoría no disponible',
    ]);
    expect(gruposXY.map((g) => g.clave)).toEqual(gruposYX.map((g) => g.clave));
    expect(gruposXY.map((g) => g.clave)).toEqual([
      'categoria::Necesidades::cat-x',
      'categoria::Necesidades::cat-y',
    ]);
  });

  it('S1: el desempate por clave es ordinal — dos claves que la colación trata como iguales (guion blando ignorable) igual quedan en orden fijo', () => {
    // 'cat-x'.localeCompare('cat-­x', 'es') === 0 under ICU: the soft
    // hyphen is an ignorable code point, so a locale tiebreak would fall back
    // to file order again.
    const filaSimple = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-x' },
    });
    const filaConGuionBlando = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-­x' },
    });

    const gruposAB = agruparFilasPorCategoriaSugerida(
      [filaSimple, filaConGuionBlando],
      catalogo,
    );
    const gruposBA = agruparFilasPorCategoriaSugerida(
      [filaConGuionBlando, filaSimple],
      catalogo,
    );

    expect(gruposAB.map((g) => g.clave)).toEqual(gruposBA.map((g) => g.clave));
  });

  it('S2: un categoriaId que contiene "::" igual resuelve su nombre del catálogo (ya no se trunca al hacer clave.split)', () => {
    const catalogoConIdRaro = unCatalogo({
      grupos: [
        {
          bucket: 'Necesidades',
          categorias: [
            {
              id: 'cat::raro',
              nombre: 'Rareza',
              bucket: 'Necesidades',
              patrones: [],
              transaccionesCount: 0,
            },
          ],
        },
      ],
    });
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat::raro' },
    });

    const grupos = agruparFilasPorCategoriaSugerida([fila], catalogoConIdRaro);

    expect(grupos[0]?.categoriaNombre).toBe('Rareza');
    expect(grupos[0]?.categoriaId).toBe('cat::raro');
  });

  it('dentro de un grupo, las filas quedan ordenadas por fecha ascendente', () => {
    const filaTardia = unaFilaPreview({
      rowIndex: 0,
      fecha: '2026-07-20T00:00:00.000Z',
      descripcion: 'tardía',
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaTemprana = unaFilaPreview({
      rowIndex: 1,
      fecha: '2026-07-01T00:00:00.000Z',
      descripcion: 'temprana',
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida(
      [filaTardia, filaTemprana],
      catalogo,
    );

    expect(grupos[0]?.filas.map((f) => f.descripcion)).toEqual([
      'temprana',
      'tardía',
    ]);
  });

  it('con la misma fecha, el desempate es por rowIndex — orden estable', () => {
    const filaB = unaFilaPreview({
      rowIndex: 1,
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'B',
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaA = unaFilaPreview({
      rowIndex: 0,
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'A',
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    // Pasadas en el orden "equivocado" (B antes que A) — el resultado debe
    // igual quedar A, B, por rowIndex.
    const grupos = agruparFilasPorCategoriaSugerida([filaB, filaA], catalogo);

    expect(grupos[0]?.filas.map((f) => f.descripcion)).toEqual(['A', 'B']);
  });

  it('una fila duplicada (esDuplicado) agrupa por su sugerido, como cualquier otra fila', () => {
    const filaDuplicada = unaFilaPreview({
      rowIndex: 0,
      esDuplicado: true,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaNormal = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorCategoriaSugerida(
      [filaDuplicada, filaNormal],
      catalogo,
    );

    // Un único grupo — la fila duplicada NO forma un grupo "Duplicadas" aparte.
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.filas).toEqual([filaDuplicada, filaNormal]);
  });
});
