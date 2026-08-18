/**
 * ApiError — every way the mobile HTTP client can fail, mirroring the
 * backend's Result<T,E> philosophy (no thrown exceptions cross this
 * boundary; the screen switches on a tag, never a try/catch — design.md
 * B.3, MOB-02).
 *
 * Moved here (verbatim, from `src/api/client.ts`) so `src/domain/`'s new
 * copy tables (`mensajes-perfil.ts`, `mensajes-catalogo.ts`, US-044) can
 * name `ApiError` without `domain/` reaching up into `src/api` — the
 * existing dependency direction is `api → domain`
 * (`client.ts` already imports `esMontoStringValido` from
 * `./formatear-monto`), so the type moves down instead (design.md D-04).
 * `client.ts` re-exports all three names unchanged — zero import-path churn
 * at any existing call site.
 */
export type ApiError =
  | { tag: 'unauthorized' } // HTTP 401 (bad/missing key, no/expired/revoked session)
  | { tag: 'network' } // fetch rejected (offline, DNS, TLS) or no base URL
  | { tag: 'parse' } // 2xx but body not the expected JSON shape
  | { tag: 'http'; status: number; code?: string }; // any other non-2xx (500, 400, 404…); `code` (CQ-3/D-05) is an additive optional field populated only by the new US-044 mutation/catalog fetchers — every pre-existing fetcher keeps leaving it `undefined`.

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

/**
 * copiaPorApiError — the shared Spanish copy per `ApiError` tag (review
 * readability fix #7, DRY): both `src/components/states/Error.tsx` (the
 * resumen screen's error state) and `app/subir.tsx` (the upload screen's
 * error state, whose `PostIngestaError` is a structural superset of
 * `ApiError` — see `post-ingesta.ts`) rendered the exact same four strings
 * independently. `subir.tsx` wraps this to add its one extra case: the
 * backend's scrubbed `message` on a 400.
 */
export function copiaPorApiError(error: ApiError): string {
  switch (error.tag) {
    case 'network':
      return 'Problema de conexión. Revisa tu internet e intenta de nuevo.';
    case 'unauthorized':
      return 'No se pudo verificar el acceso. Intenta de nuevo más tarde.';
    case 'parse':
      return 'Respuesta inesperada del servidor.';
    case 'http':
      return `Error del servidor (código ${error.status}).`;
  }
}
