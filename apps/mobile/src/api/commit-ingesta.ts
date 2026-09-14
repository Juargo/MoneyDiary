import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { CommitIngestaDto } from '@moneydiary/api-client';
import { API_BASE_URL } from './config';
import { construirHeadersSesion } from './client';

/**
 * `CommitIngestaDto` — mirror of `POST /api/ingestas/commit`'s success body
 * (US-057, design.md's `commitIngesta` contract, MAC-01), aliased over
 * `@moneydiary/api-client`'s generated type. Money fields stay as decimal
 * strings, never parsed to `number` here.
 */
export type { CommitIngestaDto };

/**
 * `EdicionFila` — one sparse classification override, `{rowIndex,
 * categoriaId}` (design.md's `commitIngesta` contract). The generated
 * OpenAPI schema types the wire `edits` field as a JSON string (no element
 * type to alias, MAC-01 Open Question), so this local type is unavoidable —
 * same precedent as the web client (`postCommitIngesta`, US-059).
 */
export type EdicionFila = {
  readonly rowIndex: number;
  readonly categoriaId: string;
};

/**
 * CommitIngestaError — same shape as `PreviewIngestaError`
 * (preview-ingesta.ts): a small, LOCAL extension of the shared `ApiError`
 * union, scoped to this function's return type only (design.md Decision 4,
 * YAGNI). The `http` variant optionally carries the backend's already-
 * scrubbed Spanish `message` for the 400 case (MOB-PRV-10).
 */
export type CommitIngestaError =
  | { tag: 'unauthorized' }
  | { tag: 'network' }
  | { tag: 'parse' }
  | { tag: 'http'; status: number; message?: string };

export type CommitIngestaResult =
  | { ok: true; value: CommitIngestaDto }
  | { ok: false; error: CommitIngestaError };

/**
 * Light shape guard — enough to catch a malformed/unexpected 2xx body.
 * Deliberately validates only the root-level fields the mobile UI consumes
 * (`ingestaId`, `totalTransacciones`, `duplicadosOmitidos`) — the as-is
 * commit result screen shows only those counts, never per-transaction money
 * (mirrors `esIngestaResponseDto` in the renamed `post-ingesta.ts`:
 * "validate only what flows to render/money"). `transacciones` is
 * intentionally not validated here (YAGNI: mobile never renders it in this
 * PR — the future review overlay reads it, Phase 5+).
 */
function esCommitIngestaDto(value: unknown): value is CommitIngestaDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<CommitIngestaDto>;
  return (
    typeof candidato.ingestaId === 'string' &&
    typeof candidato.totalTransacciones === 'number' &&
    typeof candidato.duplicadosOmitidos === 'number'
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
 * commitIngesta — POST {base}/api/ingestas/commit with the picked file and
 * the classification overlay as RN `FormData` (US-057, design.md D-02/D-03).
 * A faithful transport mirror of `previewIngesta`: same `Blob` file-part via
 * `expo-file-system` `File` (US-033), same `construirHeadersSesion()` reuse,
 * same never-throws discipline (D-03: no shared multipart helper — extract
 * when a 3rd multipart endpoint appears, YAGNI rule of three). `edits` is
 * ALWAYS sent as a JSON string, even when empty (`[]` — an as-is commit is a
 * valid pure auto-classify commit, MOB-PRV-04).
 */
export async function commitIngesta(
  pickerResult: DocumentPickerAsset,
  edits: readonly EdicionFila[],
): Promise<CommitIngestaResult> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/ingestas/commit`;

  let res: Response;
  try {
    const formData = new FormData();
    // See `preview-ingesta.ts` for the full rationale (US-033): a real
    // `Blob` file-part, not the legacy `{uri,name,type}` object.
    const archivoBlob = new File(pickerResult.uri) as Blob;
    formData.append('file', archivoBlob, pickerResult.name);
    formData.append('edits', JSON.stringify(edits));

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

  if (!esCommitIngestaDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}
