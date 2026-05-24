import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

/**
 * Patrón BancoEstado (CuentaRUT):
 *   - A1 contiene "CuentaRUT"
 *   - Número de cuenta embebido: "Últimos Movimientos CuentaRUT N° 00017046102"
 */
export class BancoEstadoStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const a1 = String(ws.getCell('A1').value ?? '');
    return a1.includes('CuentaRUT');
  }

  extract(ws: ExcelJS.Worksheet): DetectedBank {
    const a1 = String(ws.getCell('A1').value ?? '');
    const match = a1.match(/N[°o]\s*(\d+)/i);
    const numeroCuenta = match ? match[1] : '';
    return {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta,
    };
  }
}
