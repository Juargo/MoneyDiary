import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

/**
 * Patrón BCI:
 *   - A1 = "Últimos Movimientos" (sin "CuentaRUT")
 *   - A8 = "Fecha Transacción" (encabezado de tabla)
 */
export class BciStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const a1 = String(ws.getCell('A1').value ?? '').trim();
    const a8 = String(ws.getCell('A8').value ?? '').trim();
    return a1 === 'Últimos Movimientos' && a8 === 'Fecha Transacción';
  }

  extract(_ws: ExcelJS.Worksheet): DetectedBank {
    return {
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '',
    };
  }
}
