import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

/**
 * Patrón Banco de Chile:
 *   - B8 = "Sr(a):"
 *   - B9 = "Rut:"
 *   - B10 = "Cuenta:"
 *   - Número de cuenta en C10, formato "00-173-XXXXX-XX"
 */
export class BancoChileStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const b8 = String(ws.getCell('B8').value ?? '').trim();
    const b9 = String(ws.getCell('B9').value ?? '').trim();
    const b10 = String(ws.getCell('B10').value ?? '').trim();
    return b8 === 'Sr(a):' && b9 === 'Rut:' && b10 === 'Cuenta:';
  }

  extract(ws: ExcelJS.Worksheet): DetectedBank {
    const numeroCuenta = String(ws.getCell('C10').value ?? '').trim();
    return {
      banco: BancoConocido.BancoChile,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta,
    };
  }
}
