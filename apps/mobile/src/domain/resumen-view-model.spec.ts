import {
  aResumenViewModel,
  aResumenAnualViewModel,
} from './resumen-view-model';
import type { ItemLeyenda } from './resumen-view-model';
import type { ResumenAnualDto, ResumenMesDto } from './resumen.types';

function dto(overrides: Partial<ResumenMesDto> = {}): ResumenMesDto {
  return {
    periodo: '2026-07',
    totalIngreso: '1000000',
    sinIngreso: false,
    buckets: [
      {
        bucket: 'Necesidades',
        total: '400000',
        porcentajeBp: 4000,
        estadoSemaforo: 'verde',
      },
      {
        bucket: 'Deseos',
        total: '250000',
        porcentajeBp: 2500,
        estadoSemaforo: 'verde',
      },
      {
        bucket: 'Ahorro',
        total: '350000',
        porcentajeBp: 3500,
        estadoSemaforo: 'amarillo',
      },
      {
        bucket: 'SinCategoria',
        total: '0',
        porcentajeBp: 0,
        estadoSemaforo: null,
      },
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: 'amarillo',
    cantidadSinCategoria: 0,
    ...overrides,
  };
}

/** Un año completo (12 meses) con datos, cada uno igual al `dto()` base salvo su `periodo`. */
function dtoAnual(overrides: Partial<ResumenAnualDto> = {}): ResumenAnualDto {
  return {
    anio: 2026,
    meses: Array.from({ length: 12 }, (_, i) =>
      dto({ periodo: `2026-${String(i + 1).padStart(2, '0')}` }),
    ),
    ...overrides,
  };
}

function itemGasto(item: ItemLeyenda) {
  if (item.kind !== 'gasto') {
    throw new Error(`Expected kind 'gasto', got '${item.kind}'`);
  }
  return item;
}

function itemSinCategoria(item: ItemLeyenda) {
  if (item.kind !== 'sinCategoria') {
    throw new Error(`Expected kind 'sinCategoria', got '${item.kind}'`);
  }
  return item;
}

describe('aResumenViewModel', () => {
  it('formatea totalIngreso como CLP', () => {
    const vm = aResumenViewModel(dto());
    expect(vm.totalIngreso).toBe('$1.000.000');
  });

  it('mapea cada bucket con su monto formateado y porcentaje', () => {
    const vm = aResumenViewModel(dto());
    const necesidades = vm.buckets.find((b) => b.bucket === 'Necesidades');
    expect(necesidades).toMatchObject({
      bucket: 'Necesidades',
      total: '$400.000',
      porcentajeLabel: '40%',
      estadoSemaforo: 'verde',
    });
  });

  it('mapea porcentajeBp: 0 (verdadero cero) como "0%"', () => {
    const vm = aResumenViewModel(dto());
    const sinCategoria = vm.buckets.find((b) => b.bucket === 'SinCategoria');
    expect(sinCategoria?.porcentajeLabel).toBe('0%');
  });

  it('mapea porcentajeBp: null a una etiqueta distinta de "0%" (MOB-06)', () => {
    const vm = aResumenViewModel(
      dto({
        sinIngreso: true,
        totalIngreso: '0',
        buckets: [
          {
            bucket: 'Necesidades',
            total: '0',
            porcentajeBp: null,
            estadoSemaforo: null,
          },
          {
            bucket: 'Deseos',
            total: '0',
            porcentajeBp: null,
            estadoSemaforo: null,
          },
          {
            bucket: 'Ahorro',
            total: '0',
            porcentajeBp: null,
            estadoSemaforo: null,
          },
          {
            bucket: 'SinCategoria',
            total: '0',
            porcentajeBp: null,
            estadoSemaforo: null,
          },
        ],
        estadoGlobal: null,
      }),
    );
    const necesidades = vm.buckets.find((b) => b.bucket === 'Necesidades');
    expect(necesidades?.porcentajeLabel).not.toBe('0%');
  });

  it('mapea sinIngreso: true a un flag de vacío distinto de un dato $0', () => {
    const vm = aResumenViewModel(dto({ sinIngreso: true, totalIngreso: '0' }));
    expect(vm.sinIngreso).toBe(true);
    // El flag debe ser lo que decide el estado "empty", no el valor formateado.
    expect(vm.totalIngreso).toBe('$0');
  });

  it('mapea estadoSemaforo por bucket a un indicador visual', () => {
    const vm = aResumenViewModel(dto());
    const ahorro = vm.buckets.find((b) => b.bucket === 'Ahorro');
    expect(ahorro?.estadoSemaforo).toBe('amarillo');
  });

  it('mapea estadoSemaforo: null por bucket', () => {
    const vm = aResumenViewModel(dto());
    const sinCategoria = vm.buckets.find((b) => b.bucket === 'SinCategoria');
    expect(sinCategoria?.estadoSemaforo).toBeNull();
  });

  it('propaga estadoGlobal al view model (nunca recomputado, ADR-024)', () => {
    const vm = aResumenViewModel(dto());
    expect(vm.estadoGlobal).toBe('amarillo');
  });

  it('propaga estadoGlobal: null cuando sinIngreso', () => {
    const vm = aResumenViewModel(dto({ estadoGlobal: null }));
    expect(vm.estadoGlobal).toBeNull();
  });

  it('ya NO expone periodoLabel — retirado en PR5b, el shell lo deriva solo (design §1.8)', () => {
    const vm = aResumenViewModel(dto());
    expect(vm).not.toHaveProperty('periodoLabel');
  });

  // US-050 PR1 (design §4 impact sweep — "blast radius is the returned
  // array's length"): calcularDistribucionGasto now apportions over the
  // 4-item BUCKETS_ANILLO (SinCategoria dilutes, WG5-13) instead of the old
  // 3-item BUCKETS_GASTO. `distribucionGasto` is a direct passthrough here
  // (no filtering in this file yet — that lands in PR3's leyendaPrincipal),
  // so this pre-existing assertion is updated to the new, intentional
  // 4-item shape. Production code in this file is unchanged.
  it('calcula la distribución de gasto (share-of-gasto) para el pie, incluyendo SinCategoria en el anillo', () => {
    const vm = aResumenViewModel(dto());
    // Necesidades 400k / Deseos 250k / Ahorro 350k / SinCategoria 0 → 40/25/35/0.
    expect(vm.distribucionGasto.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 40],
      ['Deseos', 25],
      ['Ahorro', 35],
      ['SinCategoria', 0],
    ]);
  });

  // US-050 PR4a (design §1.8, MOB-15): `targets` is fully removed from
  // `ResumenViewModel` now that `DistribucionPie`'s IDEAL inset is gone —
  // its last consumer (`ResumenScreen.tsx`) no longer reads it. This closes
  // the backward-compat shim PR3 opened (see PR3's own deviation note in
  // apply-progress / this file's git history) — do not reintroduce it.
  it('ya no expone `targets` en el view model (IDEAL inset removido, MOB-15)', () => {
    const vm = aResumenViewModel(dto());
    expect(vm).not.toHaveProperty('targets');
  });

  describe('leyendaPrincipal', () => {
    it('contiene exactamente 3 items kind:"gasto" en el orden canónico Necesidades/Deseos/Ahorro', () => {
      const vm = aResumenViewModel(dto());
      expect(vm.leyendaPrincipal.map((item) => item.kind)).toEqual([
        'gasto',
        'gasto',
        'gasto',
      ]);
      expect(vm.leyendaPrincipal.map((item) => itemGasto(item).bucket)).toEqual(
        ['Necesidades', 'Deseos', 'Ahorro'],
      );
    });

    it('sus porcentajes son los del anillo diluido por SinCategoria, sin renormalizar (WG5-13)', () => {
      const vm = aResumenViewModel(
        dto({
          buckets: [
            {
              bucket: 'Necesidades',
              total: '250000',
              porcentajeBp: 2500,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'Deseos',
              total: '150000',
              porcentajeBp: 1500,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'Ahorro',
              total: '100000',
              porcentajeBp: 1000,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'SinCategoria',
              total: '500000',
              porcentajeBp: 5000,
              estadoSemaforo: null,
            },
          ],
        }),
      );
      // Gasto total = 250k+150k+100k+500k = 1.000.000 → 25/15/10/50. Las tres
      // filas de gasto muestran la MISMA cifra diluida que el anillo, no una
      // renormalización a 3 buckets (25+15+10=50, no 100).
      expect(
        vm.leyendaPrincipal.map((item) => [
          itemGasto(item).bucket,
          itemGasto(item).porcentaje,
        ]),
      ).toEqual([
        ['Necesidades', 25],
        ['Deseos', 15],
        ['Ahorro', 10],
      ]);
    });

    it('queda vacío cuando no hay gasto, mientras leyendaComplemento se mantiene', () => {
      const vm = aResumenViewModel(
        dto({
          sinIngreso: true,
          totalIngreso: '0',
          buckets: [
            {
              bucket: 'Necesidades',
              total: '0',
              porcentajeBp: null,
              estadoSemaforo: null,
            },
            {
              bucket: 'Deseos',
              total: '0',
              porcentajeBp: null,
              estadoSemaforo: null,
            },
            {
              bucket: 'Ahorro',
              total: '0',
              porcentajeBp: null,
              estadoSemaforo: null,
            },
            {
              bucket: 'SinCategoria',
              total: '0',
              porcentajeBp: null,
              estadoSemaforo: null,
            },
          ],
          cantidadSinCategoria: 0,
          estadoGlobal: null,
        }),
      );
      expect(vm.leyendaPrincipal).toEqual([]);
      expect(vm.leyendaComplemento).toHaveLength(2);
    });
  });

  describe('leyendaComplemento', () => {
    it('es siempre [ingreso, sinCategoria] en ese orden, sin importar el gasto', () => {
      const vm = aResumenViewModel(dto());
      expect(vm.leyendaComplemento.map((item) => item.kind)).toEqual([
        'ingreso',
        'sinCategoria',
      ]);
    });

    it('cantidadSinCategoria: 0 produce una fila real "0 tx", nunca omitida (WG5-05)', () => {
      const vm = aResumenViewModel(dto({ cantidadSinCategoria: 0 }));
      const sinCategoria = itemSinCategoria(vm.leyendaComplemento[1]);
      expect(sinCategoria.cantidadLabel).toBe('0 tx');
    });

    it('el monto de ingreso lleva signo +, gasto lleva signo - (magnitud 0 nunca lleva signo)', () => {
      const vm = aResumenViewModel(dto());
      const [ingreso, sinCategoria] = vm.leyendaComplemento;
      expect(ingreso.montoLabel).toBe('+$1.000.000');
      // SinCategoria total es '0' en el fixture base — magnitud 0 no lleva
      // signo (contrato de formatearMontoConSigno, PR1), por eso '$0' y no
      // '-$0'. El signo real de un sinCategoria con monto > 0 se ejerce vía
      // formatearMontoConSigno('-') igual que un bucket de gasto.
      expect(itemSinCategoria(sinCategoria).montoLabel).toBe('$0');
      const necesidades = itemGasto(vm.leyendaPrincipal[0]);
      expect(necesidades.montoLabel).toBe('-$400.000');
    });

    it('un sinCategoria con monto > 0 sí lleva signo -', () => {
      const vm = aResumenViewModel(
        dto({
          buckets: [
            {
              bucket: 'Necesidades',
              total: '400000',
              porcentajeBp: 4000,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'Deseos',
              total: '250000',
              porcentajeBp: 2500,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'Ahorro',
              total: '350000',
              porcentajeBp: 3500,
              estadoSemaforo: 'amarillo',
            },
            {
              bucket: 'SinCategoria',
              total: '150000',
              porcentajeBp: 1500,
              estadoSemaforo: null,
            },
          ],
          cantidadSinCategoria: 3,
        }),
      );
      const sinCategoria = itemSinCategoria(vm.leyendaComplemento[1]);
      expect(sinCategoria.montoLabel).toBe('-$150.000');
      expect(sinCategoria.cantidadLabel).toBe('3 tx');
    });
  });
});

