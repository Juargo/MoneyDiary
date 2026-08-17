import { API_BASE_URL, API_KEY } from './config';
import { conTimeout, NETWORK_LEG_TIMEOUT_MS } from './con-timeout';
import { leerToken } from './session-store';
import { esMontoStringValido } from '../domain/formatear-monto';
import type {
  AuthCapabilitiesDto,
  LoginResponseDto,
} from '@moneydiary/api-client';
import type {
  MeDto,
  ResumenMesDto,
  ResumenAnualDto,
} from '../domain/resumen.types';
import type { ApiResult } from '../domain/api-error';

/**
 * `LoginResponseDto` — mirror of `POST /api/auth/login`'s success body
 * (MOB-01, MOB-04). `AuthCapabilitiesDto` — mirror of
 * `GET /api/auth/capabilities`'s response body (AC-10, MOB-06). Both are
 * now aliases over `@moneydiary/api-client`'s generated types (ADR-012
 * slice); re-exported here so importers keep `from './client'` unchanged.
 */
export type { AuthCapabilitiesDto, LoginResponseDto };

/**
 * `ApiError`/`ApiResult`/`copiaPorApiError` moved verbatim to
 * `src/domain/api-error.ts` (US-044, design.md D-04) so the new copy tables
 * in `src/domain/` (`mensajes-perfil.ts`, `mensajes-catalogo.ts`) can name
 * `ApiError` without `domain/` importing from `src/api/`. Re-exported here
 * so every existing importer (`states/Error.tsx`, `app/index.tsx`,
 * `app/subir.tsx`, `app/login.tsx`, and their specs) keeps importing from
 * `./client` unchanged — zero call-site churn.
 */
export type { ApiError, ApiResult } from '../domain/api-error';
export { copiaPorApiError } from '../domain/api-error';

/**
 * esBucketResumenDto — per-element bucket guard (judgment-day CRITICAL fix,
 * mirrors `apps/web/src/api/client.ts`'s `esBucketResumenDto`). Checking
 * `b.total` directly inside `Array.prototype.every` without first ruling out
 * `null`/non-object elements throws a raw `TypeError` — which REJECTS the
 * enclosing promise instead of resolving `{ok:false, error:{tag:'parse'}}`,
 * breaking the never-throws contract (MOB-02). The `typeof value !== 'object'
 * || value === null` guard below is the same null-object check
 * `esResumenMesDto` already applies to its own top-level `value`.
 */
function esBucketResumenDto(value: unknown): value is { total: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<{ total: string }>;
  return (
    typeof candidato.total === 'string' && esMontoStringValido(candidato.total)
  );
}

/**
 * Light shape guard — enough to catch a malformed/unexpected 2xx body.
 *
 * Money guard (D-14, US-050): `totalIngreso` and every `bucket.total` are
 * additionally checked with `esMontoStringValido`, not just `typeof ===
 * 'string'`. `formatearMontoConSigno` (new in the legend) throws on a
 * malformed amount and this app has no ErrorBoundary — without this guard a
 * malformed 2xx body would crash the render instead of landing in the
 * already-handled `parse` state.
 */
function esResumenMesDto(value: unknown): value is ResumenMesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<ResumenMesDto>;
  return (
    typeof candidato.totalIngreso === 'string' &&
    esMontoStringValido(candidato.totalIngreso) &&
    Array.isArray(candidato.buckets) &&
    candidato.buckets.every(esBucketResumenDto)
  );
}

/**
 * esResumenAnualDto — GET /api/resumen/anual's shape guard. Reuses
 * `esResumenMesDto` over every `meses[]` entry (DRY, design §1.5) so the
 * D-14 money guard applies identically per month. `meses.length === 12`
 * (judgment-day SUGGESTION fix, MOB-10) pins the annual grid to exactly 12
 * cells, mirroring web's guard parity.
 */
function esResumenAnualDto(value: unknown): value is ResumenAnualDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<ResumenAnualDto>;
  return (
    typeof candidato.anio === 'number' &&
    Array.isArray(candidato.meses) &&
    candidato.meses.length === 12 &&
    candidato.meses.every(esResumenMesDto)
  );
}

