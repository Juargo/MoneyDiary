import { agruparPreviewPorCategoria } from './agrupar-preview-por-categoria';
import type { CatalogoNombresEstado } from './agrupar-preview-por-categoria';
import type { PreviewFilaDto } from '@moneydiary/api-client';

/**
 * agruparPreviewPorCategoria (cartola-decision-agrupada, MOB-PRV-03) — pure,
 * ported from `apps/web/src/domain/agrupar-preview-por-categoria.ts` with
 * one adaptation: mobile's `decidiendo` fase never has the catalog loaded
 * (`cargarCatalogo` only runs once "Revisar y editar" is tapped, design.md's
 * "+catalog fetch once" annotation in `app/subir.tsx`) — so the catalog
 * parameter here is the simpler `CatalogoNombresEstado` (`listo` with a flat
 * `nombrePorId` map, or `no-listo` covering inactivo/cargando/error alike),
 * not the full grouped-by-bucket catalog web threads through. Grouping rules
 * mirror the web module's docblock exactly (see that file's own test suite
 * for the exhaustive rule-by-rule coverage this suite intentionally
 * mirrors).
 */
function filaDePreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 0,
    fecha: '2026-07-01T00:00:00.000Z',
    descripcion: 'Compra supermercado',
    cargo: '5000',
    abono: '0',
    esDuplicado: false,
    sugerido: null,
    ...overrides,
  };
}

const catalogoListo: CatalogoNombresEstado = {
  tag: 'listo',
  nombrePorId: new Map([
    ['cat-nec-1', 'Supermercado'],
    ['cat-des-1', 'Restaurantes'],
  ]),
};
const catalogoNoListo: CatalogoNombresEstado = { tag: 'no-listo' };

describe('agruparPreviewPorCategoria', () => {
  it('agrupa una fila clasificada por (bucket, categoriaId), con el nombre resuelto del catálogo', () => {
    const fila = filaDePreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogoListo);

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
    const fila1 = filaDePreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const fila2 = filaDePreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila1, fila2], catalogoListo);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.filas).toEqual([fila1, fila2]);
  });

  it('una fila Ingreso (categoriaId null, sugerido.bucket Ingreso) forma su propio grupo sin sufijo "Sin categoría"', () => {
    const fila = filaDePreview({
      descripcion: 'ABONO SUELDO',
      cargo: '0',
      abono: '900000',
      sugerido: { bucket: 'Ingreso', categoriaId: null },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogoListo);

    expect(grupos).toEqual([
      { tipo: 'ingreso', clave: 'ingreso', bucket: 'Ingreso', filas: [fila] },
    ]);
  });

  it('un categoriaId null para un bucket que NO es Ingreso cae en "Sin clasificar" (hoy inalcanzable, YAGNI: sin forma especulativa propia)', () => {
    const fila = filaDePreview({
      sugerido: { bucket: 'Necesidades', categoriaId: null },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogoListo);

    expect(grupos).toEqual([
      { tipo: 'sin-clasificar', clave: 'sin-clasificar', filas: [fila] },
    ]);
  });

  it('una fila sin sugerido va al grupo "Sin clasificar"', () => {
    const fila = filaDePreview({ sugerido: null });

    const grupos = agruparPreviewPorCategoria([fila], catalogoListo);

    expect(grupos).toEqual([
      { tipo: 'sin-clasificar', clave: 'sin-clasificar', filas: [fila] },
    ]);
  });

  it('una fila duplicada va al grupo "Duplicadas", sin importar su sugerido', () => {
    const fila = filaDePreview({
      esDuplicado: true,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogoListo);

    expect(grupos).toEqual([
      { tipo: 'duplicadas', clave: 'duplicadas', filas: [fila] },
    ]);
  });

  it('con el catálogo "no-listo" (inactivo/cargando/error), toda fila con categoriaId cae en "Categoría no disponible"', () => {
    const fila = filaDePreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogoNoListo);

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

  it('un categoriaId no encontrado en un catálogo listo cae en "Categoría no disponible", no en "Sin categoría"', () => {
    const fila = filaDePreview({
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-borrada' },
    });

    const grupos = agruparPreviewPorCategoria([fila], catalogoListo);

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

  it('ordena por bucket canónico (Necesidades, Deseos, Ahorro), luego Ingreso, luego Sin clasificar, luego Duplicadas', () => {
    const filaDeseos = filaDePreview({
      rowIndex: 0,
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-des-1' },
    });
    const filaNecesidades = filaDePreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    });
    const filaIngreso = filaDePreview({
      rowIndex: 2,
      sugerido: { bucket: 'Ingreso', categoriaId: null },
    });
    const filaSinClasificar = filaDePreview({ rowIndex: 3, sugerido: null });
    const filaDuplicada = filaDePreview({ rowIndex: 4, esDuplicado: true });

    const grupos = agruparPreviewPorCategoria(
      [
        filaDeseos,
        filaNecesidades,
        filaIngreso,
        filaSinClasificar,
        filaDuplicada,
      ],
      catalogoListo,
    );

    expect(grupos.map((g) => g.clave)).toEqual([
      'categoria::Necesidades::cat-nec-1',
      'categoria::Deseos::cat-des-1',
      'ingreso',
      'sin-clasificar',
      'duplicadas',
    ]);
  });

  it('dentro de un bucket, ordena las categorías por nombre (localeCompare es), categorías no disponibles al final', () => {
    const catalogo: CatalogoNombresEstado = {
      tag: 'listo',
      nombrePorId: new Map([
        ['cat-z', 'Zapatería'],
        ['cat-a', 'Arriendo'],
      ]),
    };
    const filaZ = filaDePreview({
      rowIndex: 0,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-z' },
    });
    const filaA = filaDePreview({
      rowIndex: 1,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-a' },
    });
    const filaNoDisponible = filaDePreview({
      rowIndex: 2,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-borrada' },
    });

    const grupos = agruparPreviewPorCategoria(
      [filaZ, filaA, filaNoDisponible],
      catalogo,
    );

    expect(grupos.map((g) => g.clave)).toEqual([
      'categoria::Necesidades::cat-a',
      'categoria::Necesidades::cat-z',
      'categoria-no-disponible::Necesidades::cat-borrada',
    ]);
  });

  it('sin filas, no produce ningún grupo', () => {
    expect(agruparPreviewPorCategoria([], catalogoListo)).toEqual([]);
  });
});
