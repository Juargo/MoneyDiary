import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { PdfPage } from '../pdfjs-text-extractor';
import { PdfBankStrategy } from './pdf-bank-strategy';
import { EstructuraBancoPdf } from './estructura-banco-pdf';

/**
 * Patrón BancoEstado PDF:
 *   - Página 1 contiene "CARTOLA CUENTARUT N° <numero>"
 *   - El número de cuenta es el que sigue a "N°".
 */
export class BancoEstadoPdfStrategy implements PdfBankStrategy {
  matches(firstPage: PdfPage): boolean {
    return /CARTOLA\s+CUENTARUT\s+N[°o]/i.test(firstPage.plainText);
  }

  extract(firstPage: PdfPage): DetectedBank {
    const match = firstPage.plainText.match(/CARTOLA\s+CUENTARUT\s+N[°o]\s*(\d+)/i);
    return {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta: match ? match[1] : '',
    };
  }

  getEstructura(): EstructuraBancoPdf {
    return {
      banco: BancoConocido.BancoEstado,
      tokensCabeceraTabla: ['Fecha', 'Operación', 'Descripción', 'Abonos', 'Cargos', 'Saldo'],
      patronPeriodo: /Fecha\s+Inicio\s+(\d{2}\/\d{2}\/\d{4})\s+Fecha\s+Final\s+(\d{2}\/\d{2}\/\d{4})/,
      formatoPeriodo: 'DD/MM/YYYY',
      fechaFilaIncluyeAño: false,
      columnas: [
        { nombre: 'Fecha', xMin: 0, xMax: 100 },
        { nombre: 'NumeroOperacion', xMin: 100, xMax: 150 },
        { nombre: 'Descripcion', xMin: 150, xMax: 350 },
        { nombre: 'Abonos', xMin: 350, xMax: 432 },
        { nombre: 'Cargos', xMin: 432, xMax: 510 },
        { nombre: 'Saldo', xMin: 510, xMax: 999 },
      ],
    };
  }
}
