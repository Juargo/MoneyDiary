import { describe, expect, it } from 'vitest';
import { aDetalleBucketMesViewModel } from './detalle-bucket-mes-view-model';
import { SIN_PORCENTAJE_LABEL } from './porcentaje';
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
        monto: '50000',
      },
    ],
  },
];

describe('aDetalleBucketMesViewModel', () => {
  it('etiqueta porcentaje y meta SOLO vía aPorcentajeLabel (ADR-024, WDM-08)', () => {
    const viewModel = aDetalleBucketMesViewModel(dtoConGrupos([]));

    expect(viewModel.porcentajeLabel).toBe('55%');
    expect(viewModel.metaLabel).toBe('30%');
  });

  it('porcentajeBp/metaBp null → SIN_PORCENTAJE_LABEL en las etiquetas (MBD-03)', () => {
    const viewModel = aDetalleBucketMesViewModel({
      ...dtoConGrupos([]),
      porcentajeBp: null,
      metaBp: null,
    });

    expect(viewModel.porcentajeLabel).toBe(SIN_PORCENTAJE_LABEL);
    expect(viewModel.metaLabel).toBe(SIN_PORCENTAJE_LABEL);
  });

  it('marcaPorcentajePct = bp/100 (presentación pura del wire, WDM-08)', () => {
    const viewModel = aDetalleBucketMesViewModel(dtoConGrupos([]));

    expect(viewModel.marcaPorcentajePct).toBe(55);
  });

  it('clampa marcaPorcentajePct/marcaMetaPct a 0..100', () => {
    const viewModel = aDetalleBucketMesViewModel({
      ...dtoConGrupos([]),
      porcentajeBp: 0,
      metaBp: 12000,
    });

    expect(viewModel.marcaPorcentajePct).toBe(0);
    expect(viewModel.marcaMetaPct).toBe(100);
  });

  it('marcaMetaPct es null cuando metaBp es null (mientras marcaPorcentajePct sigue numérico)', () => {
    const viewModel = aDetalleBucketMesViewModel({
      ...dtoConGrupos([]),
      metaBp: null,
    });

    expect(viewModel.marcaMetaPct).toBeNull();
    expect(viewModel.marcaPorcentajePct).toBe(55);
  });

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
      montoLabel: '$50.000',
    });
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

  it('sinPorcentaje = true cuando porcentajeBp es null (barra oculta, D-02)', () => {
    const viewModel = aDetalleBucketMesViewModel({
      ...dtoConGrupos([]),
      porcentajeBp: null,
    });

    expect(viewModel.sinPorcentaje).toBe(true);
    expect(aDetalleBucketMesViewModel(dtoConGrupos([])).sinPorcentaje).toBe(
      false,
    );
  });

  it('sinMeta = true cuando metaBp es null (tag oculto, SinCategoria — D-02)', () => {
    const viewModel = aDetalleBucketMesViewModel({
      ...dtoConGrupos([]),
      metaBp: null,
    });

    expect(viewModel.sinMeta).toBe(true);
    expect(aDetalleBucketMesViewModel(dtoConGrupos([])).sinMeta).toBe(false);
  });

  it('línea de totales: total formateado y conteo de transacciones', () => {
    const viewModel = aDetalleBucketMesViewModel(dtoConGrupos([]));

    expect(viewModel.totalLabel).toBe('$500.000');
    expect(viewModel.totalTransacciones).toBe(5);
  });
});
