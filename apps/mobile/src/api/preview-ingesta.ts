import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import type {
  PreviewFilaDto,
  PreviewIngestaDto,
  PreviewTransaccionDto,
} from '@moneydiary/api-client';
import { API_BASE_URL } from './config';
import { construirHeadersSesion } from './client';

/**
 * `PreviewTransaccionDto`/`PreviewIngestaDto` — mirror of
 * `POST /api/ingestas/preview`'s success body (US-003, design.md §10.2), now
 * aliases over `@moneydiary/api-client`'s generated types (ADR-012 slice).
 * Money fields stay as decimal strings, never parsed to `number` here —
 * mobile DOES render per-row money in the preview list, unlike
 * `post-ingesta.ts` which never renders `transacciones` and so skips
 * validating it.
 */
export type { PreviewIngestaDto, PreviewTransaccionDto };

/**
 * `PreviewIngestaDtoConCanonicos` — intersection alias that narrows
 * `PreviewIngestaDto`'s optional `filas`/`resumen` to required (no-`!`
 * downstream), mirroring the web sibling
 * (`apps/web/src/api/types.ts`, US-059 D-08). Produced by the hardened
 * `esPreviewIngestaDto` guard below — once the guard passes, `filas` and
 * `resumen` are always non-undefined through the rest of the type chain
 * (MOB-PRV-02).
 */
export type PreviewIngestaDtoConCanonicos = Omit<
  PreviewIngestaDto,
  'filas' | 'resumen'
> & {
  readonly filas: readonly PreviewFilaDto[];
  readonly resumen: NonNullable<PreviewIngestaDto['resumen']>;
};

/**
 * PreviewIngestaError — same shape as `PostIngestaError` (post-ingesta.ts):
 * a small, LOCAL extension of the shared `ApiError` union, scoped to this
 * function's return type only (design.md Decision 4, YAGNI). The `http`
 * variant optionally carries the backend's already-scrubbed Spanish
 * `message` for the 400 case, since preview reuses confirm's exact 400
 * error contract (PREV-03).
 */
export type PreviewIngestaError =
  | { tag: 'unauthorized' }
  | { tag: 'network' }
  | { tag: 'parse' }
  | { tag: 'http'; status: number; message?: string };

export type PreviewIngestaResult =
  | { ok: true; value: PreviewIngestaDtoConCanonicos }
  | { ok: false; error: PreviewIngestaError };

/** Validates one `filas[]` row's shape (MOB-PRV-02): the fields the review
 * list and the future classification sheet read (design.md, mirrors the web
 * guard's `esPreviewFilaDto`). */
function esPreviewFilaDto(value: unknown): value is PreviewFilaDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const fila = value as Record<string, unknown>;
  return (
    typeof fila.rowIndex === 'number' &&
    typeof fila.fecha === 'string' &&
    typeof fila.descripcion === 'string' &&
    typeof fila.cargo === 'string' &&
    typeof fila.abono === 'string' &&
    typeof fila.esDuplicado === 'boolean' &&
    esPreviewFilaSugerido(fila.sugerido)
  );
}

function esPreviewFilaSugerido(
  value: unknown,
): value is { bucket: string; categoriaId: string | null } | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const sugerido = value as Record<string, unknown>;
  return (
    typeof sugerido.bucket === 'string' &&
    (typeof sugerido.categoriaId === 'string' || sugerido.categoriaId === null)
  );
}

/** Validates the `resumen` sub-object's row counts (MOB-PRV-02). */
function esResumenPreviewDto(
  value: unknown,
): value is NonNullable<PreviewIngestaDto['resumen']> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const resumen = value as Record<string, unknown>;
  return (
    typeof resumen.totalFilas === 'number' &&
    typeof resumen.duplicadosDetectados === 'number' &&
    typeof resumen.nuevas === 'number'
  );
}

/**
 * Shape guard hardened for `PreviewIngestaDtoConCanonicos` (MOB-PRV-02):
 * requires BOTH canonical fields — `filas` (array, every row validated by
 * `esPreviewFilaDto`) and `resumen` (row-count object) — in addition to
 * `banco`. A response carrying only the deprecated legacy shape
 * (`estructura`/`muestra`, no `filas`/`resumen`) fails this guard, even
 * though those legacy fields keep being validated as absent-or-present on
 * the wire (the server always emits both, US-057). Mirrors the web guard
 * (`apps/web/src/api/client.ts`'s `esPreviewIngestaDto`, US-059).
 */
function esPreviewIngestaDto(
  value: unknown,
): value is PreviewIngestaDtoConCanonicos {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<PreviewIngestaDto>;
  return (
    typeof candidato.banco === 'string' &&
    Array.isArray(candidato.filas) &&
    candidato.filas.every(esPreviewFilaDto) &&
    esResumenPreviewDto(candidato.resumen)
  );
}

function mensajeDe400(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const candidato = body as { message?: unknown };
  return typeof candidato.message === 'string' ? candidato.message : undefined;
}

/**
 * previewIngesta — POST {base}/api/ingestas/preview with the picked file as
 * RN `FormData`, a faithful transport mirror of `postIngesta` (US-003,
 * design.md §10.2: same `Blob` file-part via `expo-file-system` `File`
 * required by RN's new architecture — US-033 fix — same
 * `construirHeadersSesion()` reuse, same never-throws discipline). Read-only:
 * this call persists nothing (PREV-02), it only returns a ≤50-row sample for
 * the user to review before confirming via the existing `postIngesta`.
 */
export async function previewIngesta(
  pickerResult: DocumentPickerAsset,
): Promise<PreviewIngestaResult> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/ingestas/preview`;

  let res: Response;
  try {
    const formData = new FormData();
    // See `post-ingesta.ts` for the full rationale (US-033): a real `Blob`
    // file-part, not the legacy `{uri,name,type}` object.
    const archivoBlob = new File(pickerResult.uri) as Blob;
    formData.append('file', archivoBlob, pickerResult.name);

    res = await fetch(url, {
      method: 'POST',
      headers: await construirHeadersSesion(),
      body: formData,
    });
  } catch {
    return { ok: false, error: { tag: 'network' } };
  }

  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized' } };
  }

  if (res.status === 400) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        error: { tag: 'http', status: 400, message: undefined },
      };
    }
    return {
      ok: false,
      error: { tag: 'http', status: 400, message: mensajeDe400(body) },
    };
  }

  if (!res.ok) {
    return { ok: false, error: { tag: 'http', status: res.status } };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: { tag: 'parse' } };
  }

  if (!esPreviewIngestaDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}
