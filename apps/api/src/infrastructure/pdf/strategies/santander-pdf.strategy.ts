import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { PdfPage } from '../pdfjs-text-extractor';
import { PdfBankStrategy } from './pdf-bank-strategy';
import { EstructuraBancoPdf } from './estructura-banco-pdf';

/**
 * Patrón Santander PDF:
 *   - "BANCO SANTANDER CHILE" + "CARTOLA" en cabecera.
 *   - Número de cuenta en formato chileno "X-XXX-XX-XXXXX-X".
 */
export class SantanderPdfStrategy implements PdfBankStrategy {
  matches(firstPage: PdfPage): boolean {
    // El logo "BANCO SANTANDER CHILE" aparece letra-por-letra con espacios — colapsamos.
    const collapsed = firstPage.plainText.replace(/\s+/g, '');
    return (
      /BANCOSANTANDERCHILE/i.test(collapsed) && /CARTOLA/i.test(firstPage.plainText)
    );
  }

  extract(firstPage: PdfPage): DetectedBank {
    const match = firstPage.plainText.match(/\b(\d-\d{3}-\d{2}-\d{4,5}-\d)\b/);
    return {
      banco: BancoConocido.Santander,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: match ? match[1] : '',
    };
  }

  getEstructura(): EstructuraBancoPdf {
    return {
      banco: BancoConocido.Santander,
      tokensCabeceraTabla: ['FECHA', 'SUCURSAL', 'DESCRIPCION', 'DCTO', 'SALDO'],
      // Las dos fechas DESDE/HASTA aparecen consecutivas en la cabecera de la cartola.
      patronPeriodo: /DESDE\s+HASTA[\s\S]{0,80}?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/,
      formatoPeriodo: 'DD/MM/YYYY',
      fechaFilaIncluyeAño: false,
      columnas: [
        { nombre: 'Fecha', xMin: 0, xMax: 65 },
        { nombre: 'Sucursal', xMin: 65, xMax: 100 },
        { nombre: 'Descripcion', xMin: 100, xMax: 320 },
        { nombre: 'NumeroDocto', xMin: 320, xMax: 370 },
        { nombre: 'Cargos', xMin: 370, xMax: 450 },
        { nombre: 'Abonos', xMin: 450, xMax: 540 },
        { nombre: 'Saldo', xMin: 540, xMax: 999 },
      ],
    };
  }
}
