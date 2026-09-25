import { describe, expect, it } from 'vitest';
import { agruparFilasPorBucketYCategoria } from './agrupar-filas-por-categoria-sugerida';
import {
  unaFilaIngreso,
  unaFilaPreview,
  unCatalogo,
} from '@/test-utils/preview-fixtures';

/**
 * agruparFilasPorBucketYCategoria (preview-acordeon-bucket T1) — pure
 * two-level grouping for the EDITABLE review table (`PreviewMuestra`).
 * Rules from the feature document's product decisions:
 *
 * 1. Grouping key = the SERVER SUGGESTION (`fila.sugerido`), never the
 *    merged edit — a row stays in its original group until the preview is
 *    reloaded.
 * 2. Level 1 (bucket): present buckets among Necesidades, Deseos, Ahorro (in
 *    that order), then Ingreso last; an empty bucket is absent entirely.
 * 3. Level 2 (categoría): only for the three asignable buckets, one entry
 *    per categoriaId, sorted by name (`localeCompare('es')`) with `clave` as
 *    the ordinal tiebreak. Ingreso never gets a level 2 — its rows sit on
 *    `filasDirectas`.
 * 4. A `categoriaId` not resolvable in the catalog still groups by
 *    `(bucket, categoriaId)`, with a safe label fallback.
 * 5. No "Sin categoría" group: `sugerido: null` rows are DROPPED (dead per
 *    #778); a non-Ingreso row with a null `categoriaId` (unreachable today)
 *    folds into an unresolvable categoría of its own bucket instead.
 * 6. Rows inside a categoría/`filasDirectas`: `fecha` ascending, `rowIndex`
 *    tiebreak.
 * 7. Duplicate rows group by their `sugerido` like any other row.
 */
