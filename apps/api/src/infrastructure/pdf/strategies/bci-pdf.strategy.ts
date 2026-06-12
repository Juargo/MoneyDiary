import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { PdfPage } from '../pdfjs-text-extractor';
import { PdfBankStrategy } from './pdf-bank-strategy';
import { EstructuraBancoPdf } from './estructura-banco-pdf';

/**
 * Patrón BCI PDF:
 *   - "CARTOLA DE CUENTA CORRIENTE" + "BCI" en cabecera.
 *   - Número de cuenta después de "N° CUENTA".
 */
export class BciPdfStrategy implements PdfBankStrategy {
  matches(firstPage: PdfPage): boolean {
    const t = firstPage.plainText;
    return /CARTOLA\s+DE\s+CUENTA\s+CORRIENTE/i.test(t) && /\bBCI\b/i.test(t);
  }

  extract(firstPage: PdfPage): DetectedBank {
    const match = firstPage.plainText.match(/N[°o]\s*CUENTA\s+(\d{6,})/i);
    return {
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: match ? match[1] : '',
    };
  }

  getEstructura(): EstructuraBancoPdf {
    return {
      banco: BancoConocido.BCI,
      tokensCabeceraTabla: ['FECHA', 'SUCURSAL', 'DESCRIPCION', 'DOCUMENTO', 'SALDO'],
      patronPeriodo: /PERIODO\s+(\d{2}-\d{2}-\d{4})\s+al\s+(\d{2}-\d{2}-\d{4})/i,
      formatoPeriodo: 'DD-MM-YYYY',
      fechaFilaIncluyeAño: true,
      columnas: [
        { nombre: 'Fecha', xMin: 0, xMax: 95 },
        { nombre: 'Sucursal', xMin: 95, xMax: 145 },
        { nombre: 'Descripcion', xMin: 145, xMax: 290 },
        { nombre: 'NumeroDocumento', xMin: 290, xMax: 360 },
        { nombre: 'Cargos', xMin: 360, xMax: 430 },
        { nombre: 'Abonos', xMin: 430, xMax: 510 },
        { nombre: 'Saldo', xMin: 510, xMax: 999 },
      ],
    };
  }
}
