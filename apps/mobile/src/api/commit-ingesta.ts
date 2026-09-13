import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import type {
  IngestaResponseDto,
  TransaccionResponseDto,
} from '@moneydiary/api-client';
import { API_BASE_URL } from './config';
import { construirHeadersSesion } from './client';

/**
 * `TransaccionResponseDto`/`IngestaResponseDto` — mirror of
 * `POST /api/ingestas`'s success body, now aliases over
 * `@moneydiary/api-client`'s generated types (ADR-012 slice). Money fields
 * stay as decimal strings, never parsed to `number` here. `IngestaResponseDto`
 * gains a required `duplicadosOmitidos` field from the package; mobile never
 * renders it.
 */
export type { IngestaResponseDto, TransaccionResponseDto };

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

  let res: Response;
  try {
    const formData = new FormData();
    // A real `Blob` file-part, NOT the legacy `{uri,name,type}` object: React
    // Native's new architecture (Fabric/bridgeless, RN 0.86) rejects that shape
    // with "Unsupported FormDataPart implementation" (device gate, US-033). The
    // `expo-file-system` `File` class implements `Blob` over a `file://` URI, so
    // it streams natively. The third `append` arg sets the multipart filename;
    // the backend remains the extension authority (design.md Decision 3).
    //
    // `new File()` validates the path synchronously and can throw (e.g. a temp
    // URI expired, or a content:// grant was revoked between pick and upload),
    // so it stays INSIDE this try: any such throw resolves to {tag:'network'}
    // like a fetch failure, preserving the never-throws contract (CU-11) — the
    // caller (subir.tsx) has no try/catch and would otherwise hang on 'subiendo'.
    const archivoBlob = new File(pickerResult.uri) as Blob;
    formData.append('file', archivoBlob, pickerResult.name);

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

  if (!esIngestaResponseDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}
