import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfjsTransactionNormalizerService } from './pdfjs-transaction-normalizer.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';

const FIXTURES_DIR = join(__dirname, '../../..', 'test/fixtures/pdf');

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, name));
}

function expectAllValidTx(txs: ReadonlyArray<Transaccion>): void {
  for (const t of txs) {
    expect(t.fecha).toBeInstanceOf(Date);
    expect(t.descripcion.length).toBeGreaterThan(0);
    expect(t.cargo).toBeGreaterThanOrEqual(0);
    expect(t.abono).toBeGreaterThanOrEqual(0);
    expect(t.cargo + t.abono).toBeGreaterThan(0);
    expect(/^SALDO\s+(INICIAL|FINAL)/i.test(t.descripcion)).toBe(false);
    expect(/HTTPS?:\/\//i.test(t.descripcion)).toBe(false);
    expect(/BCI-\s*CARTOLA/i.test(t.descripcion)).toBe(false);
  }
}

describe('PdfjsTransactionNormalizerService', () => {
  const service = new PdfjsTransactionNormalizerService();

  it('BancoEstado: extrae 25 movimientos con totales cargos=23.940 / abonos=20.000', async () => {
    const buffer = loadFixture('bancoestado-cartola.pdf');

    const result = await service.normalize(buffer, BancoConocido.BancoEstado);

    expect(result.isOk()).toBe(true);
    const txs = result.getValue();
    expectAllValidTx(txs);
    expect(txs.length).toBe(25);
    const totalCargos = txs.reduce((s, t) => s + t.cargo, 0);
    const totalAbonos = txs.reduce((s, t) => s + t.abono, 0);
    expect(totalCargos).toBe(23_940);
    expect(totalAbonos).toBe(20_000);
    // Cubre rango DESDE: año 2025 (la primera fila es 05/Jun)
    expect(txs[0].fecha.getUTCFullYear()).toBe(2025);
    // Última fila: 02/Dic → debe ser 2025 también
    expect(txs[txs.length - 1].fecha.getUTCFullYear()).toBe(2025);
    expect(txs[txs.length - 1].fecha.getUTCMonth()).toBe(11); // Dic
  });

  it('BancoChile: filtra SALDO INICIAL/FINAL y totales coinciden con el footer del PDF', async () => {
    const buffer = loadFixture('bancochile-cartola.pdf');

    const result = await service.normalize(buffer, BancoConocido.BancoChile);

    expect(result.isOk()).toBe(true);
    const txs = result.getValue();
    expectAllValidTx(txs);
    // Totales declarados en el footer: OTROS CARGOS 3.144.994, OTROS ABONOS 1.280.004.
    const totalCargos = txs.reduce((s, t) => s + t.cargo, 0);
    const totalAbonos = txs.reduce((s, t) => s + t.abono, 0);
    expect(totalCargos).toBe(3_144_994);
    expect(totalAbonos).toBe(1_280_004);
    for (const t of txs) {
      expect(t.fecha.getUTCFullYear()).toBe(2026);
    }
  });

  it('Santander: tokens de descripción mergeados y comisiones no duplicadas', async () => {
    const buffer = loadFixture('santander-cartola.pdf');

    const result = await service.normalize(buffer, BancoConocido.Santander);

    expect(result.isOk()).toBe(true);
    const txs = result.getValue();
    expectAllValidTx(txs);
    // Al menos una transacción con "Transf" — verifica merge palabra-por-palabra.
    expect(txs.some((t) => /Transf/i.test(t.descripcion))).toBe(true);
    // Totales declarados en el footer: OTROS CARGOS 399.003, OTROS ABONOS 400.000.
    // Si fallara con 402.181, sería porque la sección "Resumen de Comisiones"
    // está duplicando la comisión de $3.178.
    const totalCargos = txs.reduce((s, t) => s + t.cargo, 0);
    const totalAbonos = txs.reduce((s, t) => s + t.abono, 0);
    expect(totalCargos).toBe(399_003);
    expect(totalAbonos).toBe(400_000);
  });

  it('BCI: filtra footer del navegador y mantiene movimientos de las 3 páginas', async () => {
    const buffer = loadFixture('bci-cartola.pdf');

    const result = await service.normalize(buffer, BancoConocido.BCI);

    expect(result.isOk()).toBe(true);
    const txs = result.getValue();
    expectAllValidTx(txs);
    expect(txs.length).toBeGreaterThan(20);
    // Todas las fechas dentro del periodo declarado: 14-04-2026 a 13-05-2026.
    const inicio = Date.UTC(2026, 3, 14);
    const fin = Date.UTC(2026, 4, 13);
    for (const t of txs) {
      expect(t.fecha.getTime()).toBeGreaterThanOrEqual(inicio);
      expect(t.fecha.getTime()).toBeLessThanOrEqual(fin);
    }
    // Al menos una descripción debería incluir multilínea (ej. "CARGO POR CAPTACION DEPOSITO A PLAZO")
    const tieneMultilinea = txs.some((t) =>
      /CAPTACION\s+DEPOSITO\s+A\s+PLAZO/i.test(t.descripcion),
    );
    expect(tieneMultilinea).toBe(true);
  });
});
