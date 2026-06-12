import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';

/** Rango X (en unidades del PDF) que ocupa una columna en la tabla. */
export interface RangoColumna {
  readonly nombre: string;
  readonly xMin: number;
  /** Exclusivo. */
  readonly xMax: number;
}

/**
 * Resultado de validar la estructura de una cartola PDF.
 * Lo consume US-010 (normalización) para saber dónde extraer cada movimiento.
 */
export interface ValidatedPdfStructure {
  readonly banco: BancoConocido;
  readonly rangoFechas: {
    /** YYYY-MM-DD */
    readonly desde: string;
    /** YYYY-MM-DD */
    readonly hasta: string;
  };
  /** Si las filas ya traen año (BCI), no hay que inferirlo desde el rango. */
  readonly fechaFilaIncluyeAño: boolean;
  readonly columnas: ReadonlyArray<RangoColumna>;
}

/** Errores posibles al validar la estructura de un PDF. */
export type PdfStructureValidationError =
  | EstructuraPdfInvalidaError
  | PdfInvalidoError
  | PdfSinTextoError;

/**
 * Port — valida que un PDF tenga la estructura tabular esperada para el banco.
 * La implementación concreta vive en infrastructure/pdf/. Ver US-009 y ADR-009.
 */
export interface IPdfStructureValidator {
  validate(
    buffer: Buffer,
    banco: BancoConocido,
    originalName: string,
  ): Promise<Result<ValidatedPdfStructure, PdfStructureValidationError>>;
}
