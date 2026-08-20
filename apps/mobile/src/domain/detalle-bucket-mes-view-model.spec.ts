import { aDetalleBucketMesViewModel } from './detalle-bucket-mes-view-model';
import type { DetalleBucketMesDto } from './detalle.types';

// T-04 RED: unit specs for aDetalleBucketMesViewModel (US-056, D-22/T-C1)
// Fixtures MUST satisfy the real DTO shape (esDetalleBucketMesDto guard-ready).

function makeDto(
  overrides: Partial<DetalleBucketMesDto> = {},
): DetalleBucketMesDto {
  return {
    bucket: 'Deseos',
    periodo: '2026-07',
    total: '500000',
    totalTransacciones: 3,
    totalCategorias: 2,
    porcentajeBp: 2500,
    metaBp: 3000,
    grupos: [
      {
        categoriaId: 'cat-1',
        nombre: 'Entretenimiento',
        subtotal: '200000',
        conteo: 2,
        transacciones: [
          {
            id: 'tx-1',
            fecha: '2026-07-10T00:00:00.000Z',
            descripcion: 'Cinema',
            monto: '120000',
          },
          {
            id: 'tx-2',
            fecha: '2026-07-15T00:00:00.000Z',
            descripcion: 'Spotify',
            monto: '80000',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('aDetalleBucketMesViewModel', () => {
  it('result.bucket equals the raw wire key — no etiquetaBucket field', () => {
    const dto = makeDto({ bucket: 'Deseos' });
    const vm = aDetalleBucketMesViewModel(dto);
    expect(vm.bucket).toBe('Deseos');
    // The VM must NOT produce an etiquetaBucket field — label is component layer
    expect((vm as Record<string, unknown>).etiquetaBucket).toBeUndefined();
  });

  it('totalLabel preserves digits beyond Number.MAX_SAFE_INTEGER', () => {
    // dto.total="9007199254740993" — BigInt-exact; parseFloat would lose the last digit
    const dto = makeDto({ total: '9007199254740993' });
    const vm = aDetalleBucketMesViewModel(dto);
    expect(vm.totalLabel).toBe('$9.007.199.254.740.993');
  });

  it("porcentajeLabel is '—' when porcentajeBp is null (SIN_PORCENTAJE_LABEL)", () => {
    const dto = makeDto({ porcentajeBp: null });
    const vm = aDetalleBucketMesViewModel(dto);
    expect(vm.porcentajeLabel).toBe('—');
  });

  it("metaLabel is 'Sin meta' when metaBp is null", () => {
    const dto = makeDto({ metaBp: null });
    const vm = aDetalleBucketMesViewModel(dto);
    expect(vm.metaLabel).toBe('Sin meta');
  });

  it('sinMeta flag is true iff metaBp is null', () => {
    expect(aDetalleBucketMesViewModel(makeDto({ metaBp: null })).sinMeta).toBe(
      true,
    );
    expect(aDetalleBucketMesViewModel(makeDto({ metaBp: 3000 })).sinMeta).toBe(
      false,
    );
  });

  it('sinPorcentaje flag is true iff porcentajeBp is null', () => {
    expect(
      aDetalleBucketMesViewModel(makeDto({ porcentajeBp: null })).sinPorcentaje,
    ).toBe(true);
    expect(
      aDetalleBucketMesViewModel(makeDto({ porcentajeBp: 2500 })).sinPorcentaje,
    ).toBe(false);
  });

  it('marcaPorcentajePct is clamped 0..100', () => {
    // 5000bp → 50%
    expect(
      aDetalleBucketMesViewModel(makeDto({ porcentajeBp: 5000 }))
        .marcaPorcentajePct,
    ).toBe(50);
    // 15000bp clamps to 100
    expect(
      aDetalleBucketMesViewModel(makeDto({ porcentajeBp: 15000 }))
        .marcaPorcentajePct,
    ).toBe(100);
    // null porcentajeBp → clampBp(0) = 0
    expect(
      aDetalleBucketMesViewModel(makeDto({ porcentajeBp: null }))
        .marcaPorcentajePct,
    ).toBe(0);
  });

  it('marcaMetaPct is null when metaBp is null', () => {
    expect(
      aDetalleBucketMesViewModel(makeDto({ metaBp: null })).marcaMetaPct,
    ).toBeNull();
    // non-null metaBp → clamped value
    expect(
      aDetalleBucketMesViewModel(makeDto({ metaBp: 3000 })).marcaMetaPct,
    ).toBe(30);
  });

  it('grupos array order and count match dto.grupos verbatim', () => {
    const grupos = [
      {
        categoriaId: 'a',
        nombre: 'Alpha',
        subtotal: '100',
        conteo: 1,
        transacciones: [],
      },
      {
        categoriaId: 'b',
        nombre: 'Beta',
        subtotal: '200',
        conteo: 2,
        transacciones: [],
      },
    ];
    const vm = aDetalleBucketMesViewModel(makeDto({ grupos }));
    expect(vm.grupos).toHaveLength(2);
    expect(vm.grupos[0].nombre).toBe('Alpha');
    expect(vm.grupos[1].nombre).toBe('Beta');
  });

  it('subtotalLabel and montoLabel are BigInt-exact CLP strings', () => {
    const grupos = [
      {
        categoriaId: null,
        nombre: 'Sin categoría',
        subtotal: '9007199254740993',
        conteo: 1,
        transacciones: [
          {
            id: 'tx-big',
            fecha: '2026-07-01T00:00:00.000Z',
            descripcion: 'Test',
            monto: '9007199254740993',
          },
        ],
      },
    ];
    const vm = aDetalleBucketMesViewModel(makeDto({ grupos }));
    expect(vm.grupos[0].subtotalLabel).toBe('$9.007.199.254.740.993');
    expect(vm.grupos[0].transacciones[0].montoLabel).toBe(
      '$9.007.199.254.740.993',
    );
  });
});
