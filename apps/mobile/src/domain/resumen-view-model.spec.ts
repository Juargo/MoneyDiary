import {
  aResumenViewModel,
  aResumenAnualViewModel,
} from './resumen-view-model';
import type { ItemLeyenda } from './resumen-view-model';
import type { ResumenAnualDto, ResumenMesDto } from './resumen.types';

// issue #778 tramo 5b PR5 (apps/api) removed `Bucket.SinCategoria`/
// `cantidadSinCategoria` from the domain and the wire contract entirely — a
// real `ResumenMesDto` is now exactly 3 buckets, no `cantidadSinCategoria`
// key. This fixture reflects the NEW shape; tests below that specifically
// prove deploy-order-safety tolerance for the OLD (legacy) shape build their
// own one-off payload and cast it, since `ResumenMesDto` no longer types
// those fields.
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
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: 'amarillo',
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
            total: '0',
            porcentajeBp: 0,
            estadoSemaforo: null,
          },
        ],
      }),
    );
    const ahorro = vm.buckets.find((b) => b.bucket === 'Ahorro');
    expect(ahorro?.porcentajeLabel).toBe('0%');
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
        ],
        estadoGlobal: null,
      }),
    );
    const necesidades = vm.buckets.find((b) => b.bucket === 'Necesidades');
    expect(necesidades?.estadoSemaforo).toBeNull();
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

  // Issue #778 tramo5b PR2 (apps/mobile): distribucionGasto ya no incluye
  // SinCategoria en absoluto. Tramo5b PR5 (apps/api) luego removió
  // `Bucket.SinCategoria`/`cantidadSinCategoria` del contrato — una
  // respuesta real ya no puede mandar esa entrada, pero una respuesta
  // stale/cacheada durante la ventana de deploy independiente todavía
  // podría. Este fixture LEGACY prueba que igual nunca llega al anillo
  // (deploy-order safety).
  it('calcula la distribución de gasto (share-of-gasto) para el pie, ignorando una entrada SinCategoria legacy del DTO (deploy-order safety, issue #778 tramo5b PR5)', () => {
    const dtoConSinCategoriaLegacy = {
      ...dto(),
      buckets: [
        ...dto().buckets,
        {
          bucket: 'SinCategoria',
          total: '0',
          porcentajeBp: 0,
          estadoSemaforo: null,
        },
      ],
    } as ResumenMesDto;
    const vm = aResumenViewModel(dtoConSinCategoriaLegacy);
    // Necesidades 400k / Deseos 250k / Ahorro 350k → 40/25/35, SinCategoria ausente.
    expect(vm.distribucionGasto.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 40],
      ['Deseos', 25],
      ['Ahorro', 35],
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

    // Issue #778 tramo5b PR2 (reemplaza el retirado test WG5-13 "diluido,
    // sin renormalizar", que afirmaba la dilución ahora revertida): la MISMA
    // fixture con SinCategoria cargando plata prueba que los tres
    // porcentajes de gasto quedan SIN diluir (44/28/28 sobre el denominador
    // de 3 buckets).
    it('leyendaPrincipal no se diluye por un SinCategoria con gasto — 44/28/28 sobre el denominador de 3 buckets (issue #778)', () => {
      const vm = aResumenViewModel(
        dto({
          buckets: [
            {
              bucket: 'Necesidades',
              total: '400000',
              porcentajeBp: 4444,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'Deseos',
              total: '250000',
              porcentajeBp: 2778,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'Ahorro',
              total: '250000',
              porcentajeBp: 2778,
              estadoSemaforo: 'verde',
            },
            {
              bucket: 'SinCategoria',
              total: '100000',
              porcentajeBp: 0,
              estadoSemaforo: null,
            },
          ],
        }),
      );
      // Gasto total = 400k+250k+250k = 900.000 (SinCategoria's 100k queda
      // excluido) → 44/28/28. Comparado directamente contra el propio
      // distribucionGasto (WG5-03: "la leyenda reutiliza el valor del
      // anillo, no computa el suyo propio").
      expect(
        vm.leyendaPrincipal.map((item) => [
          itemGasto(item).bucket,
          itemGasto(item).porcentaje,
        ]),
      ).toEqual([
        ['Necesidades', 44],
        ['Deseos', 28],
        ['Ahorro', 28],
      ]);
      expect(vm.distribucionGasto.map((t) => t.bucket)).toEqual([
        'Necesidades',
        'Deseos',
        'Ahorro',
      ]);
      const porcentajesDelAnillo = vm.distribucionGasto.map(
        (t) => t.porcentaje,
      );
      const porcentajesDeLaLeyenda = vm.leyendaPrincipal.map(
        (item) => itemGasto(item).porcentaje,
      );
      expect(porcentajesDeLaLeyenda).toEqual(porcentajesDelAnillo);
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
          ],
          estadoGlobal: null,
        }),
      );
      expect(vm.leyendaPrincipal).toEqual([]);
      expect(vm.leyendaComplemento).toHaveLength(1);
    });
  });

  describe('leyendaComplemento', () => {
    // Issue #778 tramo5b PR2: la fila `sinCategoria` fue RETIRADA — nunca se
    // leyó `cantidadSinCategoria`/la entrada SinCategoria de `buckets` acá,
    // aunque la API los mandara. Tramo5b PR5 (apps/api) luego removió ambos
    // del contrato entero.
    it('es exactamente [ingreso(+)] — la fila sinCategoria fue retirada (issue #778)', () => {
      const vm = aResumenViewModel(dto());
      expect(vm.leyendaComplemento).toEqual([
        { kind: 'ingreso', montoLabel: '+$1.000.000' },
      ]);
    });

    // issue #778 tramo 5b PR5 removió `cantidadSinCategoria` de
    // `ResumenMesDto` por completo — se mantiene como prueba de
    // deploy-order-safety de que un payload legacy que todavía lo trae
    // (cast, porque el tipo ya no lo permite) sigue sin afectar
    // leyendaComplemento.
    it('cantidadSinCategoria (legacy) no afecta leyendaComplemento sea cual sea su valor (deploy-order safety, issue #778 tramo5b PR5)', () => {
      const conCero = aResumenViewModel({
        ...dto(),
        cantidadSinCategoria: 0,
      } as ResumenMesDto);
      const conVarios = aResumenViewModel({
        ...dto(),
        cantidadSinCategoria: 7,
      } as ResumenMesDto);
      expect(conCero.leyendaComplemento).toEqual([
        { kind: 'ingreso', montoLabel: '+$1.000.000' },
      ]);
      expect(conVarios.leyendaComplemento).toEqual(conCero.leyendaComplemento);
    });

    it('el monto de ingreso lleva signo + y no depende de la entrada SinCategoria del DTO', () => {
      const vm = aResumenViewModel(dto());
      expect(vm.leyendaComplemento).toEqual([
        { kind: 'ingreso', montoLabel: '+$1.000.000' },
      ]);
      const necesidades = itemGasto(vm.leyendaPrincipal[0]);
      expect(necesidades.montoLabel).toBe('-$400.000');
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

  // Issue #778 tramo5b PR2: el anillo mensual ya no incluye SinCategoria — el
  // fixture anual sigue mandando una entrada SinCategoria por mes (la API no
  // cambia en este PR), pero cada mini-torta la ignora igual que el mes
  // principal.
  it('las tajadas de cada mes usan el anillo de 3 items, ignorando la entrada SinCategoria (issue #778)', () => {
    const vm = aResumenAnualViewModel(dtoAnual());
    expect(vm.meses[0].tajadas.map((t) => t.bucket)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
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
