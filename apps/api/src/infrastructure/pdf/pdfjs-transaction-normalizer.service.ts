import { Result } from '../../shared/result';
import { ITransactionNormalizer } from '../../application/ports/transaction-normalizer.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import {
  NormalizacionInvalidaError,
  ProblemaNormalizacion,
} from '../../domain/errors/normalizacion-invalida.error';
import { extractPdfPages, PdfPage, PdfRow, joinCellsInRange } from './pdfjs-text-extractor';
import { BancoEstadoPdfStrategy } from './strategies/banco-estado-pdf.strategy';
import { BancoChilePdfStrategy } from './strategies/banco-chile-pdf.strategy';
import { SantanderPdfStrategy } from './strategies/santander-pdf.strategy';
import { BciPdfStrategy } from './strategies/bci-pdf.strategy';
import { PdfBankStrategy } from './strategies/pdf-bank-strategy';
import { EstructuraBancoPdf } from './strategies/estructura-banco-pdf';
import { RangoColumna } from '../../application/ports/pdf-structure-validator.port';

/**
 * Normaliza movimientos de cartolas PDF al esquema canónico {fecha,descripcion,cargo,abono}.
 *
 * Cubre los CA de US-010:
 *   - Inferencia de año cuando la fila no lo trae (BancoEstado/Chile/Santander).
 *   - Merge de tokens de descripción por X-range (caso Santander tokenizado).
 *   - Continuaciones multilínea sin fecha (caso BCI).
 *   - Filtro de filas SALDO INICIAL/FINAL, subtotales, footer de impresión.
 *
 * Ver ADR-009.
 */
export class PdfjsTransactionNormalizerService implements ITransactionNormalizer {
  private readonly strategiesByBanco: Map<BancoConocido, PdfBankStrategy>;

  constructor() {
    const strategies: PdfBankStrategy[] = [
      new BancoEstadoPdfStrategy(),
      new BancoChilePdfStrategy(),
      new SantanderPdfStrategy(),
      new BciPdfStrategy(),
    ];
    this.strategiesByBanco = new Map(
      strategies.map((s) => [s.getEstructura().banco, s]),
    );
  }

