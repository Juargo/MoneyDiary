import { Result } from '../../shared/result';
import {
  IPdfStructureValidator,
  ValidatedPdfStructure,
  PdfStructureValidationError,
} from '../../application/ports/pdf-structure-validator.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import {
  EstructuraPdfInvalidaError,
  ProblemaPdf,
} from '../../domain/errors/estructura-pdf-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { extractPdfPages } from './pdfjs-text-extractor';
import { BancoEstadoPdfStrategy } from './strategies/banco-estado-pdf.strategy';
import { BancoChilePdfStrategy } from './strategies/banco-chile-pdf.strategy';
import { SantanderPdfStrategy } from './strategies/santander-pdf.strategy';
import { BciPdfStrategy } from './strategies/bci-pdf.strategy';
import { EstructuraBancoPdf, FormatoPeriodo } from './strategies/estructura-banco-pdf';

/**
 * Implementación de IPdfStructureValidator para cartolas PDF.
 *
 * Valida en una sola pasada:
 *   1. Que todos los tokens de cabecera de tabla aparezcan en el plainText
 *      de las primeras páginas.
 *   2. Que el rango de fechas (DESDE/HASTA o equivalente) sea parseable.
 *
 * Ver US-009 y ADR-009.
 */
export class PdfjsStructureValidatorService implements IPdfStructureValidator {
  private readonly estructurasPorBanco: Map<BancoConocido, EstructuraBancoPdf>;

  constructor() {
    const strategies = [
      new BancoEstadoPdfStrategy(),
      new BancoChilePdfStrategy(),
      new SantanderPdfStrategy(),
      new BciPdfStrategy(),
    ];
    this.estructurasPorBanco = new Map(
      strategies.map((s) => {
        const e = s.getEstructura();
        return [e.banco, e];
      }),
    );
  }

  async validate(
    buffer: Buffer,
    banco: BancoConocido,
    originalName: string,
  ): Promise<Result<ValidatedPdfStructure, PdfStructureValidationError>> {
    const estructura = this.estructurasPorBanco.get(banco);
    if (!estructura) {
      return Result.fail(
        new EstructuraPdfInvalidaError(banco, [
          { tipo: 'TokenCabeceraFaltante', tokenEsperado: '(sin estructura definida)' },
        ]),
      );
    }

    let pages;
    try {
      pages = await extractPdfPages(buffer, originalName);
    } catch (error) {
      if (error instanceof PdfInvalidoError) return Result.fail(error);
      throw error;
    }

    if (pages.length === 0 || pages[0].rows.length === 0) {
      return Result.fail(new PdfSinTextoError(originalName));
    }

    // plainText concatenado de todas las páginas (los tokens de cabecera
    // suelen estar en p1 pero algunas cartolas largas la repiten en p2+).
    const fullText = pages.map((p) => p.plainText).join(' ');

    const problemas: ProblemaPdf[] = [];

    // 1. Tokens de cabecera (US-009 CA-01 a CA-05).
    for (const token of estructura.tokensCabeceraTabla) {
      const re = new RegExp(escapeRegex(token), 'i');
      if (!re.test(fullText)) {
        problemas.push({ tipo: 'TokenCabeceraFaltante', tokenEsperado: token });
      }
    }

    // 2. Rango de fechas (US-009 CA-07).
    const matchPeriodo = fullText.match(estructura.patronPeriodo);
    let rangoFechas: { desde: string; hasta: string } | null = null;
    if (!matchPeriodo) {
      problemas.push({
        tipo: 'RangoFechasInvalido',
        detalle: `no se encontró el patrón de periodo esperado para ${banco}`,
      });
    } else {
      try {
        rangoFechas = {
          desde: parseFecha(matchPeriodo[1], estructura.formatoPeriodo),
          hasta: parseFecha(matchPeriodo[2], estructura.formatoPeriodo),
        };
      } catch (error) {
        problemas.push({
          tipo: 'RangoFechasInvalido',
          detalle: (error as Error).message,
        });
      }
    }

    if (problemas.length > 0 || !rangoFechas) {
      return Result.fail(new EstructuraPdfInvalidaError(banco, problemas));
    }

    return Result.ok({
      banco,
      rangoFechas,
      fechaFilaIncluyeAño: estructura.fechaFilaIncluyeAño,
      columnas: estructura.columnas,
    });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFecha(raw: string, formato: FormatoPeriodo): string {
  if (formato === 'DD/MM/YYYY') {
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) throw new Error(`fecha inválida "${raw}" para formato DD/MM/YYYY`);
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  // DD-MM-YYYY
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) throw new Error(`fecha inválida "${raw}" para formato DD-MM-YYYY`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}
