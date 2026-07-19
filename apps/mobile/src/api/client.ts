import { API_BASE_URL, API_KEY } from './config';
import { leerToken } from './session-store';
import type { MeDto, ResumenMesDto } from '../domain/resumen.types';

/**
 * ApiError — every way the mobile HTTP client can fail, mirroring the
 * backend's Result<T,E> philosophy (no thrown exceptions cross this
 * boundary; the screen switches on a tag, never a try/catch — design.md
 * B.3, MOB-02).
 */
export type ApiError =
  | { tag: 'unauthorized' } // HTTP 401 (bad/missing key, no/expired/revoked session)
  | { tag: 'network' } // fetch rejected (offline, DNS, TLS) or no base URL
  | { tag: 'parse' } // 2xx but body not the expected JSON shape
  | { tag: 'http'; status: number }; // any other non-2xx (500, 400, 404…)

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

/** Mirror of `POST /api/auth/login`'s success body (MOB-01, MOB-04). */
export interface LoginResponseDto {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: string;
}

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

function esLoginResponseDto(value: unknown): value is LoginResponseDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<LoginResponseDto>;
  return (
    typeof candidato.token === 'string' &&
    typeof candidato.userId === 'string' &&
    typeof candidato.expiresAt === 'string'
  );
}

function esMeDto(value: unknown): value is MeDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<MeDto>;
  return typeof candidato.userId === 'string' && typeof candidato.email === 'string';
}

/**
 * Builds the auth headers for a session-aware call: `x-api-key` always,
 * `Authorization: Bearer <token>` only when a token is actually stored
 * (MOB-02). Used by every authenticated call except `postLogin`, which has
 * no session yet. Exported so `post-ingesta.ts` (Sprint 8, US-033) reuses it
 * verbatim instead of duplicating the header-building rule (DRY) — it
 * intentionally never sets `Content-Type`, which is correct for both JSON
 * callers (who set it themselves) and multipart callers (who must let the
 * runtime generate the boundary).
 */
export async function construirHeadersSesion(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'x-api-key': API_KEY ?? '' };
  const token = await leerToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * fetchResumen — the read-only resumen call (design.md B.1/B.3). GET
 * {base}/api/resumen[?periodo=YYYY-MM] with `x-api-key` and, when a
 * session token is stored, `Authorization: Bearer` (MOB-02) — never
 * throws.
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
    res = await fetch(url, { headers: await construirHeadersSesion() });
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

/**
 * postLogin — POST {base}/api/auth/login with `{email,password}`. No
 * session exists yet, so only `x-api-key` is sent (MOB-01, MOB-04). On
 * success the caller is responsible for persisting `value.token` via
 * `guardarToken` — this function never touches SecureStore itself.
 */
export async function postLogin(
  email: string,
  password: string,
): Promise<ApiResult<LoginResponseDto>> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/auth/login`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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

  if (!esLoginResponseDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}

/**
 * fetchMe — GET {base}/api/auth/me, session-aware like `fetchResumen`
 * (MOB-04). Used by the session gate to confirm a stored token is still
 * valid.
 */
export async function fetchMe(): Promise<ApiResult<MeDto>> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/auth/me`;

  let res: Response;
  try {
    res = await fetch(url, { headers: await construirHeadersSesion() });
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

  if (!esMeDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}

/**
 * postLogout — POST {base}/api/auth/logout, session-aware (MOB-04). The
 * backend's logout is idempotent and always returns 204, but this stays
 * never-throwing regardless: the caller (the logout affordance) clears the
 * local token via `borrarToken` even if this call fails.
 */
export async function postLogout(): Promise<ApiResult<void>> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/auth/logout`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: await construirHeadersSesion() });
  } catch {
    return { ok: false, error: { tag: 'network' } };
  }

  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized' } };
  }
  if (!res.ok) {
    return { ok: false, error: { tag: 'http', status: res.status } };
  }

  return { ok: true, value: undefined };
}
