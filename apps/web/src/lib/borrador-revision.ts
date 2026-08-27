import type { PreviewIngestaDtoConCanonicos } from '@/api/types';

/**
 * borrador-revision — sessionStorage persistence for an in-progress cartola
 * review (P1 fix: "upload review has no interruption resilience"). Without
 * this, a reload, app-switch kill, or OS tab reclaim silently discards a
 * potentially 100+-row classification pass — the review state
 * (`archivo`/preview response/`edits`) lives only in `SubirCartola`'s React
 * state today.
 *
 * CRITICAL API AUDIT (decides the restore design): `useCommitIngesta` calls
 * `postCommitIngesta(file, edits)` — the commit endpoint RE-SENDS THE FILE,
 * there is no server-side preview/ingesta id it commits against. A `File`
 * object cannot be persisted to `sessionStorage` (structured-clone/JSON
 * boundary, and even `sessionStorage` itself only stores strings) — so this
 * module can only ever restore the preview DATA and the `edits` overlay, never
 * the file bytes. `SubirCartola` builds a "recovered draft" notice around that
 * constraint: it asks the user to re-pick the SAME file (matched by
 * name+size+lastModified — a stable-enough identity without hashing content,
 * ADR-024 doesn't require exact byte verification here) before the review
 * becomes editable/committable again.
 *
 * ADR-024: this module persists/restores backend-provided display data
 * (`preview`) and the user's own selections (`edits`) VERBATIM — no
 * recomputation, no money math, not even a re-derivation of `resumen`.
 *
 * Every storage access is wrapped in try/catch — quota errors and privacy
 * modes (Safari private browsing throws on `setItem`) must NEVER break the
 * review flow. A storage failure just means there is no draft to restore;
 * silent no-op, no user-facing error.
 */

const CLAVE_STORAGE = 'md:borrador-revision:v1';
const VERSION_SCHEMA = 1;
const EDAD_MAXIMA_MS = 24 * 60 * 60 * 1000;

/** Stable-enough file identity for matching a re-picked file — no content hashing (YAGNI). */
export interface IdentidadArchivo {
  readonly nombre: string;
  readonly tamano: number;
  readonly ultimaModificacion: number;
}

export interface BorradorRevision {
  readonly version: number;
  readonly archivo: IdentidadArchivo;
  readonly preview: PreviewIngestaDtoConCanonicos;
  readonly edits: ReadonlyArray<readonly [number, string | null]>;
  readonly savedAt: number;
}

export function identidadDeArchivo(file: File): IdentidadArchivo {
  return {
    nombre: file.name,
    tamano: file.size,
    ultimaModificacion: file.lastModified,
  };
}

/** Whether a re-picked `file` is (by name+size+lastModified) the same file the draft was saved from. */
export function archivoCoincideConIdentidad(
  file: File,
  identidad: IdentidadArchivo,
): boolean {
  return (
    file.name === identidad.nombre &&
    file.size === identidad.tamano &&
    file.lastModified === identidad.ultimaModificacion
  );
}

/**
 * Persists the current review draft, overwriting any previous one
 * (write-through — no debounce needed at this scale, per spec). `ahora` is
 * caller-supplied (never `Date.now()` internally) so callers/tests control
 * the clock explicitly.
 */
export function guardarBorrador(params: {
  readonly archivo: File;
  readonly preview: PreviewIngestaDtoConCanonicos;
  readonly edits: ReadonlyMap<number, string | null>;
  readonly ahora: number;
}): void {
  try {
    const borrador: BorradorRevision = {
      version: VERSION_SCHEMA,
      archivo: identidadDeArchivo(params.archivo),
      preview: params.preview,
      edits: Array.from(params.edits.entries()),
      savedAt: params.ahora,
    };
    sessionStorage.setItem(CLAVE_STORAGE, JSON.stringify(borrador));
  } catch {
    // Quota exceeded or privacy-mode storage rejection: no draft is saved,
    // the review flow itself must keep working uninterrupted.
  }
}

/**
 * Loads the persisted draft, if any. Returns `null` when: nothing was saved,
 * the stored JSON is corrupted/doesn't match the expected shape, the schema
 * version doesn't match (a future shape change invalidates old drafts rather
 * than risk mis-parsing them), or the draft is older than 24h (`ahora`
 * caller-supplied) — a stale draft matched against a freshly re-uploaded bank
 * file would cause more confusion than it saves. A corrupted/stale/version-
 * mismatched entry is proactively removed from storage.
 */
export function cargarBorrador(ahora: number): BorradorRevision | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(CLAVE_STORAGE);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    borrarBorrador();
    return null;
  }

  if (!esBorradorRevision(parsed)) {
    borrarBorrador();
    return null;
  }

  if (ahora - parsed.savedAt > EDAD_MAXIMA_MS) {
    borrarBorrador();
    return null;
  }

  return parsed;
}

export function borrarBorrador(): void {
  try {
    sessionStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // Best-effort — nothing to reconcile if this fails.
  }
}

function esBorradorRevision(value: unknown): value is BorradorRevision {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (v.version !== VERSION_SCHEMA) return false;
  if (typeof v.savedAt !== 'number') return false;
  if (!esIdentidadArchivo(v.archivo)) return false;
  if (typeof v.preview !== 'object' || v.preview === null) return false;
  if (!Array.isArray(v.edits)) return false;

  return v.edits.every(
    (entry) =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === 'number' &&
      (typeof entry[1] === 'string' || entry[1] === null),
  );
}

function esIdentidadArchivo(value: unknown): value is IdentidadArchivo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.nombre === 'string' &&
    typeof v.tamano === 'number' &&
    typeof v.ultimaModificacion === 'number'
  );
}
