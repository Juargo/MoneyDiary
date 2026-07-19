/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CATEGORIA_BUCKET as WEB_CATEGORIA_BUCKET, ORDEN_CATEGORIAS } from './categoria'

/**
 * Hardening test (sdd-verify SUGGESTION, US-013 S6b): guards against silent
 * drift between the web `CATEGORIA_BUCKET` mirror (this workspace) and the
 * backend source of truth `apps/api/src/domain/value-objects/categoria.ts`.
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
const THIS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(THIS_DIR, '../../../..')
const BACKEND_CATEGORIA_PATH = resolve(
  REPO_ROOT,
  'apps/api/src/domain/value-objects/categoria.ts',
)

function readBackendSource(): string {
  try {
    return readFileSync(BACKEND_CATEGORIA_PATH, 'utf-8')
  } catch (error) {
    throw new Error(
      `Cannot read backend source of truth at "${BACKEND_CATEGORIA_PATH}". ` +
        'The file may have moved or been renamed — update BACKEND_CATEGORIA_PATH ' +
        `in categoria.mirror.spec.ts. Original error: ${String(error)}`,
    )
  }
}

/**
 * Extracts the `Categoria` enum member names from the backend source, e.g.
 *   Supermercado = 'Supermercado',
 * Tolerates leading/trailing whitespace and an optional trailing comma;
 * intentionally does NOT require single quotes so a future style change
 * (double quotes) does not spuriously fail this parse.
 */
function parseCategoriaEnumKeys(source: string): string[] {
  const enumBlockMatch = source.match(/export enum Categoria\s*{([^}]*)}/)
  if (!enumBlockMatch) {
    throw new Error(
      'Could not find "export enum Categoria { ... }" block in the backend source. ' +
        'The backend file format may have changed — update the parser in categoria.mirror.spec.ts.',
    )
  }

  const body = enumBlockMatch[1]
  const keyPattern = /(\w+)\s*=\s*['"][^'"]*['"]\s*,?/g
  const keys: string[] = []
  let match: RegExpExecArray | null
  while ((match = keyPattern.exec(body)) !== null) {
    keys.push(match[1])
  }

  if (keys.length === 0) {
    throw new Error(
      'Parsed zero Categoria enum keys from the backend source — the regex parser ' +
        'likely needs updating for a new file format (categoria.mirror.spec.ts).',
    )
  }

  return keys
}

/**
 * Extracts `CATEGORIA_BUCKET` entries from the backend source, e.g.
 *   [Categoria.Supermercado]: Bucket.Necesidades,
 * Tolerates whitespace and an optional trailing comma.
 */
function parseBackendCategoriaBucket(source: string): Record<string, string> {
  const mapBlockMatch = source.match(
    /export const CATEGORIA_BUCKET[^{]*{([^}]*)}/,
  )
  if (!mapBlockMatch) {
    throw new Error(
      'Could not find "export const CATEGORIA_BUCKET = { ... }" block in the backend source. ' +
        'The backend file format may have changed — update the parser in categoria.mirror.spec.ts.',
    )
  }

  const body = mapBlockMatch[1]
  const entryPattern = /\[Categoria\.(\w+)\]\s*:\s*Bucket\.(\w+)\s*,?/g
  const entries: Record<string, string> = {}
  let match: RegExpExecArray | null
  while ((match = entryPattern.exec(body)) !== null) {
    const [, categoria, bucket] = match
    entries[categoria] = bucket
  }

  if (Object.keys(entries).length === 0) {
    throw new Error(
      'Parsed zero CATEGORIA_BUCKET entries from the backend source — the regex parser ' +
        'likely needs updating for a new file format (categoria.mirror.spec.ts).',
    )
  }

  return entries
}

describe('CATEGORIA_BUCKET web/backend drift guard', () => {
  const backendSource = readBackendSource()
  const backendCategoriaKeys = parseCategoriaEnumKeys(backendSource)
  const backendCategoriaBucket = parseBackendCategoriaBucket(backendSource)

  it('backend Categoria enum keys exactly match the web ORDEN_CATEGORIAS set', () => {
    const backendSet = new Set(backendCategoriaKeys)
    const webSet = new Set(ORDEN_CATEGORIAS)

    const missingInWeb = backendCategoriaKeys.filter((k) => !webSet.has(k))
    const extraInWeb = ORDEN_CATEGORIAS.filter((k) => !backendSet.has(k))

    expect(
      missingInWeb,
      `Categoria keys present in backend but missing in web ORDEN_CATEGORIAS: ${JSON.stringify(missingInWeb)}`,
    ).toEqual([])
    expect(
      extraInWeb,
      `Categoria keys present in web ORDEN_CATEGORIAS but missing in backend: ${JSON.stringify(extraInWeb)}`,
    ).toEqual([])
  })

  it('backend CATEGORIA_BUCKET keys exactly match the web CATEGORIA_BUCKET keys', () => {
    const backendKeys = Object.keys(backendCategoriaBucket)
    const webKeys = Object.keys(WEB_CATEGORIA_BUCKET)

    const missingInWeb = backendKeys.filter((k) => !webKeys.includes(k))
    const extraInWeb = webKeys.filter((k) => !backendKeys.includes(k))

    expect(
      missingInWeb,
      `Categoria present in backend CATEGORIA_BUCKET but missing in web: ${JSON.stringify(missingInWeb)}`,
    ).toEqual([])
    expect(
      extraInWeb,
      `Categoria present in web CATEGORIA_BUCKET but missing in backend: ${JSON.stringify(extraInWeb)}`,
    ).toEqual([])
  })

  it('every categoría maps to the SAME bucket on both backend and web', () => {
    const mismatches: string[] = []

    for (const categoria of Object.keys(backendCategoriaBucket)) {
      const backendBucket = backendCategoriaBucket[categoria]
      const webBucket = WEB_CATEGORIA_BUCKET[categoria]
      if (backendBucket !== webBucket) {
        mismatches.push(`${categoria}: backend="${backendBucket}" web="${webBucket}"`)
      }
    }

    expect(mismatches, `Bucket mismatches found:\n${mismatches.join('\n')}`).toEqual([])
  })
})
