import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfTextExtractor } from './pdf-text-extractor';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

describe('PdfTextExtractor', () => {
  it('extrae tokens de texto (str/x/y/page) desde un PDF real (bancoestado)', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'bancoestado-cartola-test.pdf'),
    );
    const extractor = new PdfTextExtractor();

    const result = await extractor.extract(
      buffer,
      'bancoestado-cartola-test.pdf',
    );

    expect(result.isOk()).toBe(true);
    const tokens = result.getValue();
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens.slice(0, 5)) {
      expect(typeof token.str).toBe('string');
      expect(typeof token.x).toBe('number');
      expect(typeof token.y).toBe('number');
      expect(typeof token.page).toBe('number');
    }
    // 2 páginas concatenadas (ver reference targets del spec PDF-03).
    expect(tokens.some((t) => t.page === 2)).toBe(true);
  });

  it('retorna Fail(PdfInvalidoError) para un buffer corrupto/no-PDF, sin colgar el proceso', async () => {
    const buffer = Buffer.from('esto no es un pdf, son bytes cualquiera 12345');
    const extractor = new PdfTextExtractor();

    const result = await extractor.extract(buffer, 'corrupto.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfInvalidoError);
  });

  it('retorna Fail(PdfSinTextoError) para un PDF válido sin texto extraíble', async () => {
    const buffer = await readFile(join(fixturesDir, 'sin-texto-test.pdf'));
    const extractor = new PdfTextExtractor();

    const result = await extractor.extract(buffer, 'sin-texto-test.pdf');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PdfSinTextoError);
  });
});