function esAuthCapabilitiesDto(value: unknown): value is AuthCapabilitiesDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<AuthCapabilitiesDto>;
  return (
    typeof candidato.googleLoginEnabled === 'boolean' &&
    typeof candidato.googleLoginMobileEnabled === 'boolean'
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

/**
 * esMeDto — widened + tightened to mirror `AuthMeResponse` exactly (US-044,
 * design §1.2): `email` accepts `string | null` (a demo account's `email` is
 * `null` by domain invariant, `AuthMeResponse`'s own doc comment) — this
 * relaxation is the fix for the pre-existing gap that locked demo accounts
 * out of the cold-start session gate. `nombre`, `esDemo`, and
 * `googleVinculado` are newly REQUIRED (tightening) to match the DTO in
 * full. `esDemo` is validated as the discriminator that makes `email: null`
 * legitimate here — the one deliberate exception to `post-ingesta.ts`'s
 * "validate only what flows to render" rule: `email` itself is never
 * rendered by the session gate, but its nullability is load-bearing for
 * telling a demo account apart from a malformed body.
 */
function esMeDto(value: unknown): value is MeDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<MeDto>;
  return (
    typeof candidato.userId === 'string' &&
    (typeof candidato.email === 'string' || candidato.email === null) &&
    typeof candidato.nombre === 'string' &&
    typeof candidato.esDemo === 'boolean' &&
    typeof candidato.googleVinculado === 'boolean'
  );
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
export async function construirHeadersSesion(): Promise<
  Record<string, string>
> {
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
 * fetchResumenAnual — GET {base}/api/resumen/anual[?anio=YYYY] (MOB-10).
 * Structurally a byte-for-byte mirror of `fetchResumen` (D-02): same
 * `ApiResult`/`ApiError` tags, same `construirHeadersSesion`, never throws.
 * The screen itself never sends `anio` (the backend resolves the current
 * year from the caller's session) — the optional param exists for API
 * completeness and future-year navigation, mirroring web's signature.
 * Mobile keeps its own 4-tag `ApiError`: the `/anual` 400 (invalid `anio`)
 * collapses into the generic `http` bucket rather than a dedicated tag
 * (D-03) — mobile never sends a user-typed year, so a 400 here is a genuine
 * "should not happen".
 */
export async function fetchResumenAnual(
  anio?: number,
): Promise<ApiResult<ResumenAnualDto>> {
  if (!API_BASE_URL) {
    // Fail-visible, not a crash: no fetch to `undefined/...` (design.md B.3).
    return { ok: false, error: { tag: 'network' } };
  }

  const query =
    anio !== undefined ? `?anio=${encodeURIComponent(String(anio))}` : '';
  const url = `${API_BASE_URL}/api/resumen/anual${query}`;

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

  if (!esResumenAnualDto(body)) {
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
      headers: {
        'x-api-key': API_KEY ?? '',
        'Content-Type': 'application/json',
      },
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
 * postGoogleIdToken — POST {base}/api/auth/google/token with `{idToken}`.
 * Mirrors `postLogin` exactly: no session exists yet, so only `x-api-key` is
 * sent, and the response reuses the *same* `esLoginResponseDto` guard and
 * `LoginResponseDto` shape (AUTH-20, design.md §9.1 — the body genuinely is
 * the same DTO). Every failure branch (bad token, unverified email, no
 * matching user, demo, already-linked, rate-limited) collapses to the usual
 * `ApiError` tags — never throws.
 */
export async function postGoogleIdToken(
  idToken: string,
): Promise<ApiResult<LoginResponseDto>> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/auth/google/token`;

  let res: Response;
  try {
    res = await conTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      }),
      NETWORK_LEG_TIMEOUT_MS,
    );
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
 * fetchAuthCapabilities — GET {base}/api/auth/capabilities with `x-api-key`
 * only. Explicit headers, **not** `construirHeadersSesion`: there is no
 * session at this point in the login flow, and attaching a stale Bearer
 * would be noise (design.md §9.1). Consumed by `app/login.tsx`'s mount-time
 * fetch to gate the Google button (MOB-06, fail-closed) — never throws.
 */
export async function fetchAuthCapabilities(): Promise<
  ApiResult<AuthCapabilitiesDto>
> {
  if (!API_BASE_URL) {
    return { ok: false, error: { tag: 'network' } };
  }

  const url = `${API_BASE_URL}/api/auth/capabilities`;

  let res: Response;
  try {
    res = await conTimeout(
      fetch(url, { headers: { 'x-api-key': API_KEY ?? '' } }),
      NETWORK_LEG_TIMEOUT_MS,
    );
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

  if (!esAuthCapabilitiesDto(body)) {
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
    res = await fetch(url, {
      method: 'POST',
      headers: await construirHeadersSesion(),
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

  return { ok: true, value: undefined };
}
