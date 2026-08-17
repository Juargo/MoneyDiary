import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * zona-bar-sources.test.ts — R2 source-scanning guard (US-049, design §1.7,
 * WSEM-03). `ZonaBar` and `BucketSemaforoCard` render bands/segments that
 * come pre-computed from `semaforo-detalle-view-model.ts` — neither
 * component may hardcode a classification basis-point literal (5000/6000
 * Necesidades, 3000/4000 Deseos, 2000/1000 Ahorro). Unlike a code-review
 * checklist item this actually fails the build if a literal creeps back in.
 * Same discipline as `catalogo-constantes.mirror.spec.ts`: read the source
 * as plain text (never import it as a module under test), resolve paths
 * from `import.meta.url` so it works regardless of vitest's cwd.
 */
const THIS_DIR = dirname(fileURLToPath(import.meta.url));

const SOURCES = {
  zonaBar: resolve(THIS_DIR, 'ZonaBar.tsx'),
  bucketSemaforoCard: resolve(THIS_DIR, 'BucketSemaforoCard.tsx'),
} as const;

function readSource(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(
      `Cannot read source at "${path}". The file may have moved or been ` +
        'renamed — update SOURCES in zona-bar-sources.test.ts.',
      { cause: error },
    );
  }
}

// Classification bp literals owned exclusively by
// `semaforo-detalle-view-model.ts` (WSEM-03) — none of these may appear as
// a bare numeric token in either component's source.
const CLASIFICACION_BP_LITERALS = [5000, 6000, 3000, 4000, 2000, 1000];

describe.each(Object.entries(SOURCES))(
  'classification bp literals absent from %s',
  (name, path) => {
    const source = readSource(path);

    it.each(CLASIFICACION_BP_LITERALS)(
      `does not contain the bare numeric token %i (${name})`,
      (literal) => {
        const boundaryRegex = new RegExp(`\\b${literal}\\b`);
        expect(source).not.toMatch(boundaryRegex);
      },
    );
  },
);
