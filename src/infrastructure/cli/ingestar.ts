/**
 * CLI — punto de entrada para ingesta de archivos bancarios desde terminal.
 *
 * Uso:
 *   pnpm cli -- ./cartola.xlsx
 *   pnpm cli -- /ruta/absoluta/movimientos.xls
 *
 * Este script demuestra que IngestFileUseCase es independiente de HTTP:
 * el mismo use case funciona desde CLI sin cambiar una línea de lógica.
 */

import 'reflect-metadata';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { FsFileReaderAdapter } from './fs-file-reader.adapter';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main(): void {
  // Filtramos "--" porque pnpm lo incluye como separador en process.argv
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const filePath = args[0];

  if (!filePath) {
    console.error('\n❌  Falta la ruta del archivo.');
    console.error('   Uso: pnpm cli -- <ruta-del-archivo>\n');
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

  // Use case: lógica de aplicación — no sabe nada de CLI ni de HTTP
  const useCase = new IngestFileUseCase();
  const result = useCase.execute(fileReader);

  if (result.isFail()) {
    console.error(`\n❌  ${result.getError().message}\n`);
    process.exit(1);
  }

  const data = result.getValue();

  console.log('\n✅  Archivo recibido correctamente');
  console.log('─────────────────────────────────────');
  console.log(`  Nombre     : ${data.originalName}`);
  console.log(`  Extensión  : ${data.extension}`);
  console.log(`  Tamaño     : ${formatBytes(data.sizeInBytes)}`);
  console.log(`  Buffer     : ${data.buffer.length} bytes en memoria`);
  console.log('─────────────────────────────────────\n');
}

main();
