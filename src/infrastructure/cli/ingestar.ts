/**
 * CLI — punto de entrada para ingesta de archivos bancarios desde terminal.
 *
 * Uso:
 *   pnpm cli -- ./cartola.xlsx
 *   pnpm cli -- /ruta/absoluta/movimientos.xlsx
 *
 * Encadena dos use cases:
 *   1. IngestFileUseCase  — valida extensión (.xlsx únicamente) y carga el buffer
 *   2. DetectBankUseCase  — identifica banco, tipo y número de cuenta
 */

import 'reflect-metadata';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../../application/use-cases/detect-bank.use-case';
import { ExcelBankDetectorService } from '../excel/excel-bank-detector.service';
import { FsFileReaderAdapter } from './fs-file-reader.adapter';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  // Filtramos "--" porque pnpm lo incluye como separador en process.argv
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const filePath = args[0];

  if (!filePath) {
    console.error('\n❌  Falta la ruta del archivo.');
    console.error('   Uso: pnpm cli -- <ruta-del-archivo.xlsx>\n');
    process.exit(1);
  }

  // Adapter: transforma una ruta del filesystem en IFileReader
  let fileReader: FsFileReaderAdapter;
  try {
    fileReader = new FsFileReaderAdapter(filePath);
  } catch (error) {
    console.error(`\n❌  ${(error as Error).message}\n`);
    process.exit(1);
  }

  // Use case 1: validar extensión y cargar buffer
  const ingestUseCase = new IngestFileUseCase();
  const ingestResult = ingestUseCase.execute(fileReader);

  if (ingestResult.isFail()) {
    console.error(`\n❌  ${ingestResult.getError().message}\n`);
    process.exit(1);
  }

  const fileData = ingestResult.getValue();

  // Use case 2: detectar banco (async — ExcelJS es Promise-based)
  const bankDetector = new ExcelBankDetectorService();
  const detectUseCase = new DetectBankUseCase(bankDetector);
  const detectResult = await detectUseCase.execute(fileData.buffer, fileData.originalName);

  if (detectResult.isFail()) {
    console.error(`\n❌  ${detectResult.getError().message}\n`);
    process.exit(1);
  }

  const bankData = detectResult.getValue();

  console.log('\n✅  Archivo procesado correctamente');
  console.log('─────────────────────────────────────');
  console.log(`  Nombre       : ${fileData.originalName}`);
  console.log(`  Extensión    : ${fileData.extension}`);
  console.log(`  Tamaño       : ${formatBytes(fileData.sizeInBytes)}`);
  console.log('  ─────────────────────────────────');
  console.log(`  Banco        : ${bankData.banco}`);
  console.log(`  Tipo cuenta  : ${bankData.tipoCuenta}`);
  console.log(`  N° cuenta    : ${bankData.numeroCuenta || '(no disponible)'}`);
  console.log('─────────────────────────────────────\n');
}

main().catch((error: unknown) => {
  console.error('\n❌  Error inesperado:', (error as Error).message);
  process.exit(1);
});
