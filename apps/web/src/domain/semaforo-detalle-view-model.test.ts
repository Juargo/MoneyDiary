import { describe, expect, it } from 'vitest';
import { aSemaforoDetalleViewModel } from './semaforo-detalle-view-model';
import type {
  SemaforoBucketDetalleDto,
  SemaforoDetalleDto,
} from '../api/types';

function bucketDto(
  overrides: Partial<SemaforoBucketDetalleDto> = {},
): SemaforoBucketDetalleDto {
  return {
    bucket: 'Necesidades',
    total: '400000',
    porcentajeBp: 4000,
    estadoSemaforo: 'verde',
    metaBp: 5000,
    bandas: {
      verdeMin: null,
      verdeMax: 5000,
      amarilloMin: null,
      amarilloMax: 6000,
    },
    consejo: null,
    ...overrides,
  };
}

function ahorroBucketDto(
  overrides: Partial<SemaforoBucketDetalleDto> = {},
): SemaforoBucketDetalleDto {
  return {
    bucket: 'Ahorro',
    total: '150000',
    porcentajeBp: 1500,
    estadoSemaforo: 'amarillo',
    metaBp: 2000,
    bandas: {
      verdeMin: 2000,
      verdeMax: 4000,
      amarilloMin: 1000,
      amarilloMax: 5000,
    },
    consejo: null,
    ...overrides,
  };
}

function detalleDto(
  buckets: SemaforoBucketDetalleDto[] = [bucketDto()],
): SemaforoDetalleDto {
  return {
    periodo: '2026-07',
    totalIngreso: '1000000',
    sinIngreso: false,
    estadoGlobal: 'verde',
    diagnostico:
      'Tu mes está en verde: los tres grupos están dentro de su rango.',
    bucketsCriticos: [],
    buckets,
    sinCategoria: { cantidad: 0, total: '0' },
  };
}

describe('aSemaforoDetalleViewModel', () => {
  it('sustituye {monto} con el monto formateado en CLP', () => {
    const dto = detalleDto([
      bucketDto({
        estadoSemaforo: 'rojo',
        consejo: {
          direccion: 'reducir',
          monto: '199951',
          mensaje:
            'Para volver a Verde, reduce {monto} en Necesidades este mes.',
        },
      }),
    ]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].consejo?.texto).toBe(
      'Para volver a Verde, reduce $199.951 en Necesidades este mes.',
    );
  });

  it('no deja sobrevivir el token crudo {monto}', () => {
    const dto = detalleDto([
      bucketDto({
        estadoSemaforo: 'rojo',
        consejo: {
          direccion: 'reducir',
          monto: '199951',
          mensaje:
            'Para volver a Verde, reduce {monto} en Necesidades este mes.',
        },
      }),
    ]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].consejo?.texto).not.toContain('{monto}');
  });

  it('un mensaje que viola el contrato con {monto} repetido sustituye AMBAS ocurrencias (replaceAll, degradación segura)', () => {
    const dto = detalleDto([
      bucketDto({
        estadoSemaforo: 'rojo',
        consejo: {
          direccion: 'reducir',
          monto: '199951',
          mensaje: 'Reduce {monto} en Necesidades — hoy son {monto}.',
        },
      }),
    ]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].consejo?.texto).toBe(
      'Reduce $199.951 en Necesidades — hoy son $199.951.',
    );
    expect(vm.buckets[0].consejo?.texto).not.toContain('{monto}');
  });

  it('un mensaje sin el placeholder se renderiza verbatim (defensivo)', () => {
    const dto = detalleDto([
      bucketDto({
        estadoSemaforo: 'rojo',
        consejo: {
          direccion: 'reducir',
          monto: '199951',
          mensaje: 'Mensaje sin placeholder.',
        },
      }),
    ]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].consejo?.texto).toBe('Mensaje sin placeholder.');
  });

  it('porcentajeLabel usa el helper compartido aPorcentajeLabel', () => {
    const dto = detalleDto([bucketDto({ porcentajeBp: null })]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].porcentajeLabel).toBe('—');
  });

  it('consejo: null → sin fila de consejo', () => {
    const dto = detalleDto([bucketDto({ consejo: null })]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].consejo).toBeNull();
  });

  it('la posición del marcador es bp/100', () => {
    const dto = detalleDto([bucketDto({ porcentajeBp: 4000 })]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].markerPct).toBe(40);
  });

  it('bp > 10000 clampa el marcador a 100', () => {
    const dto = detalleDto([bucketDto({ porcentajeBp: 12000 })]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].markerPct).toBe(100);
  });

  it('las bandas unilaterales empiezan en 0', () => {
    const dto = detalleDto([bucketDto()]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].segmentos[0].desdePct).toBe(0);
  });

  it('Ahorro produce 5 segmentos ordenados y contiguos (rojo, amarillo, verde, amarillo, rojo)', () => {
    const dto = detalleDto([ahorroBucketDto()]);

    const vm = aSemaforoDetalleViewModel(dto);
    const segmentos = vm.buckets[0].segmentos;

    expect(segmentos.map((s) => s.estado)).toEqual([
      'rojo',
      'amarillo',
      'verde',
      'amarillo',
      'rojo',
    ]);
    for (let i = 1; i < segmentos.length; i++) {
      const anterior = segmentos[i - 1];
      expect(segmentos[i].desdePct).toBeCloseTo(
        anterior.desdePct + anterior.anchoPct,
      );
    }
  });

  it('un bucket unilateral produce 3 segmentos (verde, amarillo, rojo)', () => {
    const dto = detalleDto([bucketDto()]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].segmentos.map((s) => s.estado)).toEqual([
      'verde',
      'amarillo',
      'rojo',
    ]);
  });

  it('los anchos de los segmentos suman exactamente 100', () => {
    const unilateral = aSemaforoDetalleViewModel(detalleDto([bucketDto()]));
    const sumaUnilateral = unilateral.buckets[0].segmentos.reduce(
      (acc, s) => acc + s.anchoPct,
      0,
    );
    expect(sumaUnilateral).toBeCloseTo(100);

    const ahorro = aSemaforoDetalleViewModel(detalleDto([ahorroBucketDto()]));
    const sumaAhorro = ahorro.buckets[0].segmentos.reduce(
      (acc, s) => acc + s.anchoPct,
      0,
    );
    expect(sumaAhorro).toBeCloseTo(100);
  });

  it('metaLabel deriva "Meta: 50%" desde metaBp', () => {
    const dto = detalleDto([bucketDto({ metaBp: 5000 })]);

    const vm = aSemaforoDetalleViewModel(dto);

    expect(vm.buckets[0].metaLabel).toBe('Meta: 50%');
  });
});
