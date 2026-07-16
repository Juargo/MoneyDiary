import { normalizarTransaccionesPdf } from './pdf-normalization';
import { PagedToken } from './pdf-text-extractor';
import { EstructuraPdfBanco } from './strategies/estructura-pdf-banco';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';

function tok(str: string, x: number, y: number, page = 1): PagedToken {
  return { str, x, y, page };
}

/** Rangos calcados de SantanderPdfStrategy.getEstructura() (empíricamente pinneados en PR3). */
const rangosXSantander = [
  { col: 'fecha' as const, xMin: 25, xMax: 90 },
  { col: 'descripcion' as const, xMin: 95, xMax: 325 },
  { col: 'cargo' as const, xMin: 395, xMax: 450 },
  { col: 'abono' as const, xMin: 495, xMax: 520 },
];

function estructuraBase(
  overrides: Partial<EstructuraPdfBanco> = {},
): EstructuraPdfBanco {
  return {
    banco: BancoConocido.Santander,
    anclasEncabezado: [],
    anclasPeriodo: { desde: /x/, hasta: /x/ },
    rangosX: rangosXSantander,
    toleranciaY: 2,
    formatoFecha: 'DD/MM',
    fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
    filasIgnoradas: [/Resumen de Comisiones/],
    ...overrides,
  };
}

const periodoMarzo2026 = { desde: '2026-03-01', hasta: '2026-03-31' };

