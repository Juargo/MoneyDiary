import { describe, expect, it } from 'vitest';
import { aResumenViewModel } from './resumen-view-model';
import type { ResumenMesDto } from '../api/types';

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
    // Nonzero default (not 0) so the explicit `{ cantidadSinCategoria: 0 }`
    // override below genuinely proves the zero-mapping path instead of being
    // a no-op against an already-zero default.
    cantidadSinCategoria: 3,
    ...overrides,
  };
}

describe('aResumenViewModel', () => {
  it('formatea totalIngreso como CLP', () => {
    const vm = aResumenViewModel(dto());
    expect(vm.totalIngreso).toBe('$1.000.000');
  });

  it('preserva cada dígito exacto en montos que exceden Number.MAX_SAFE_INTEGER (W1-01)', () => {
    const vm = aResumenViewModel(dto({ totalIngreso: '9007199254740993' }));
    expect(vm.totalIngreso).toBe('$9.007.199.254.740.993');
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

  it('mapea porcentajeBp: null a una etiqueta distinta de "0%" (MOB-06 / W1-02)', () => {
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
    expect(vm.totalIngreso).toBe('$0');
  });

  it('mapea estadoSemaforo por bucket a un indicador visual (passthrough, sin recomputar)', () => {
    const vm = aResumenViewModel(dto());
    const ahorro = vm.buckets.find((b) => b.bucket === 'Ahorro');
    expect(ahorro?.estadoSemaforo).toBe('amarillo');
  });

  it('mapea estadoSemaforo: null por bucket', () => {
    const vm = aResumenViewModel(dto());
    const sinCategoria = vm.buckets.find((b) => b.bucket === 'SinCategoria');
    expect(sinCategoria?.estadoSemaforo).toBeNull();
  });

  it('propaga estadoGlobal al view model (passthrough)', () => {
    const vm = aResumenViewModel(dto());
    expect(vm.estadoGlobal).toBe('amarillo');
  });

  it('propaga estadoGlobal: null cuando sinIngreso', () => {
    const vm = aResumenViewModel(dto({ estadoGlobal: null }));
    expect(vm.estadoGlobal).toBeNull();
  });

  it('propaga los targets 50/30/20 para referencia visual', () => {
    const vm = aResumenViewModel(dto());
    expect(vm.targets).toEqual({ Necesidades: 50, Deseos: 30, Ahorro: 20 });
  });

  it('propaga periodo verbatim', () => {
    const vm = aResumenViewModel(dto({ periodo: '2026-06' }));
    expect(vm.periodo).toBe('2026-06');
  });

  // Issue #778 tramo5b PR1 (apps/web): distribucionGasto no longer includes
  // SinCategoria at all — the fixture's `buckets` array still carries a
  // SinCategoria entry (the API is unchanged in this PR), but it never
  // reaches the ring/legend.
  it('distribucionGasto ignora la entrada SinCategoria del DTO — no aparece y no distorsiona los otros 3 buckets (issue #778)', () => {
    const vm = aResumenViewModel(dto());
    // Necesidades 400k / Deseos 250k / Ahorro 350k → 40/25/35, SinCategoria absent.
    expect(vm.distribucionGasto.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 40],
      ['Deseos', 25],
      ['Ahorro', 35],
    ]);
  });

  it('distribucionGasto es dominio puro: solo bucket/porcentaje/fraccion, sin color ni etiqueta UI (FIX 0)', () => {
    const vm = aResumenViewModel(dto());
    const necesidades = vm.distribucionGasto.find(
      (t) => t.bucket === 'Necesidades',
    );
    expect(necesidades).toEqual({
      bucket: 'Necesidades',
      porcentaje: 40,
      fraccion: expect.any(Number),
    });
    expect(necesidades).not.toHaveProperty('color');
    expect(necesidades).not.toHaveProperty('etiqueta');
  });

  it('distribucionGasto es [] cuando no hay gasto (evita división por cero)', () => {
    const vm = aResumenViewModel(
      dto({
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
      }),
    );
    expect(vm.distribucionGasto).toEqual([]);
  });

  // FIX 8: all 4 canonical buckets (including SinCategoria) present at '0' —
  // distribucionGasto stays [] and nothing crashes.
  it('con los 4 buckets canónicos en 0 (incluyendo SinCategoria), distribucionGasto es [] y no crashea (FIX 8)', () => {
    const vm = aResumenViewModel(
      dto({
        totalIngreso: '0',
        sinIngreso: true,
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
    expect(vm.distribucionGasto).toEqual([]);
  });

  // US-047 D-03, narrowed to a 2-kind union in issue #778 tramo5b PR1: the
  // legend, built from `distribucionGasto` (T2/WG5-01) +
  // `formatearMontoConSigno` (T3) + `dto.totalIngreso`.
  describe('leyendaPrincipal / leyendaComplemento (D-03)', () => {
    it('leyendaPrincipal es exactamente los tres items 50/30/20 en orden canónico, kind: "gasto", montoLabel con prefijo "-"', () => {
      const vm = aResumenViewModel(dto());
      expect(vm.leyendaPrincipal).toEqual([
        {
          kind: 'gasto',
          bucket: 'Necesidades',
          porcentaje: 40,
          montoLabel: '-$400.000',
        },
        {
          kind: 'gasto',
          bucket: 'Deseos',
          porcentaje: 25,
          montoLabel: '-$250.000',
        },
        {
          kind: 'gasto',
          bucket: 'Ahorro',
          porcentaje: 35,
          montoLabel: '-$350.000',
        },
      ]);
    });

    // Issue #778 tramo5b PR1: the `sinCategoria` row is RETIRED — the DTO
    // still carries `cantidadSinCategoria`/a SinCategoria bucket entry (the
    // API is unchanged in this PR), but leyendaComplemento never reads
    // either one anymore.
    it('leyendaComplemento es exactamente [ingreso(+)] — la fila sinCategoria fue retirada (issue #778)', () => {
      const vm = aResumenViewModel(dto());
      expect(vm.leyendaComplemento).toEqual([
        { kind: 'ingreso', montoLabel: '+$1.000.000' },
      ]);
    });

    it('cantidadSinCategoria no afecta leyendaComplemento sea cual sea su valor (issue #778)', () => {
      const conCero = aResumenViewModel(dto({ cantidadSinCategoria: 0 }));
      const conVarios = aResumenViewModel(dto({ cantidadSinCategoria: 7 }));
      expect(conCero.leyendaComplemento).toEqual([
        { kind: 'ingreso', montoLabel: '+$1.000.000' },
      ]);
      expect(conVarios.leyendaComplemento).toEqual(conCero.leyendaComplemento);
    });

    // Issue #778 tramo5b PR1 (replaces the retired WG5-13 "ya no renormaliza
    // — dilución" test, which asserted the now-reverted diluted 40/25/25
    // reading): leyendaPrincipal sources its percentages from
    // `distribucionGasto`, which no longer includes SinCategoria in its
    // denominator — the SAME nonzero-SinCategoria fixture that used to prove
    // dilution now proves the three spend percentages are UNDILUTED
    // (44/28/28 over the 900000 spend total, SinCategoria's 100000 excluded).
    it('leyendaPrincipal no se diluye por un SinCategoria con gasto — 44/28/28 sobre el denominador de 3 buckets (issue #778)', () => {
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
              total: '250000',
              porcentajeBp: 2500,
              estadoSemaforo: 'amarillo',
            },
            {
              bucket: 'SinCategoria',
              total: '100000',
              porcentajeBp: 1000,
              estadoSemaforo: null,
            },
          ],
        }),
      );
      expect(vm.leyendaPrincipal).toMatchObject([
        { kind: 'gasto', porcentaje: 44 },
        { kind: 'gasto', porcentaje: 28 },
        { kind: 'gasto', porcentaje: 28 },
      ]);
      expect(vm.distribucionGasto.map((t) => t.bucket)).toEqual([
        'Necesidades',
        'Deseos',
        'Ahorro',
      ]);
      // WG5-03: "the legend performs no independent percentage computation
      // of its own; it reuses the ring's own value" — proven directly by
      // comparing against the same buckets read off `distribucionGasto`.
      const porcentajesDelAnillo = vm.distribucionGasto.map(
        (t) => t.porcentaje,
      );
      const porcentajesDeLaLeyenda = vm.leyendaPrincipal.map((item) =>
        item.kind === 'gasto' ? item.porcentaje : null,
      );
      expect(porcentajesDeLaLeyenda).toEqual(porcentajesDelAnillo);
    });

    it('TajadaGasto (distribucionGasto) sigue sin montoLabel — el anillo se mantiene libre de dinero (I-2)', () => {
      const vm = aResumenViewModel(dto());
      const necesidades = vm.distribucionGasto.find(
        (t) => t.bucket === 'Necesidades',
      );
      expect(necesidades).not.toHaveProperty('montoLabel');
    });

    it('estadoGlobal y porcentajeLabel siguen pasando verbatim, sin recomputación (CA-06/WG5-11)', () => {
      const vm = aResumenViewModel(dto());
      expect(vm.estadoGlobal).toBe('amarillo');
      const necesidades = vm.buckets.find((b) => b.bucket === 'Necesidades');
      expect(necesidades?.porcentajeLabel).toBe('40%');
    });
  });
});
