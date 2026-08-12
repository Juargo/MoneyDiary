/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIA_BUCKET as WEB_CATEGORIA_BUCKET,
  ORDEN_CATEGORIAS,
} from './categoria';

/**
 * Hardening test (sdd-verify SUGGESTION, US-013 S6b): guards against silent
 * drift between the web `CATEGORIA_BUCKET` mirror (this workspace) and the
 * backend source of truth for the seed/template catalog.
 *
 * ADR-037 (us-038) retires the closed `Categoria` TypeScript enum: category
 * identity becomes a userId-scoped row, not a compile-time type — the
 * enum + `CATEGORIA_BUCKET` total map this guard used to read from
 * `apps/api/src/domain/value-objects/categoria.ts` no longer exist. The one
 * compile-time consistency proof ADR-037 explicitly KEEPS (design.md D-02)
 * is `CATEGORIA_TEMPLATE` in
 * `apps/api/src/infrastructure/persistence/catalogo-template.ts` — the
 * literal `as const` list of the 8 seed/template categories with their
 * bucket. This guard now reads THAT file instead: same purpose (catch web
 * drift from the backend's 8 template categories), new source of truth.
 * Web's hardcoded 8-name reclassify `<select>` (`apps/web/src/domain/categoria.ts`)
 * itself is untouched — it going stale for a USER-CREATED category name is
 * accepted debt closed by US-043 (design.md §10); this guard only pins the
 * 8 template names, which is the one set that still has a canonical source.
 *
 * ADR-008 forbids web PRODUCTION code from importing backend domain code —
 * but this is a TEST, and it reads the backend file as plain TEXT (never
 * imports/executes it), so ADR-008 is not violated. If this file's format
 * changes drastically the regex below may need updating too — that is
 * acceptable, it's the guard doing its job (a deliberate signal to re-check
 * both sides), not a false negative.
 */

// Resolve the backend file relative to THIS file's location, walking up to
// the repo root, so the path works regardless of the vitest CWD.
// apps/web/src/domain/categoria.mirror.spec.ts -> repo root is 4 levels up.
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(THIS_DIR, '../../../..');
const BACKEND_CATEGORIA_PATH = resolve(
  REPO_ROOT,
  'apps/api/src/infrastructure/persistence/catalogo-template.ts',
);

function readBackendSource(): string {
  try {
    return readFileSync(BACKEND_CATEGORIA_PATH, 'utf-8');
  } catch (error) {
    throw new Error(
      `Cannot read backend source of truth at "${BACKEND_CATEGORIA_PATH}". ` +
        'The file may have moved or been renamed — update BACKEND_CATEGORIA_PATH ' +
        'in categoria.mirror.spec.ts.',
      { cause: error },
    );
  }
}

/**
 * Extracts the `CATEGORIA_TEMPLATE` entries' `nombre` values from the
 * backend source, e.g. `{ nombre: 'Supermercado', bucket: Bucket.Necesidades }`.
 * Tolerates whitespace; intentionally does NOT require a specific quote
 * style so a future style change does not spuriously fail this parse.
 */
function parseCategoriaEnumKeys(source: string): string[] {
  const enumBlockMatch = source.match(
    /export const CATEGORIA_TEMPLATE\s*=\s*\[([^\]]*)\]/,
  );
  if (!enumBlockMatch) {
    throw new Error(
      'Could not find "export const CATEGORIA_TEMPLATE = [ ... ]" block in the backend source. ' +
        'The backend file format may have changed — update the parser in categoria.mirror.spec.ts.',
    );
  }

  const body = enumBlockMatch[1];
  const keyPattern = /nombre:\s*['"](\w+)['"]/g;
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(body)) !== null) {
    keys.push(match[1]);
  }

  if (keys.length === 0) {
    throw new Error(
      'Parsed zero CATEGORIA_TEMPLATE nombre entries from the backend source — the regex ' +
        'parser likely needs updating for a new file format (categoria.mirror.spec.ts).',
    );
  }

  return keys;
}