describe('normalizarTransaccionesPdf', () => {
  it('reconstruye una fila con fecha+sucursal fusionadas en un solo token (caso Santander) y descripción palabra-por-palabra', () => {
    const tokens = [
      tok('07/03 Providencia', 30, 100),
      tok('Compra', 100, 100),
      tok('Supermercado', 140, 100),
      tok('Generico', 190, 100),
      tok('45.990', 400, 100),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase(),
      periodoMarzo2026,
    );

    expect(resultado).toEqual([
      {
        fecha: new Date(Date.UTC(2026, 2, 7)),
        descripcion: 'Compra Supermercado Generico',
        cargo: 45990,
        abono: 0,
      },
    ]);
  });

  it('asigna abono cuando el monto cae en la columna abono, cargo queda en 0', () => {
    const tokens = [
      tok('05/03 Providencia', 30, 100),
      tok('Abono', 100, 100),
      tok('Sueldo', 140, 100),
      tok('850.000', 500, 100),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase(),
      periodoMarzo2026,
    );

    expect(resultado).toEqual([
      {
        fecha: new Date(Date.UTC(2026, 2, 5)),
        descripcion: 'Abono Sueldo',
        cargo: 0,
        abono: 850000,
      },
    ]);
  });

  it('descarta filas sin fecha interpretable (encabezados de tabla, etiquetas)', () => {
    const tokens = [
      tok('FECHA', 30, 200),
      tok('DESCRIPCION', 100, 200),
      tok('05/03 Providencia', 30, 100),
      tok('Abono', 100, 100),
      tok('850.000', 500, 100),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase(),
      periodoMarzo2026,
    );

    expect(resultado).toHaveLength(1);
  });

  it('excluye filas que matchean filasIgnoradas aunque traigan una fecha con formato válido', () => {
    const tokens = [
      tok('01/03 OPER.', 30, 200),
      tok('Resumen', 100, 200),
      tok('de', 140, 200),
      tok('Comisiones', 160, 200),
      tok('05/03 Providencia', 30, 100),
      tok('Abono', 100, 100),
      tok('850.000', 500, 100),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase(),
      periodoMarzo2026,
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].descripcion).toBe('Abono');
  });

  it('deduplica una fila EXACTAMENTE repetida (caso real Santander: la sección Resumen de Comisiones repite la última fila del detalle)', () => {
    const tokens = [
      tok('25/03 OPER.', 30, 100),
      tok('Suscripcion', 100, 100),
      tok('Servicio', 140, 100),
      tok('Streaming', 190, 100),
      tok('9.990', 400, 100),
      // Repetida más abajo (misma fecha/descripción/monto) — simula la fila
      // que reaparece tras "Resumen de Comisiones" en el fixture real.
      tok('25/03 OPER.', 30, 50),
      tok('Suscripcion', 100, 50),
      tok('Servicio', 140, 50),
      tok('Streaming', 190, 50),
      tok('9.990', 400, 50),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase(),
      periodoMarzo2026,
    );

    expect(resultado).toHaveLength(1);
  });

  it('NO deduplica dos filas con fecha distinta aunque el resto coincida', () => {
    const tokens = [
      tok('05/03 OPER.', 30, 100),
      tok('Pago', 100, 100),
      tok('9.990', 400, 100),
      tok('06/03 OPER.', 30, 50),
      tok('Pago', 100, 50),
      tok('9.990', 400, 50),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase(),
      periodoMarzo2026,
    );

    expect(resultado).toHaveLength(2);
  });

  it('infiere el año a partir del período cuando no hay cruce de mes', () => {
    const tokens = [
      tok('15/03 OPER.', 30, 100),
      tok('Pago', 100, 100),
      tok('1.000', 400, 100),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase(),
      periodoMarzo2026,
    );

    expect(resultado[0].fecha).toEqual(new Date(Date.UTC(2026, 2, 15)));
  });

  it('[year-crossing END-TO-END] cruce Nov→Dic→Ene→Feb incrementa el año inferido correctamente (sintético, Santander no cruza año en su fixture real)', () => {
    const tokens = [
      tok('10/11 OPER.', 30, 400),
      tok('Movimiento Noviembre', 100, 400),
      tok('1.000', 400, 400),

      tok('10/12 OPER.', 30, 300),
      tok('Movimiento Diciembre', 100, 300),
      tok('1.000', 400, 300),

      tok('10/01 OPER.', 30, 200),
      tok('Movimiento Enero', 100, 200),
      tok('1.000', 400, 200),

      tok('10/02 OPER.', 30, 100),
      tok('Movimiento Febrero', 100, 100),
      tok('1.000', 400, 100),
    ];

    const resultado = normalizarTransaccionesPdf(tokens, estructuraBase(), {
      desde: '2025-11-01',
      hasta: '2026-02-28',
    });

    expect(resultado.map((t) => t.fecha)).toEqual([
      new Date(Date.UTC(2025, 10, 10)),
      new Date(Date.UTC(2025, 11, 10)),
      new Date(Date.UTC(2026, 0, 10)),
      new Date(Date.UTC(2026, 1, 10)),
    ]);
  });

  it('fuenteAnio explícito (formato DD/MM/YYYY, caso BCI) usa el año de la propia fila, sin necesitar período', () => {
    const rangosXBci = [
      { col: 'fecha' as const, xMin: 0, xMax: 100 },
      { col: 'descripcion' as const, xMin: 100, xMax: 300 },
      { col: 'cargo' as const, xMin: 300, xMax: 400 },
      { col: 'abono' as const, xMin: 400, xMax: 500 },
    ];
    const tokens = [
      tok('01/04/2026', 30, 100),
      tok('Pago Credito', 150, 100),
      tok('50.000', 350, 100),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase({
        banco: BancoConocido.BCI,
        formatoFecha: 'DD/MM/YYYY',
        fuenteAnio: { kind: 'explicito' },
        rangosX: rangosXBci,
        filasIgnoradas: [],
      }),
      undefined,
    );

    expect(resultado).toEqual([
      {
        fecha: new Date(Date.UTC(2026, 3, 1)),
        descripcion: 'Pago Credito',
        cargo: 50000,
        abono: 0,
      },
    ]);
  });

  it('formato de fecha aún no implementado (DD/Mmm, BancoEstado — PR4b) descarta la fila sin lanzar', () => {
    const tokens = [
      tok('02/Abr', 30, 100),
      tok('Compra', 100, 100),
      tok('5.000', 400, 100),
    ];

    const resultado = normalizarTransaccionesPdf(
      tokens,
      estructuraBase({ formatoFecha: 'DD/Mmm' }),
      periodoMarzo2026,
    );

    expect(resultado).toEqual([]);
  });

  it('sin período y formato que requiere inferencia → usa el año actual como fallback defensivo (nunca lanza)', () => {
    const tokens = [
      tok('15/03 OPER.', 30, 100),
      tok('Pago', 100, 100),
      tok('1.000', 400, 100),
    ];

    expect(() =>
      normalizarTransaccionesPdf(tokens, estructuraBase(), undefined),
    ).not.toThrow();
  });
});
