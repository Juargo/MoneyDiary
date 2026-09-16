import * as fs from 'node:fs';
import * as path from 'node:path';
import { ICONOS_CATEGORIA } from './catalogo-constantes';

/**
 * catalogo-constantes.mirror.spec.ts — drift guard for the curated lucide
 * icon allowlist (categoria-iconografia, ADR-045, CATICO-07). Mirrors
 * `apps/web/src/api/catalogo-constantes.mirror.spec.ts`'s ICONOS_CATEGORIA
 * check, adapted to this repo's mobile `fs`/`path`/`__dirname` precedent
 * (`distribucion-gasto.spec.ts`) instead of `import.meta.url` (Jest, not
 * Vitest — `import.meta` is not available here).
 *
 * Reads the backend source as TEXT — never imports from `apps/api`
 * (ADR-008/024 hold for production code; this is a test, not a
 * cross-workspace runtime import).
 */
const RUTA_BACKEND = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'api',
  'src',
  'domain',
  'value-objects',
  'icono-categoria.ts',
);

function leerIconosCategoriaBackend(): string[] {
  let fuente: string;
  try {
    fuente = fs.readFileSync(RUTA_BACKEND, 'utf-8');
  } catch (error) {
    throw new Error(
      `No se pudo leer la fuente de verdad del backend en "${RUTA_BACKEND}". ` +
        'El archivo puede haberse movido o renombrado — actualiza RUTA_BACKEND ' +
        'en catalogo-constantes.mirror.spec.ts.',
      { cause: error },
    );
  }
  const match = fuente.match(/const ICONOS_CATEGORIA\s*=\s*\[([^\]]*)\]/);
  if (!match) {
    throw new Error(
      `No se encontró "const ICONOS_CATEGORIA = [ … ]" en "${RUTA_BACKEND}". ` +
        'El archivo del backend cambió de formato — actualiza el parser en ' +
        'catalogo-constantes.mirror.spec.ts.',
    );
  }
  return [...match[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map((x) => x[1]);
}

describe('catalogo-constantes drift guard (CATICO-07)', () => {
  it('mobile ICONOS_CATEGORIA equals apps/api icono-categoria.ts, in order', () => {
    const backendIconos = leerIconosCategoriaBackend();
    expect([...ICONOS_CATEGORIA]).toEqual(backendIconos);
  });
});
