import { API_BASE_URL, API_KEY } from './config';
import type { ResumenMesDto } from '../domain/resumen.types';

/**
 * ApiError — every way `fetchResumen` can fail, mirroring the backend's
 * Result<T,E> philosophy (no thrown exceptions cross this boundary; the
 * screen switches on a tag, never a try/catch — design.md B.3, MOB-02).
 */
export type ApiError =
  | { tag: 'unauthorized' } // HTTP 401 (bad/missing key)
  | { tag: 'network' } // fetch rejected (offline, DNS, TLS) or no base URL
  | { tag: 'parse' } // 2xx but body not the expected JSON shape
  | { tag: 'http'; status: number }; // any other non-2xx (500, 400, 404…)

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

/** Light shape guard — enough to catch a malformed/unexpected 2xx body. */
function esResumenMesDto(value: unknown): value is ResumenMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<ResumenMesDto>;
  return (
    typeof candidato.totalIngreso === 'string' &&
    Array.isArray(candidato.buckets)
  );
}

/**
 * fetchResumen — the only place that touches `fetch` and env (design.md
 * B.1/B.3). GET {base}/api/resumen[?periodo=YYYY-MM] with the x-api-key
 * header, mapped into a typed ApiResult — never throws.
 */
export async function fetchResumen(
  periodo?: string,
): Promise<ApiResult<ResumenMesDto>> {
  if (!API_BASE_URL) {
    // Fail-visible, not a crash: no fetch to `undefined/...` (design.md B.3).
    return { ok: false, error: { tag: 'network' } };
  }

  const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
  const url = `${API_BASE_URL}/api/resumen${query}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': API_KEY ?? '' },
    });
  } catch {
    return { ok: false, error: { tag: 'network' } };
  }

  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized' } };
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

  if (!esResumenMesDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}
