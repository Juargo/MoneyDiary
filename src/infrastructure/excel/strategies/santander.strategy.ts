import ExcelJS from 'exceljs';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { DetectedBank } from '../../../application/ports/bank-detector.port';

/**
 * Patrón Santander:
 *   - A2 comienza con "Cuenta Corriente:" y contiene "0-000-"
 *   - Número de cuenta embebido: "Cuenta Corriente: 0-000-83-03862-4"
 */
export class SantanderStrategy {
  matches(ws: ExcelJS.Worksheet): boolean {
    const a2 = String(ws.getCell('A2').value ?? '').trim();
    return a2.startsWith('Cuenta Corriente:') && a2.includes('0-000-');
  }

  extract(ws: ExcelJS.Worksheet): DetectedBank {
    const a2 = String(ws.getCell('A2').value ?? '').trim();
    const match = a2.match(/Cuenta Corriente:\s*(.+)/i);
    const numeroCuenta = match ? match[1].trim() : '';
    return {
      banco: BancoConocido.Santander,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta,
    };
  }
}
