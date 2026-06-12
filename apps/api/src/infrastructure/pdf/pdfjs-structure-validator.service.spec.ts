import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfjsStructureValidatorService } from './pdfjs-structure-validator.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';

const FIXTURES_DIR = join(__dirname, '../../..', 'test/fixtures/pdf');

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, name));
}

describe('PdfjsStructureValidatorService', () => {
  const service = new PdfjsStructureValidatorService();

  it('valida estructura de BancoEstado con periodo 2025-06-05 a 2025-12-02', async () => {
    const buffer = loadFixture('bancoestado-cartola.pdf');

    const result = await service.validate(
      buffer,
      BancoConocido.BancoEstado,
      'bancoestado-cartola.pdf',
    );

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.banco).toBe(BancoConocido.BancoEstado);
    expect(data.rangoFechas.desde).toBe('2025-06-05');
    expect(data.rangoFechas.hasta).toBe('2025-12-02');
    expect(data.fechaFilaIncluyeAño).toBe(false);
    expect(data.columnas.length).toBeGreaterThan(0);
  });

  it('valida estructura de Banco de Chile con periodo 2026-02-27 a 2026-03-31', async () => {
    const buffer = loadFixture('bancochile-cartola.pdf');

    const result = await service.validate(
      buffer,
      BancoConocido.BancoChile,
      'bancochile-cartola.pdf',
    );

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.rangoFechas.desde).toBe('2026-02-27');
    expect(data.rangoFechas.hasta).toBe('2026-03-31');
    expect(data.fechaFilaIncluyeAño).toBe(false);
  });

  it('valida estructura de Santander con periodo 2026-01-30 a 2026-02-27', async () => {
    const buffer = loadFixture('santander-cartola.pdf');

    const result = await service.validate(
      buffer,
      BancoConocido.Santander,
      'santander-cartola.pdf',
    );

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.rangoFechas.desde).toBe('2026-01-30');
    expect(data.rangoFechas.hasta).toBe('2026-02-27');
    expect(data.fechaFilaIncluyeAño).toBe(false);
  });

  it('valida estructura de BCI con periodo 2026-04-14 a 2026-05-13', async () => {
    const buffer = loadFixture('bci-cartola.pdf');

    const result = await service.validate(buffer, BancoConocido.BCI, 'bci-cartola.pdf');

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.rangoFechas.desde).toBe('2026-04-14');
    expect(data.rangoFechas.hasta).toBe('2026-05-13');
    expect(data.fechaFilaIncluyeAño).toBe(true);
  });

  it('retorna PdfInvalidoError para buffer corrupto', async () => {
    const buffer = Buffer.from('this is not a pdf');

    const result = await service.validate(
      buffer,
      BancoConocido.BancoEstado,
      'fake.pdf',
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfInvalidoError);
  });

  it('retorna EstructuraPdfInvalidaError si se valida con el banco equivocado', async () => {
    // El PDF es de BCI pero se intenta validar como Santander.
    const buffer = loadFixture('bci-cartola.pdf');

    const result = await service.validate(
      buffer,
      BancoConocido.Santander,
      'bci-cartola.pdf',
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
  });
});