describe('aResumenAnualViewModel', () => {
  it('produce 12 meses con etiquetas ENE…DIC', () => {
    const vm = aResumenAnualViewModel(dtoAnual());
    expect(vm.anio).toBe(2026);
    expect(vm.meses).toHaveLength(12);
    expect(vm.meses.map((m) => m.etiqueta)).toEqual([
      'ENE',
      'FEB',
      'MAR',
      'ABR',
      'MAY',
      'JUN',
      'JUL',
      'AGO',
      'SEP',
      'OCT',
      'NOV',
      'DIC',
    ]);
    expect(vm.meses[6].nombreAccesible).toBe('julio 2026');
  });

  it('tieneDatos es el inverso de sinIngreso por mes', () => {
    const meses = dtoAnual().meses.map((m, i) =>
      i === 3
        ? dto({
            periodo: m.periodo,
            sinIngreso: true,
            totalIngreso: '0',
            buckets: m.buckets.map((b) => ({
              ...b,
              total: '0',
              porcentajeBp: null,
            })),
            estadoGlobal: null,
          })
        : m,
    );
    const vm = aResumenAnualViewModel(dtoAnual({ meses }));
    expect(vm.meses[3].tieneDatos).toBe(false);
    expect(vm.meses[0].tieneDatos).toBe(true);
  });

  it('las tajadas de cada mes usan el anillo de 4 items (design §1.4c)', () => {
    const vm = aResumenAnualViewModel(dtoAnual());
    expect(vm.meses[0].tajadas.map((t) => t.bucket)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
      'SinCategoria',
    ]);
  });

  it('sinDatosEnElAnio es true solo cuando los 12 meses tienen sinIngreso', () => {
    const vmConDatos = aResumenAnualViewModel(dtoAnual());
    expect(vmConDatos.sinDatosEnElAnio).toBe(false);

    const mesesVacios = dtoAnual().meses.map((m) =>
      dto({
        periodo: m.periodo,
        sinIngreso: true,
        totalIngreso: '0',
        buckets: m.buckets.map((b) => ({
          ...b,
          total: '0',
          porcentajeBp: null,
        })),
        estadoGlobal: null,
      }),
    );
    const vmVacio = aResumenAnualViewModel(dtoAnual({ meses: mesesVacios }));
    expect(vmVacio.sinDatosEnElAnio).toBe(true);
  });

  it('un mes sin gasto produce tajadas: [] (sin dividir por cero)', () => {
    const meses = dtoAnual().meses.map((m, i) =>
      i === 5
        ? dto({
            periodo: m.periodo,
            sinIngreso: true,
            totalIngreso: '0',
            buckets: m.buckets.map((b) => ({
              ...b,
              total: '0',
              porcentajeBp: null,
            })),
            estadoGlobal: null,
          })
        : m,
    );
    const vm = aResumenAnualViewModel(dtoAnual({ meses }));
    expect(vm.meses[5].tajadas).toEqual([]);
  });
});