/**
 * Extracts `CATEGORIA_TEMPLATE` (nombre, bucket) pairs from the backend
 * source, e.g. `{ nombre: 'Supermercado', bucket: Bucket.Necesidades }`.
 * Tolerates whitespace.
 */
function parseBackendCategoriaBucket(source: string): Record<string, string> {
  const mapBlockMatch = source.match(
    /export const CATEGORIA_TEMPLATE\s*=\s*\[([^\]]*)\]/,
  );
  if (!mapBlockMatch) {
    throw new Error(
      'Could not find "export const CATEGORIA_TEMPLATE = [ ... ]" block in the backend source. ' +
        'The backend file format may have changed — update the parser in categoria.mirror.spec.ts.',
    );
  }

  const body = mapBlockMatch[1];
  const entryPattern = /nombre:\s*['"](\w+)['"]\s*,\s*bucket:\s*Bucket\.(\w+)/g;
  const entries: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(body)) !== null) {
    const [, categoria, bucket] = match;
    entries[categoria] = bucket;
  }

  if (Object.keys(entries).length === 0) {
    throw new Error(
      'Parsed zero CATEGORIA_TEMPLATE (nombre, bucket) entries from the backend source — the ' +
        'regex parser likely needs updating for a new file format (categoria.mirror.spec.ts).',
    );
  }

  return entries;
}

describe('CATEGORIA_BUCKET web/backend drift guard', () => {
  const backendSource = readBackendSource();
  const backendCategoriaKeys = parseCategoriaEnumKeys(backendSource);
  const backendCategoriaBucket = parseBackendCategoriaBucket(backendSource);

  it('backend Categoria enum keys exactly match the web ORDEN_CATEGORIAS set', () => {
    const backendSet = new Set(backendCategoriaKeys);
    const webSet = new Set(ORDEN_CATEGORIAS);

    const missingInWeb = backendCategoriaKeys.filter((k) => !webSet.has(k));
    const extraInWeb = ORDEN_CATEGORIAS.filter((k) => !backendSet.has(k));

    expect(
      missingInWeb,
      `Categoria keys present in backend but missing in web ORDEN_CATEGORIAS: ${JSON.stringify(missingInWeb)}`,
    ).toEqual([]);
    expect(
      extraInWeb,
      `Categoria keys present in web ORDEN_CATEGORIAS but missing in backend: ${JSON.stringify(extraInWeb)}`,
    ).toEqual([]);
  });

  it('backend CATEGORIA_BUCKET keys exactly match the web CATEGORIA_BUCKET keys', () => {
    const backendKeys = Object.keys(backendCategoriaBucket);
    const webKeys = Object.keys(WEB_CATEGORIA_BUCKET);

    const missingInWeb = backendKeys.filter((k) => !webKeys.includes(k));
    const extraInWeb = webKeys.filter((k) => !backendKeys.includes(k));

    expect(
      missingInWeb,
      `Categoria present in backend CATEGORIA_BUCKET but missing in web: ${JSON.stringify(missingInWeb)}`,
    ).toEqual([]);
    expect(
      extraInWeb,
      `Categoria present in web CATEGORIA_BUCKET but missing in backend: ${JSON.stringify(extraInWeb)}`,
    ).toEqual([]);
  });

  it('every categoría maps to the SAME bucket on both backend and web', () => {
    const mismatches: string[] = [];

    for (const categoria of Object.keys(backendCategoriaBucket)) {
      const backendBucket = backendCategoriaBucket[categoria];
      const webBucket = WEB_CATEGORIA_BUCKET[categoria];
      if (backendBucket !== webBucket) {
        mismatches.push(
          `${categoria}: backend="${backendBucket}" web="${webBucket}"`,
        );
      }
    }

    expect(
      mismatches,
      `Bucket mismatches found:\n${mismatches.join('\n')}`,
    ).toEqual([]);
  });
});