  async normalize(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>> {
    const strategy = this.strategiesByBanco.get(banco);
    if (!strategy) {
      return Result.fail(
        new NormalizacionInvalidaError(banco, [{ tipo: 'FilaSinMontos', fila: 0 }]),
      );
    }

    const estructura = strategy.getEstructura();
    let pages: PdfPage[];
    try {
      pages = await extractPdfPages(buffer, '');
    } catch {
      return Result.fail(
        new NormalizacionInvalidaError(banco, [{ tipo: 'FilaSinMontos', fila: 0 }]),
      );
    }

    const fullText = pages.map((p) => p.plainText).join(' ');
    const periodMatch = fullText.match(estructura.patronPeriodo);
    const añoBaseDesde = periodMatch
      ? parseInt(periodMatch[1].slice(-4), 10)
      : new Date().getUTCFullYear();
    const añoHasta = periodMatch ? parseInt(periodMatch[2].slice(-4), 10) : añoBaseDesde;

    const transacciones: Transaccion[] = [];
    const problemas: ProblemaNormalizacion[] = [];
    let filaIdx = 0;
    let añoActual = añoBaseDesde;
    let mesPrevio: number | null = null;

    // Buffer de continuaciones sin fecha. Se aplican cuando llega la siguiente
    // fila datada: si esa fila tiene descripción vacía, las usa como propia; si
    // ya tiene descripción, se append-ean a la última transacción procesada.
    let pendingDesc: string[] = [];

    for (const page of pages) {
      // Algunas cartolas (Santander) repiten los movimientos en una sección
      // "Resumen de Comisiones" al final de la página. Detenemos el procesamiento
      // de la página al encontrar ese marcador para evitar duplicar registros.
      let detenerPagina = false;

      for (const row of page.rows) {
        if (detenerPagina) break;
        filaIdx++;
        const fechaTxt = extraerFechaRaw(row, estructura, banco);

        if (!fechaTxt) {
          const continuacion = joinCellsInRange(
            row,
            ...rangoXdeColumna(estructura, 'Descripcion'),
          );
          if (esSeccionDuplicada(continuacion, banco)) {
            detenerPagina = true;
            continue;
          }
          if (continuacion && !esRuido(continuacion, banco)) {
            pendingDesc.push(continuacion);
          }
          continue;
        }

        let descripcion = construirDescripcion(row, estructura.columnas, banco);

        // Aplicar continuaciones pendientes (texto que apareció ANTES de esta fila datada).
        if (pendingDesc.length > 0) {
          if (descripcion === '') {
            // La fila datada no trae su propia descripción → las continuaciones son su descripción.
            descripcion = pendingDesc.join(' ');
          } else if (transacciones.length > 0) {
            // La fila datada tiene su propia descripción → las continuaciones colgaban de la fila previa.
            const ultima = transacciones[transacciones.length - 1];
            transacciones[transacciones.length - 1] = {
              ...ultima,
              descripcion: `${ultima.descripcion} ${pendingDesc.join(' ')}`.trim(),
            };
          }
          pendingDesc = [];
        }

        if (esRuido(descripcion, banco)) continue;

        const cargoTxt = joinCellsInRange(row, ...rangoXdeColumna(estructura, 'Cargos'));
        const abonoTxt = joinCellsInRange(row, ...rangoXdeColumna(estructura, 'Abonos'));

        // Año: si la fila trae año (BCI), úsalo. Si no, deriva con inferencia.
        let fecha: Date | null;
        if (estructura.fechaFilaIncluyeAño) {
          fecha = parseFechaConAño(fechaTxt);
        } else {
          const mesActual = parseMesDelTexto(fechaTxt, banco);
          if (mesActual === null) {
            problemas.push({ tipo: 'FechaIninterpretable', fila: filaIdx, valor: fechaTxt });
            continue;
          }
          if (mesPrevio !== null && mesActual < mesPrevio && añoHasta > añoBaseDesde) {
            añoActual = añoHasta;
          }
          mesPrevio = mesActual;
          fecha = parseFechaInferida(fechaTxt, añoActual, banco);
        }

        if (!fecha) {
          problemas.push({ tipo: 'FechaIninterpretable', fila: filaIdx, valor: fechaTxt });
          continue;
        }

        const cargo = parseMonto(cargoTxt);
        const abono = parseMonto(abonoTxt);
        if (cargo === null || abono === null) {
          problemas.push({
            tipo: 'MontoIninterpretable',
            fila: filaIdx,
            columna: cargo === null ? 'Cargos' : 'Abonos',
            valor: cargo === null ? cargoTxt : abonoTxt,
          });
          continue;
        }
        if (cargo === 0 && abono === 0) {
          // Fila datada sin montos — típicamente SALDO INICIAL/FINAL ya filtrados.
          // Si llega acá es porque pasó esRuido. Lo descartamos silenciosamente.
          continue;
        }

        transacciones.push({ fecha, descripcion, cargo, abono });
      }

      // Fin de página: flushear cualquier continuación pendiente a la última transacción.
      if (pendingDesc.length > 0 && transacciones.length > 0) {
        const ultima = transacciones[transacciones.length - 1];
        transacciones[transacciones.length - 1] = {
          ...ultima,
          descripcion: `${ultima.descripcion} ${pendingDesc.join(' ')}`.trim(),
        };
        pendingDesc = [];
      }
    }

    if (problemas.length > 0) {
      return Result.fail(new NormalizacionInvalidaError(banco, problemas));
    }
    return Result.ok(transacciones);
  }
}

function rangoXdeColumna(
  estructura: EstructuraBancoPdf,
  nombre: string,
): [number, number] {
  const col = estructura.columnas.find((c) => c.nombre === nombre);
  return col ? [col.xMin, col.xMax] : [0, 0];
}

/**
 * Extrae el texto crudo de fecha de la fila. Casos especiales:
 *   - Santander mergea "DD/MM Agustinas" en un solo item en columna Fecha.
 *   - BancoEstado usa "DD/Mmm" (Mmm = abreviatura mes en español).
 */
function extraerFechaRaw(
  row: PdfRow,
  estructura: EstructuraBancoPdf,
  banco: BancoConocido,
): string | null {
  const colFecha = estructura.columnas.find((c) => c.nombre === 'Fecha');
  if (!colFecha) return null;
  const raw = joinCellsInRange(row, colFecha.xMin, colFecha.xMax);
  if (!raw) return null;

  if (banco === BancoConocido.BancoEstado) {
    const m = raw.match(/^(\d{2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})/);
    return m ? `${m[1]}/${m[2]}` : null;
  }
  if (estructura.fechaFilaIncluyeAño) {
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
  }
  // BancoChile / Santander: DD/MM (Santander suele tener texto extra como "DD/MM Agustinas")
  const m = raw.match(/^(\d{2})\/(\d{2})\b/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function construirDescripcion(
  row: PdfRow,
  columnas: ReadonlyArray<RangoColumna>,
  banco: BancoConocido,
): string {
  const col = columnas.find((c) => c.nombre === 'Descripcion');
  if (!col) return '';
  let texto = joinCellsInRange(row, col.xMin, col.xMax);

  // En Santander, el "Sucursal" puede aparecer en la misma celda que fecha (ej. "16/02 Agustinas").
  // Para BancoChile y Santander, también incluimos la columna Sucursal en la descripción
  // cuando no exista una más clara — pero en este modelo Sucursal va aparte.
  // Limpieza: colapsar espacios múltiples.
  texto = texto.replace(/\s+/g, ' ').trim();

  // Para BancoEstado, los $ se incluyen en cargos/abonos por separado — no afecta descripción.
  if (banco === BancoConocido.BancoEstado || banco === BancoConocido.Santander) {
    // sin ajustes adicionales
  }
  return texto;
}

/**
 * Detecta el marcador de inicio de una sección que repite movimientos previos.
 *   Santander → "Resumen de Comisiones"
 * Devolver true hace que el normalizador detenga el procesamiento de la página.
 */
function esSeccionDuplicada(descripcion: string, banco: BancoConocido): boolean {
  const u = descripcion.toUpperCase().trim();
  if (banco === BancoConocido.Santander && /^RESUMEN\s+DE\s+COMISIONES/.test(u)) {
    return true;
  }
  return false;
}

function esRuido(descripcion: string, banco: BancoConocido): boolean {
  const u = descripcion.toUpperCase();
  if (!u) return false;
  // Genéricos
  if (/^SALDO\s+(INICIAL|FINAL)\b/.test(u)) return true;
  if (/^SUBTOTALES?\b/.test(u)) return true;

  // BCI footer del navegador: "BCI- CARTOLA DE CUENTA CORRIENTE"
  if (banco === BancoConocido.BCI && /BCI-\s*CARTOLA/.test(u)) return true;
  // BCI: la URL aparece al final de la página impresa
  if (banco === BancoConocido.BCI && /HTTPS?:\/\//.test(u)) return true;

  // Santander: bloque de comisiones (asteriscos y texto fijo)
  if (banco === BancoConocido.Santander) {
    if (/^RESUMEN\s+DE\s+COMISIONES/.test(u)) return true;
    if (/^\*+$/.test(u.trim())) return true;
  }
  return false;
}

function parseMonto(raw: string): number | null {
  const limpio = raw.replace(/\$/g, '').replace(/\s/g, '').trim();
  if (limpio === '') return 0;
  if (!/^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/.test(limpio)) {
    return null;
  }
  const sinSigno = limpio.replace(/^-/, '');
  const sinSeparadores = sinSigno.replace(/[.,]/g, '');
  const n = parseInt(sinSeparadores, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFechaConAño(raw: string): Date | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return buildDate(parseInt(yyyy, 10), parseInt(mm, 10), parseInt(dd, 10));
}

function parseMesDelTexto(raw: string, banco: BancoConocido): number | null {
  if (banco === BancoConocido.BancoEstado) {
    const m = raw.match(/^\d{2}\/([A-Za-zÁÉÍÓÚáéíóú]{3})/);
    if (!m) return null;
    return MES_ABREV[m[1].toLowerCase()] ?? null;
  }
  const m = raw.match(/^\d{2}\/(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

function parseFechaInferida(
  raw: string,
  año: number,
  banco: BancoConocido,
): Date | null {
  if (banco === BancoConocido.BancoEstado) {
    const m = raw.match(/^(\d{2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})/);
    if (!m) return null;
    const mes = MES_ABREV[m[2].toLowerCase()];
    if (!mes) return null;
    return buildDate(año, mes, parseInt(m[1], 10));
  }
  const m = raw.match(/^(\d{2})\/(\d{2})/);
  if (!m) return null;
  return buildDate(año, parseInt(m[2], 10), parseInt(m[1], 10));
}

function buildDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

const MES_ABREV: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};
