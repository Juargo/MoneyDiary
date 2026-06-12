/**
 * Extrae texto posicionado de un PDF usando pdfjs-dist (build legacy).
 * Compartido por bank-detector, structure-validator y transaction-normalizer.
 *
 * Ver ADR-009 para la justificación de pdfjs-dist y las mitigaciones de seguridad.
 */
import { createRequire } from 'node:module';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';

/** Un item de texto individual extraído del PDF, con su posición. */
export interface PdfCell {
  /** Coordenada X en el sistema del PDF (origen abajo-izquierda). */
  readonly x: number;
  readonly text: string;
}

/** Conjunto de items que comparten Y aproximada — una "fila" visual del PDF. */
export interface PdfRow {
  readonly y: number;
  /** Cells ordenadas por X ascendente. */
  readonly cells: readonly PdfCell[];
}

export interface PdfPage {
  readonly pageNumber: number;
  readonly rows: readonly PdfRow[];
  /** Texto plano concatenado de toda la página — útil para pattern matching. */
  readonly plainText: string;
}

/** Tolerancia (en unidades PDF) para considerar dos items en la misma fila. */
const ROW_Y_TOLERANCE = 2;

interface PdfjsTextItem {
  str: string;
  transform: number[]; // [a,b,c,d,e,f] — e=x, f=y
}

interface PdfjsModule {
  getDocument: (opts: {
    data: Uint8Array;
    isEvalSupported: boolean;
    disableFontFace: boolean;
    useSystemFonts: boolean;
  }) => { promise: Promise<PdfjsDocument> };
}

let cachedPdfjs: PdfjsModule | null = null;

function loadPdfjs(): PdfjsModule {
  if (cachedPdfjs) return cachedPdfjs;
  // Build legacy: compatible con Node sin worker (ADR-009).
  // Usamos createRequire para que funcione en CJS (jest/ts-jest) y ESM (Node 22) sin --experimental-vm-modules.
  const requireFn = createRequire(__filename);
  cachedPdfjs = requireFn('pdfjs-dist/legacy/build/pdf.mjs') as PdfjsModule;
  return cachedPdfjs;
}

interface PdfjsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
  cleanup(): Promise<void>;
}

interface PdfjsPage {
  getTextContent(): Promise<{ items: PdfjsTextItem[] }>;
}

/**
 * Carga el PDF y extrae todas sus páginas con filas agrupadas por Y.
 *
 * Lanza PdfInvalidoError si el PDF está corrupto, vacío o cifrado.
 * NO lanza si el PDF es válido pero no tiene texto — eso lo decide el caller.
 */
export async function extractPdfPages(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<PdfPage[]> {
  const pdfjs = loadPdfjs();

  let doc: PdfjsDocument;
  try {
    const data = new Uint8Array(buffer);
    doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false, // mitigación CVE-2024-4367 — ADR-009
      disableFontFace: true,
      useSystemFonts: true,
    }).promise;
  } catch (error) {
    throw new PdfInvalidoError(nombreArchivo, (error as Error).message);
  }

  const pages: PdfPage[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    pages.push(buildPage(pageNum, content.items));
  }

  await doc.cleanup();
  return pages;
}

function buildPage(pageNumber: number, items: PdfjsTextItem[]): PdfPage {
  const buckets = new Map<number, PdfCell[]>();

  for (const item of items) {
    const text = item.str;
    if (!text || !text.trim()) continue;

    const y = Math.round(item.transform[5]);
    let bucketKey: number | undefined;
    for (const existingY of buckets.keys()) {
      if (Math.abs(existingY - y) <= ROW_Y_TOLERANCE) {
        bucketKey = existingY;
        break;
      }
    }
    if (bucketKey === undefined) {
      bucketKey = y;
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push({
      x: Math.round(item.transform[4]),
      text,
    });
  }

  const rows: PdfRow[] = [...buckets.entries()]
    // Y decrece de arriba hacia abajo en coords PDF → ordenamos descendente
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => ({
      y,
      cells: [...cells].sort((a, b) => a.x - b.x),
    }));

  // plainText en orden visual (top-to-bottom, left-to-right) — los patrones de
  // detección dependen de leer adyacencias como aparecen en la página, no en
  // el orden del stream PDF.
  const plainText = rows
    .map((row) => row.cells.map((c) => c.text).join(' '))
    .join(' ');

  return { pageNumber, rows, plainText };
}

/**
 * Fusiona tokens consecutivos de una fila que caen dentro del mismo rango X.
 * Útil para el caso Santander que tokeniza la descripción palabra-por-palabra.
 *
 * Retorna el texto fusionado o `''` si no hay tokens en el rango.
 */
export function joinCellsInRange(
  row: PdfRow,
  minX: number,
  maxXExclusive: number,
): string {
  const parts: string[] = [];
  for (const cell of row.cells) {
    if (cell.x >= minX && cell.x < maxXExclusive) {
      parts.push(cell.text.trim());
    }
  }
  return parts.filter((p) => p.length > 0).join(' ');
}
