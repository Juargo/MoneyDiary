import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { API_BASE_URL } from './config';
import { construirHeadersSesion } from './client';

/**
 * PreviewTransaccionDto/PreviewIngestaDto — hand-written mirror of
 * `POST /api/ingestas/preview`'s success body (US-003, design.md §10.2; same
 * ADR-011/012 deferred-codegen note as `post-ingesta.ts`). Source of truth:
 * `apps/api/src/infrastructure/http/dto/preview-ingesta.dto.ts`. Money
 * fields stay as decimal strings, never parsed to `number` here — mobile
 * DOES render per-row money in the preview list, unlike `post-ingesta.ts`
 * which never renders `transacciones` and so skips validating it.
 */
export interface PreviewTransaccionDto {
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
}

export interface PreviewIngestaDto {
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly estructura: { readonly totalFilasDatos: number };
  readonly muestra: ReadonlyArray<PreviewTransaccionDto>;
}

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
  | { ok: true; value: PreviewIngestaDto }
  | { ok: false; error: PreviewIngestaError };

/**
 * Shape guard covering everything the preview UI renders: `banco`,
 * `estructura.totalFilasDatos`, and — unlike `post-ingesta.ts`'s
 * `esIngestaResponseDto`, which skips `transacciones` — every `muestra` row's
 * `cargo`/`abono` as strings (mobile renders per-row money now, design.md
 * §10.2).
 */
function esPreviewIngestaDto(value: unknown): value is PreviewIngestaDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<PreviewIngestaDto>;
  if (typeof candidato.banco !== 'string') {
    return false;
  }
  if (typeof candidato.estructura !== 'object' || candidato.estructura === null) {
    return false;
  }
  if (typeof candidato.estructura.totalFilasDatos !== 'number') {
    return false;
  }
  if (!Array.isArray(candidato.muestra)) {
    return false;
  }
  return candidato.muestra.every(
    (fila) =>
      typeof fila === 'object' &&
      fila !== null &&
      typeof (fila as Partial<PreviewTransaccionDto>).cargo === 'string' &&
      typeof (fila as Partial<PreviewTransaccionDto>).abono === 'string',
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
      return { ok: false, error: { tag: 'http', status: 400, message: undefined } };
    }
    return { ok: false, error: { tag: 'http', status: 400, message: mensajeDe400(body) } };
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
