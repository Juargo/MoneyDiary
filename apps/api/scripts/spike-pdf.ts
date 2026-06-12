/**
 * Spike: validar que pdfjs-dist permite reconstruir filas/columnas de cartolas.
 * Para cada PDF de fixtures imprime las primeras N filas reconstruidas por Y.
 *
 * Ejecutar: pnpm api exec ts-node scripts/spike-pdf.ts
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// pdfjs v6 expone build legacy compatible con Node sin worker.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');

interface TextItem {
  str: string;
  transform: number[]; // [a,b,c,d,e,f]  e=x, f=y
  width: number;
  height: number;
}

const FIXTURES = [
  ['BancoEstado', 'bancoestado-cartola.pdf'],
  ['BancoChile', 'bancochile-cartola.pdf'],
  ['Santander', 'santander-cartola.pdf'],
  ['BCI', 'bci-cartola.pdf'],
] as const;

const ROW_Y_TOLERANCE = 2; // píxeles para considerar items en la misma fila

async function extractRows(path: string, maxRows: number) {
  const data = new Uint8Array(await readFile(path));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;
  const page1 = await doc.getPage(1);
  const content = await page1.getTextContent();
  const items = content.items as TextItem[];

  // Agrupar por Y (fila)
  const rowsByY = new Map<number, TextItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    // buscar fila existente dentro de tolerancia
    let key: number | undefined;
    for (const existingY of rowsByY.keys()) {
      if (Math.abs(existingY - y) <= ROW_Y_TOLERANCE) {
        key = existingY;
        break;
      }
    }
    if (key === undefined) {
      key = y;
      rowsByY.set(key, []);
    }
    rowsByY.get(key)!.push(it);
  }

  // Ordenar filas por Y descendente (top-down en coords PDF)
  const rows = [...rowsByY.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, maxRows)
    .map(([y, its]) => {
      const sorted = its.sort((a, b) => a.transform[4] - b.transform[4]);
      return {
        y,
        cols: sorted.map((it) => ({
          x: Math.round(it.transform[4]),
          str: it.str,
        })),
      };
    });

  await doc.cleanup();
  return { totalItems: items.length, totalRows: rowsByY.size, rows };
}

async function main() {
  const fixturesDir = join(__dirname, '..', 'test', 'fixtures', 'pdf');
  for (const [bank, file] of FIXTURES) {
    console.log(`\n===== ${bank} (${file}) =====`);
    try {
      const { totalItems, totalRows, rows } = await extractRows(
        join(fixturesDir, file),
        25,
      );
      console.log(`items=${totalItems}  rows=${totalRows}  (mostrando primeras 25)`);
      for (const r of rows) {
        const line = r.cols
          .map((c) => `[x=${c.x}]${c.str}`)
          .join(' | ');
        console.log(`y=${r.y}  ${line}`);
      }
    } catch (err) {
      console.error(`ERROR en ${bank}:`, err);
    }
  }
}

void main();
