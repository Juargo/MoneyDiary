import { describe, expect, it } from 'vitest';
import { aDetalleBucketMesViewModel } from './detalle-bucket-mes-view-model';
import type { DetalleBucketMesDto } from '../api/types';

function dtoConGrupos(
  grupos: DetalleBucketMesDto['grupos'],
): DetalleBucketMesDto {
  return {
    periodo: '2026-07',
    bucket: 'Deseos',
    total: '500000',
    totalTransacciones: 5,
    totalCategorias: 3,
    porcentajeBp: 5500,
    metaBp: 3000,
    grupos,
  };
}

const gruposOrdenServidor: DetalleBucketMesDto['grupos'] = [
  {
    categoriaId: 'cat-noquis',
    nombre: 'Ñoquis',
    subtotal: '400000',
    conteo: 4,
    transacciones: [
      {
        id: 'tx-1',
        fecha: '2026-07-15T00:00:00.000Z',
        descripcion: 'Ñoquis al pesto',
        origen: 'BCI',
        monto: '400000',
      },
    ],
  },
  {
    categoriaId: 'cat-zapateria',
    nombre: 'Zapatería',
    subtotal: '50000',
    conteo: 1,
    transacciones: [
      {
        id: 'tx-2',
        fecha: '2026-07-16T00:00:00.000Z',
        descripcion: 'Zapatos',
        origen: 'BCI',
        monto: '50000',
      },
    ],
  },
  {
    categoriaId: null,
    nombre: 'Sin categoría',
    subtotal: '50000',
    conteo: 1,
    transacciones: [
      {
        id: 'tx-3',
        fecha: '2026-07-17T00:00:00.000Z',
        descripcion: 'Movimiento sin categoría',
        origen: 'Manual',
        monto: '50000',
      },
    ],
  },
];

describe('aDetalleBucketMesViewModel', () => {
  it('pasa los grupos verbatim, en el orden exacto del servidor — sin re-sort ni re-agrupación (WDM-03/WCAT-02)', () => {
    const viewModel = aDetalleBucketMesViewModel(
      dtoConGrupos(gruposOrdenServidor),
    );

    expect(viewModel.grupos.map((g) => g.nombre)).toEqual([
      'Ñoquis',
      'Zapatería',
      'Sin categoría',
    ]);
    const sinCategoria = viewModel.grupos[2];
    expect(sinCategoria.categoriaId).toBeNull();
    expect(sinCategoria.subtotalLabel).toBe('$50.000');
    expect(sinCategoria.conteo).toBe(1);
    expect(sinCategoria.transacciones[0]).toEqual({
      id: 'tx-3',
      fecha: '2026-07-17T00:00:00.000Z',
      descripcion: 'Movimiento sin categoría',
      origen: 'Manual',
      montoLabel: '$50.000',
    });
  });

  it('D-02: origen pasa verbatim del wire — señal esManual para el futuro control de borrado (WEB-DEL-01, PR3)', () => {
    const viewModel = aDetalleBucketMesViewModel(
      dtoConGrupos(gruposOrdenServidor),
    );

    expect(viewModel.grupos[0].transacciones[0].origen).toBe('BCI');
    expect(viewModel.grupos[2].transacciones[0].origen).toBe('Manual');
  });

  it('un mes sin movimientos llega con totales en cero y grupos vacíos (MBD-01/WDM-05)', () => {
    const viewModel = aDetalleBucketMesViewModel({
      ...dtoConGrupos([]),
      total: '0',
      totalTransacciones: 0,
      totalCategorias: 0,
    });

    expect(viewModel.totalLabel).toBe('$0');
    expect(viewModel.totalTransacciones).toBe(0);
    expect(viewModel.totalCategorias).toBe(0);
    expect(viewModel.grupos).toEqual([]);
  });

  it('línea de totales: total formateado y conteo de transacciones', () => {
    const viewModel = aDetalleBucketMesViewModel(dtoConGrupos([]));

    expect(viewModel.totalLabel).toBe('$500.000');
    expect(viewModel.totalTransacciones).toBe(5);
  });

  // categoria-iconografia (design.md "Data Flow", WDM-03): `icono` viaja del
  // grupo del wire al view model, normalizado con `?? null` porque el campo
  // es `.optional()` en el tipo generado (D-11) aunque el servidor SIEMPRE
  // emite la clave en runtime.
  it('mapea grupo.icono verbatim cuando el wire trae un valor (WDM-03)', () => {
    const viewModel = aDetalleBucketMesViewModel(
      dtoConGrupos([
        {
          categoriaId: 'cat-noquis',
          nombre: 'Ñoquis',
          subtotal: '400000',
          conteo: 4,
          icono: 'shopping-cart',
          transacciones: [],
        },
      ]),
    );

    expect(viewModel.grupos[0].icono).toBe('shopping-cart');
  });

  it('normaliza un icono ausente del wire a null (D-11, la clave puede faltar en el tipo)', () => {
    const viewModel = aDetalleBucketMesViewModel(
      dtoConGrupos(gruposOrdenServidor),
    );

    expect(viewModel.grupos[0].icono).toBeNull();
  });

  // MBD-02 garantiza `icono: null` para el grupo sintético en el servidor; acá
  // se prueba que ese null llega intacto al view model, no que el cliente se
  // defienda de una respuesta que viole esa invariante.
  it('propaga como null el icono del grupo sintético Sin categoría', () => {
    const viewModel = aDetalleBucketMesViewModel(
      dtoConGrupos(gruposOrdenServidor),
    );

    const sinCategoria = viewModel.grupos[2];
    expect(sinCategoria.nombre).toBe('Sin categoría');
    expect(sinCategoria.icono).toBeNull();
  });
});
