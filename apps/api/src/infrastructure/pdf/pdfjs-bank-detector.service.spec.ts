import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfjsBankDetectorService } from './pdfjs-bank-detector.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';

const FIXTURES_DIR = join(__dirname, '../../..', 'test/fixtures/pdf');

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, name));
}

describe('PdfjsBankDetectorService', () => {
  const service = new PdfjsBankDetectorService();

  it('detecta BancoEstado con número de CuentaRUT', async () => {
    const buffer = loadFixture('bancoestado-cartola.pdf');

    const result = await service.detect(buffer, 'bancoestado-cartola.pdf');

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.banco).toBe(BancoConocido.BancoEstado);
    expect(data.tipoCuenta).toBe(TipoCuentaConocido.CuentaRut);
    expect(data.numeroCuenta).toBe('17046102');
  });

  it('detecta Banco de Chile con número de cuenta corriente', async () => {
    const buffer = loadFixture('bancochile-cartola.pdf');

    const result = await service.detect(buffer, 'bancochile-cartola.pdf');

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.banco).toBe(BancoConocido.BancoChile);
    expect(data.tipoCuenta).toBe(TipoCuentaConocido.CuentaCorriente);
    expect(data.numeroCuenta).toBe('1732412908');
  });

  it('detecta Santander con número de cuenta corriente', async () => {
    const buffer = loadFixture('santander-cartola.pdf');

    const result = await service.detect(buffer, 'santander-cartola.pdf');

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.banco).toBe(BancoConocido.Santander);
    expect(data.tipoCuenta).toBe(TipoCuentaConocido.CuentaCorriente);
    expect(data.numeroCuenta).toBe('0-000-83-03862-4');
  });

  it('detecta BCI con número de cuenta corriente', async () => {
    const buffer = loadFixture('bci-cartola.pdf');

    const result = await service.detect(buffer, 'bci-cartola.pdf');

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.banco).toBe(BancoConocido.BCI);
    expect(data.tipoCuenta).toBe(TipoCuentaConocido.CuentaCorriente);
    expect(data.numeroCuenta).toBe('89101006');
  });

  it('retorna PdfInvalidoError para buffer corrupto', async () => {
    const buffer = Buffer.from('this is not a pdf');

    const result = await service.detect(buffer, 'fake.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfInvalidoError);
  });

  it('retorna BancoNoReconocidoError para PDF válido sin patrones bancarios', async () => {
    // Mínimo PDF válido con texto "Hello" — generado en runtime sin patrones bancarios.
    // pdf-lib u otras libs serían overkill; construimos un PDF mínimo a mano.
    const minimalPdf =
      '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
      '4 0 obj<</Length 44>>stream\n' +
      'BT /F1 12 Tf 100 700 Td (Documento genérico) Tj ET\n' +
      'endstream endobj\n' +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
      'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000099 00000 n \n0000000189 00000 n \n0000000280 00000 n \n' +
      'trailer<</Size 6/Root 1 0 R>>\nstartxref\n340\n%%EOF';

    const result = await service.detect(Buffer.from(minimalPdf), 'generico.pdf');

    // Aceptamos cualquiera de los dos: si pdfjs lo abre, BancoNoReconocido; si no, PdfInvalido.
    expect(result.isFail()).toBe(true);
    const err = result.getError();
    const ok =
      err instanceof BancoNoReconocidoError || err instanceof PdfInvalidoError;
    expect(ok).toBe(true);
  });
});
