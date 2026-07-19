import type { DocumentPickerAsset } from 'expo-document-picker';
import { API_BASE_URL } from './config';
import { construirHeadersSesion } from './client';

/**
 * TransaccionResponseDto/IngestaResponseDto — hand-written mirror of
 * `POST /api/ingestas`'s success body (ADR-011/012 note: same deferred
 * `@moneydiary/api-client` debt as `resumen.types.ts`). Source of truth:
 * `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts`. Money
 * fields stay as decimal strings, never parsed to `number` here.
 */
export interface TransaccionResponseDto {
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
}

export interface IngestaResponseDto {
  readonly ingestaId: string;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly archivo: { readonly nombre: string; readonly extension: string; readonly tamanoBytes: number };
  readonly totalTransacciones: number;
  readonly transacciones: ReadonlyArray<TransaccionResponseDto>;
}

/**
 * PostIngestaError — a small, LOCAL extension of the shared `ApiError` union
 * (client.ts), scoped to this function's return type only (design.md
 * Decision 4, YAGNI: do not widen `ApiError` for every mobile call). The
 * only difference is the `http` variant optionally carries the backend's
 * already-scrubbed Spanish `message` for the 400 case (CU-04/CU-11), since
 * every ingesta validation error (banco no reconocido, estructura inválida,
 * PDF sin texto, tamaño/extensión) is a 400 and structurally
 * indistinguishable beyond that message.
 */
export type PostIngestaError =
  | { tag: 'unauthorized' }
  | { tag: 'network' }
  | { tag: 'parse' }
  | { tag: 'http'; status: number; message?: string };

export type PostIngestaResult =
  | { ok: true; value: IngestaResponseDto }
  | { ok: false; error: PostIngestaError };

/** MIME type per extension — small map, not a switch (KISS). */
const MIME_POR_EXTENSION: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function extensionDe(nombreArchivo: string): string {
  const separador = nombreArchivo.lastIndexOf('.');
  return separador === -1 ? '' : nombreArchivo.slice(separador + 1).toLowerCase();
}

/**
 * MIME type is ALWAYS derived from the file extension, never trusted from
 * the picker's `mimeType` (design.md Decision 3) — a picker/OS can report a
 * wrong or missing `mimeType`, but the backend only accepts `.xlsx`/`.pdf`.
 */
function mimeTypePorExtension(nombreArchivo: string): string {
  // Defensive default, not an error path: the picker already restricts
  // selection and the backend is the real extension authority (rejects
  // unsupported files with a 400), so an unknown extension here still goes
  // out as `application/octet-stream` rather than blocking the request.
  return MIME_POR_EXTENSION[extensionDe(nombreArchivo)] ?? 'application/octet-stream';
}

/**
 * Light shape guard — enough to catch a malformed/unexpected 2xx body.
 * Deliberately validates only the fields the mobile UI consumes
 * (`ingestaId`, `banco`, `totalTransacciones`) — the result screen shows
 * banco/cuenta/count only, never per-transaction money — mirroring
 * `esResumenMesDto` in `client.ts` ("validate only what flows to
 * render/money"). `transacciones` is intentionally not validated here
 * (YAGNI: mobile never renders it).
 */
function esIngestaResponseDto(value: unknown): value is IngestaResponseDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<IngestaResponseDto>;
  return (
    typeof candidato.ingestaId === 'string' &&
    typeof candidato.banco === 'string' &&
    typeof candidato.totalTransacciones === 'number'
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
 * postIngesta — POST {base}/api/ingestas with the picked file as RN
 * `FormData` (US-033, ADR-026: mobile's only write capability). Reuses
 * `construirHeadersSesion()` verbatim for `x-api-key` + `Authorization:
 * Bearer` — never throws (CU-11: a backend error or network failure always
 * resolves to a typed result, never leaves the caller hanging).
 */
export async function postIngesta(
  pickerResult: DocumentPickerAsset,
): Promise<PostIngestaResult> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/ingestas`;
  const formData = new FormData();
  // RN's native file-part shape ({uri,name,type}), NOT a Blob/File — the RN
  // FormData polyfill accepts this instead (design.md Decision 3).
  formData.append('file', {
    uri: pickerResult.uri,
    name: pickerResult.name,
    type: mimeTypePorExtension(pickerResult.name),
  } as unknown as Blob);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      // No manual Content-Type — RN generates the multipart boundary itself;
      // setting it here would drop that boundary (design.md Decision 3).
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

  if (!esIngestaResponseDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}
