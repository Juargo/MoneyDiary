/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUCKET_INGRESO,
  BUCKETS_ASIGNABLES,
  MATCH_TYPES,
} from './catalogo-constantes';

/**
 * catalogo-constantes.mirror.spec.ts — drift guard del vocabulario de wire
 * del catálogo (US-043, design.md §1/Q4b, CORRECTION). Reemplaza el
 * MECANISMO de `domain/categoria.mirror.spec.ts` (retirado en PR #6, §7) —
 * no su sujeto: tras §7 el web no guarda ninguna lista cerrada de
 * categorías, así que no hay nada que espejar ahí. Lo que SÍ puede driftar
 * es el vocabulario bucket/matchType que el web debe enviar en el wire, y
 * eso es lo que este guard pin-ea.
 *
 * Lee los cuatro archivos del backend como TEXTO PLANO — nunca los importa
 * (ADR-008 se sostiene porque esto es un test, no código de producción que
 * cruza la frontera web→api). Resuelve la ruta desde `import.meta.url` para
 * que funcione sin importar el cwd de vitest, y falla RUIDOSAMENTE con la
 * ruta completa si un archivo se mueve — un guard que calla en silencio
 * cuando no encuentra su sujeto es peor que ningún guard.
 *
 * Cuatro fuentes backend, las dos copias de cada constante (crear/actualizar
 * — hoy solo enlazadas por un comentario, `actualizar-categoria.use-case.ts:15`):
 */
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(THIS_DIR, '../../../..');

const BACKEND_SOURCES = {
  crearCategoria: resolve(
    REPO_ROOT,
    'apps/api/src/application/use-cases/crear-categoria.use-case.ts',
  ),
  actualizarCategoria: resolve(
    REPO_ROOT,
    'apps/api/src/application/use-cases/actualizar-categoria.use-case.ts',
  ),
  // 2026-08-31: `MATCH_TYPES` salió de `crear-patron.use-case.ts` a la
  // función pura `validar-patron.ts`, que ahora es la fuente única que
  // usan tanto `CrearPatronUseCase` como la creación anidada de
  // `CrearCategoriaUseCase` (change `crear-categoria-desde-preview`, D-01).
  validarPatron: resolve(
    REPO_ROOT,
    'apps/api/src/application/use-cases/validar-patron.ts',
  ),
  actualizarPatron: resolve(
    REPO_ROOT,
    'apps/api/src/application/use-cases/actualizar-patron.use-case.ts',
  ),
  // `BUCKET_INGRESO` no es un bucket asignable: vive en el enum de dominio,
  // no en los arrays `BUCKETS_ASIGNABLES` de los use cases de catálogo.
  bucketEnum: resolve(REPO_ROOT, 'apps/api/src/domain/value-objects/bucket.ts'),
} as const;

function readBackendSource(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(
      `Cannot read backend source of truth at "${path}". ` +
        'The file may have moved or been renamed — update BACKEND_SOURCES ' +
        'in catalogo-constantes.mirror.spec.ts.',
      { cause: error },
    );
  }
}

/**
 * Extrae los literales string de un bloque `const NOMBRE = [ … ]` del
 * código fuente. Tolera espacios; no exige un estilo de comillas específico
 * para que un cambio de estilo futuro no rompa este parser espuriamente.
 */
function bloque(fuente: string, nombre: string, path: string): string[] {
  const m = fuente.match(new RegExp(`const ${nombre}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) {
    throw new Error(
      `No se encontró "const ${nombre} = [ … ]" en "${path}". El archivo ` +
        'del backend cambió de formato — actualiza el parser en ' +
        'catalogo-constantes.mirror.spec.ts.',
    );
  }
  return [...m[1].matchAll(/['"]([A-Z_a-z]+)['"]/g)].map((x) => x[1]);
}

describe('catalogo-constantes drift guard', () => {
  const crearCategoriaSrc = readBackendSource(BACKEND_SOURCES.crearCategoria);
  const actualizarCategoriaSrc = readBackendSource(
    BACKEND_SOURCES.actualizarCategoria,
  );
  const validarPatronSrc = readBackendSource(BACKEND_SOURCES.validarPatron);
  const actualizarPatronSrc = readBackendSource(
    BACKEND_SOURCES.actualizarPatron,
  );

  const backendBucketsCrear = bloque(
    crearCategoriaSrc,
    'BUCKETS_ASIGNABLES',
    BACKEND_SOURCES.crearCategoria,
  );
  const backendBucketsActualizar = bloque(
    actualizarCategoriaSrc,
    'BUCKETS_ASIGNABLES',
    BACKEND_SOURCES.actualizarCategoria,
  );
  const backendMatchTypesCrear = bloque(
    validarPatronSrc,
    'MATCH_TYPES',
    BACKEND_SOURCES.validarPatron,
  );
  const backendMatchTypesActualizar = bloque(
    actualizarPatronSrc,
    'MATCH_TYPES',
    BACKEND_SOURCES.actualizarPatron,
  );

  it('web BUCKETS_ASIGNABLES equals crear-categoria.use-case.ts, in order', () => {
    expect([...BUCKETS_ASIGNABLES]).toEqual(backendBucketsCrear);
  });

  it('web BUCKETS_ASIGNABLES equals actualizar-categoria.use-case.ts, in order', () => {
    expect([...BUCKETS_ASIGNABLES]).toEqual(backendBucketsActualizar);
  });

  it('web MATCH_TYPES equals validar-patron.ts, in order', () => {
    expect([...MATCH_TYPES]).toEqual(backendMatchTypesCrear);
  });

  it('web MATCH_TYPES equals actualizar-patron.use-case.ts, in order', () => {
    expect([...MATCH_TYPES]).toEqual(backendMatchTypesActualizar);
  });

  it('the two backend BUCKETS_ASIGNABLES copies equal each other', () => {
    expect(backendBucketsCrear).toEqual(backendBucketsActualizar);
  });

  it('the two backend MATCH_TYPES copies equal each other', () => {
    expect(backendMatchTypesCrear).toEqual(backendMatchTypesActualizar);
  });

  // `BUCKET_INGRESO` es la ÚNICA palabra del wire que decide si el web
  // bloquea la clasificación de una fila (`esFilaIngreso`). Si el enum del
  // backend renombra ese miembro, la UI vuelve a ofrecer ediciones que el
  // commit descarta — en silencio, sin que ningún test de componente falle.
  it('web BUCKET_INGRESO equals the Bucket enum member in bucket.ts', () => {
    const bucketEnumSrc = readBackendSource(BACKEND_SOURCES.bucketEnum);
    const miembro = bucketEnumSrc.match(
      new RegExp(`\\b${BUCKET_INGRESO}\\s*=\\s*['"]([^'"]+)['"]`),
    );
    expect(
      miembro,
      `No se encontró el miembro "${BUCKET_INGRESO}" del enum Bucket en ` +
        `"${BACKEND_SOURCES.bucketEnum}".`,
    ).not.toBeNull();
    expect(miembro![1]).toBe(BUCKET_INGRESO);
  });
});