describe('agruparFilasPorBucketYCategoria', () => {
  const catalogo = unCatalogo();

  it('agrupa una fila clasificada bajo su bucket, con una categoría con nombre e ícono resueltos del catálogo', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorBucketYCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        bucket: 'Necesidades',
        categorias: [
          {
            clave: 'categoria::Necesidades::cat-nec-1',
            categoriaId: 'cat-nec-1',
            categoriaNombre: 'Supermercado',
            icono: null,
            filas: [fila],
          },
        ],
        filasDirectas: [],
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

    const grupos = agruparFilasPorBucketYCategoria([fila], catalogoConIcono);

    expect(grupos[0]?.categorias[0]?.icono).toBe('shopping-cart');
  });

  it('fusiona varias filas del mismo (bucket, categoriaId) en una única categoría', () => {
    const fila1 = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const fila2 = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorBucketYCategoria([fila1, fila2], catalogo);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.categorias).toHaveLength(1);
    expect(grupos[0]?.categorias[0]?.filas).toEqual([fila1, fila2]);
  });

  it('dos filas del mismo bucket pero distinta categoría quedan bajo el MISMO grupo de bucket, con dos categorías', () => {
    const filaSupermercado = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaOtraCategoria = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-2' },
    });
    const catalogoDosCategorias = unCatalogo({
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
            {
              id: 'cat-nec-2',
              nombre: 'Farmacia',
              bucket: 'Necesidades',
              patrones: [],
              transaccionesCount: 0,
            },
          ],
        },
      ],
    });

    const grupos = agruparFilasPorBucketYCategoria(
      [filaSupermercado, filaOtraCategoria],
      catalogoDosCategorias,
    );

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.bucket).toBe('Necesidades');
    expect(grupos[0]?.categorias.map((c) => c.categoriaNombre)).toEqual([
      'Farmacia',
      'Supermercado',
    ]);
  });

  it('una fila Ingreso forma su propio grupo de bucket, sin categorías, con sus filas directas', () => {
    const fila = unaFilaIngreso();

    const grupos = agruparFilasPorBucketYCategoria([fila], catalogo);

    expect(grupos).toEqual([
      {
        bucket: 'Ingreso',
        categorias: [],
        filasDirectas: [fila],
      },
    ]);
  });

  it('una fila sin sugerido (sugerido: null) se DESCARTA por completo — no aparece en ningún grupo', () => {
    const filaSinSugerido = unaFilaPreview({ rowIndex: 0, sugerido: null });
    const filaClasificada = unaFilaPreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorBucketYCategoria(
      [filaSinSugerido, filaClasificada],
      catalogo,
    );

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.bucket).toBe('Necesidades');
    expect(grupos[0]?.categorias[0]?.filas).toEqual([filaClasificada]);
    // No "sin-categoria" clave anywhere, no matter how it is spelled.
    const todasLasClaves = grupos.flatMap((g) =>
      g.categorias.map((c) => c.clave),
    );
    expect(todasLasClaves.some((c) => /sin.categoria$/i.test(c))).toBe(false);
  });

  it('si TODAS las filas no tienen sugerido, el resultado es una lista vacía de grupos', () => {
    const filas = [
      unaFilaPreview({ rowIndex: 0, sugerido: null }),
      unaFilaPreview({ rowIndex: 1, sugerido: null }),
    ];

    const grupos = agruparFilasPorBucketYCategoria(filas, catalogo);

    expect(grupos).toEqual([]);
  });

  it('una fila con sugerido presente pero categoriaId null en un bucket asignable (caso hoy inalcanzable por contrato) igual aparece bajo su bucket, como categoría no resoluble', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: null },
    });

    const grupos = agruparFilasPorBucketYCategoria([fila], catalogo);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.bucket).toBe('Necesidades');
    expect(grupos[0]?.categorias).toEqual([
      {
        clave: 'categoria::Necesidades::__sin-categoria-id__',
        categoriaId: null,
        categoriaNombre: 'Categoría no disponible',
        icono: null,
        filas: [fila],
      },
    ]);
  });

  it('un categoriaId no resoluble en el catálogo igual agrupa por id, con un nombre de respaldo', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-borrada' },
    });

    const grupos = agruparFilasPorBucketYCategoria([fila], catalogo);

    expect(grupos[0]?.categorias).toEqual([
      {
        clave: 'categoria::Necesidades::cat-borrada',
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

    const grupos = agruparFilasPorBucketYCategoria([fila], { tag: 'cargando' });

    expect(grupos[0]?.categorias[0]?.categoriaNombre).toBe(
      'Categoría no disponible',
    );
    expect(grupos[0]?.categorias[0]?.icono).toBeNull();
  });

  it('con catálogo en error, ninguna categoría es resoluble — no revienta', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorBucketYCategoria([fila], { tag: 'error' });

    expect(grupos[0]?.categorias[0]?.categoriaNombre).toBe(
      'Categoría no disponible',
    );
  });

  it('orden determinístico: BUCKETS_ASIGNABLES, luego Ingreso; dentro de un bucket, nombre es-CL', () => {
    const filaAhorro = unaFilaPreview({
      rowIndex: 0,
      sugerido: { bucket: 'Ahorro', categoriaId: 'cat-ahorro-1' },
    });
    const filaIngreso = unaFilaIngreso({ rowIndex: 1 });
    const filaDeseoZ = unaFilaPreview({
      rowIndex: 2,
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-z' },
    });
    const filaDeseoA = unaFilaPreview({
      rowIndex: 3,
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-a' },
    });
    const filaNecesidad = unaFilaPreview({
      rowIndex: 4,
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

    const grupos = agruparFilasPorBucketYCategoria(
      [filaAhorro, filaIngreso, filaDeseoZ, filaDeseoA, filaNecesidad],
      catalogoCompleto,
    );

    expect(grupos.map((g) => g.bucket)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
      'Ingreso',
    ]);
    expect(
      grupos
        .find((g) => g.bucket === 'Deseos')
        ?.categorias.map((c) => c.categoriaNombre),
    ).toEqual(['Antojos', 'Zapatillas']);
    expect(grupos.find((g) => g.bucket === 'Ingreso')?.filasDirectas).toEqual([
      filaIngreso,
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

    const gruposXY = agruparFilasPorBucketYCategoria([filaX, filaY], catalogo);
    const gruposYX = agruparFilasPorBucketYCategoria([filaY, filaX], catalogo);

    // Precondition: both ids must be absent from the fixture so the categorías tie
    // on the fallback name — otherwise this passes through name ordering and
    // no longer exercises the clave tiebreak.
    expect(gruposXY[0]?.categorias.map((c) => c.categoriaNombre)).toEqual([
      'Categoría no disponible',
      'Categoría no disponible',
    ]);
    expect(gruposXY[0]?.categorias.map((c) => c.clave)).toEqual(
      gruposYX[0]?.categorias.map((c) => c.clave),
    );
    expect(gruposXY[0]?.categorias.map((c) => c.clave)).toEqual([
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

    const gruposAB = agruparFilasPorBucketYCategoria(
      [filaSimple, filaConGuionBlando],
      catalogo,
    );
    const gruposBA = agruparFilasPorBucketYCategoria(
      [filaConGuionBlando, filaSimple],
      catalogo,
    );

    expect(gruposAB[0]?.categorias.map((c) => c.clave)).toEqual(
      gruposBA[0]?.categorias.map((c) => c.clave),
    );
  });

  it('un categoriaId que contiene "::" igual resuelve su nombre del catálogo', () => {
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

    const grupos = agruparFilasPorBucketYCategoria([fila], catalogoConIdRaro);

    expect(grupos[0]?.categorias[0]?.categoriaNombre).toBe('Rareza');
    expect(grupos[0]?.categorias[0]?.categoriaId).toBe('cat::raro');
  });

  it('dentro de una categoría, las filas quedan ordenadas por fecha ascendente', () => {
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

    const grupos = agruparFilasPorBucketYCategoria(
      [filaTardia, filaTemprana],
      catalogo,
    );

    expect(grupos[0]?.categorias[0]?.filas.map((f) => f.descripcion)).toEqual([
      'temprana',
      'tardía',
    ]);
  });

  it('dentro de filasDirectas de Ingreso, las filas quedan ordenadas por fecha ascendente', () => {
    const filaTardia = unaFilaIngreso({
      rowIndex: 0,
      fecha: '2026-07-20T00:00:00.000Z',
      descripcion: 'tardía',
    });
    const filaTemprana = unaFilaIngreso({
      rowIndex: 1,
      fecha: '2026-07-01T00:00:00.000Z',
      descripcion: 'temprana',
    });

    const grupos = agruparFilasPorBucketYCategoria(
      [filaTardia, filaTemprana],
      catalogo,
    );

    expect(grupos[0]?.filasDirectas.map((f) => f.descripcion)).toEqual([
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
    const grupos = agruparFilasPorBucketYCategoria([filaB, filaA], catalogo);

    expect(grupos[0]?.categorias[0]?.filas.map((f) => f.descripcion)).toEqual([
      'A',
      'B',
    ]);
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

    const grupos = agruparFilasPorBucketYCategoria(
      [filaDuplicada, filaNormal],
      catalogo,
    );

    // Una única categoría — la fila duplicada NO forma un grupo "Duplicadas" aparte.
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.categorias).toHaveLength(1);
    expect(grupos[0]?.categorias[0]?.filas).toEqual([
      filaDuplicada,
      filaNormal,
    ]);
  });

  it('un bucket sin ninguna fila está simplemente ausente del resultado', () => {
    const fila = unaFilaPreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparFilasPorBucketYCategoria([fila], catalogo);

    expect(grupos.map((g) => g.bucket)).toEqual(['Necesidades']);
    expect(grupos.some((g) => g.bucket === 'Deseos')).toBe(false);
    expect(grupos.some((g) => g.bucket === 'Ahorro')).toBe(false);
    expect(grupos.some((g) => g.bucket === 'Ingreso')).toBe(false);
  });
});
