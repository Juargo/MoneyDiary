import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { PdfPage } from '../pdfjs-text-extractor';
import { PdfBankStrategy } from './pdf-bank-strategy';
import { EstructuraBancoPdf } from './estructura-banco-pdf';

/**
 * Patrón Banco de Chile PDF:
 *   - "Estado de Cuenta" + "CUENTA CORRIENTE" en cabecera.
 *   - Número de cuenta después de "N° DE CUENTA :".
 */
export class BancoChilePdfStrategy implements PdfBankStrategy {
  matches(firstPage: PdfPage): boolean {
    const t = firstPage.plainText;
    return /Estado de Cuenta/i.test(t) && /CUENTA CORRIENTE/i.test(t);
  }

  extract(firstPage: PdfPage): DetectedBank {
    const match = firstPage.plainText.match(
      /N[°o]\s*DE\s*CUENTA\s*:?\s*(\d{8,})/i,
    );
    return {
      banco: BancoConocido.BancoChile,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: match ? match[1] : '',
    };
  }

  getEstructura(): EstructuraBancoPdf {
    return {
      banco: BancoConocido.BancoChile,
      tokensCabeceraTabla: ['FECHA', 'DETALLE', 'SUCURSAL', 'DOCTO', 'SALDO'],
      patronPeriodo: /DESDE\s*:?\s*(\d{2}\/\d{2}\/\d{4})\s+HASTA\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i,
      formatoPeriodo: 'DD/MM/YYYY',
      fechaFilaIncluyeAño: false,
      columnas: [
        { nombre: 'Fecha', xMin: 0, xMax: 50 },
        { nombre: 'Descripcion', xMin: 50, xMax: 240 },
        { nombre: 'Sucursal', xMin: 240, xMax: 300 },
        { nombre: 'NumeroDocto', xMin: 300, xMax: 354 },
        { nombre: 'Cargos', xMin: 354, xMax: 433 },
        { nombre: 'Abonos', xMin: 433, xMax: 539 },
        { nombre: 'Saldo', xMin: 539, xMax: 999 },
      ],
    };
  }
}
