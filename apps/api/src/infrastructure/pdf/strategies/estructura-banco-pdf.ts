import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { RangoColumna } from '../../../application/ports/pdf-structure-validator.port';

/**
 * Formato del rango de fechas que trae la cabecera del PDF.
 *   DD/MM/YYYY → BancoEstado, BancoChile, Santander
 *   DD-MM-YYYY → BCI
 */
export type FormatoPeriodo = 'DD/MM/YYYY' | 'DD-MM-YYYY';

/**
 * Metadata estructural por banco: qué tokens deben aparecer en la cabecera de
 * la tabla, cómo extraer el rango de fechas, y rangos X de columnas para que
 * el normalizador (US-010) sepa dónde extraer cada celda de cada movimiento.
 */
export interface EstructuraBancoPdf {
  readonly banco: BancoConocido;

  /** Textos que DEBEN aparecer en `plainText` de la página 1 (case-insensitive). */
  readonly tokensCabeceraTabla: readonly string[];

  /**
   * Regex con dos grupos de captura: `[1]=desde`, `[2]=hasta`.
   * Aplicado sobre `plainText` de la página 1.
   */
  readonly patronPeriodo: RegExp;
  readonly formatoPeriodo: FormatoPeriodo;

  /** True para bancos cuyas filas de movimiento traen año (BCI). */
  readonly fechaFilaIncluyeAño: boolean;

  /** Columnas y sus rangos X. Usado por US-010. */
  readonly columnas: ReadonlyArray<RangoColumna>;
}
