import { API_BASE_URL } from './config';
import { construirHeadersSesion } from './client';
import { enviarMutacion } from './mutacion';
import type { ApiResult } from '../domain/api-error';
import type { BucketAsignable, MatchType } from '../domain/catalogo-constantes';
import type {
  CatalogoDto,
  CategoriaDto,
  PatronDto,
} from '../domain/catalogo.types';

/**
 * api/categorias.ts — cliente de `/api/categorias` y `/api/patrones`
 * (US-044, design.md §1.4). Mirrors `apps/web/src/api/categorias.ts`'s
 * six mutations and `fetchCatalogo`, but delegates every mutation to the
 * shared `enviarMutacion` transport (design.md D-06) instead of a second
 * unlinked copy — the exact judgment-day finding web's own file docblock
 * documents (PR #334, both judges) is what `mutacion.ts` already closed
 * for mobile in PR2a.
 *
 * The six mutations' success bodies are DISCARDED without reading them —
 * fresh state arrives via the catálogo route's own `useFocusEffect` refetch
 * (design.md D-10), not this Response. Only `fetchCatalogo` reads and
 * guards a body.
 *
 * `fetchCatalogo` has its OWN `fetch` (not `enviarMutacion`, design §1.4):
 * unlike a write, a read has nothing in common with `enviarMutacion`'s
 * write-specific headers/body construction, and it is structurally
 * identical to `client.ts`'s existing `fetchMe`/`fetchResumen` skeleton
 * (already the established GET pattern in this module family — extracting
 * that skeleton is out of this change's scope).
 *
 * **No 409 branch for `eliminarCategoria`, and there never will be one**
 * (design decision 5, `CAT038-04`): delete always answers `204` for the
 * caller's own row. A `409` the backend never sends falls into
 * `enviarMutacion`'s generic non-2xx branch like any other undistinguished
 * status — nothing for a future maintainer to "discover" here.
 */

/**
 * Runtime guards (design.md §1.4/D-07). `transaccionesCount` is kept as a
 * `number` and its VALUE is not range-checked — it is the input to the
 * impact sentence (PR6b), so a missing field must be a `parse` failure, not
 * a silent `undefined` interpolated into a destructive warning.
 * `matchType`/`bucket` are kept as PLAIN STRING, not checked against this
 * module's own enums (`catalogo-constantes.ts`) — the server is the
 * authority on validity (ADR-024/ADR-036/ADR-037); a category whose bucket
 * mobile doesn't recognise must still list (design.md D-07,
 * MCFG-MCTG-08's "server-unknown bucket still lists" scenario), not be
 * rejected as a parse failure.
 */
function esPatronDto(value: unknown): value is PatronDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<PatronDto>;
  return (
    typeof candidato.id === 'string' &&
    typeof candidato.categoriaId === 'string' &&
    typeof candidato.patron === 'string' &&
    typeof candidato.matchType === 'string' &&
    typeof candidato.prioridad === 'number'
  );
}

function esCategoriaDto(value: unknown): value is CategoriaDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<CategoriaDto>;
  return (
    typeof candidato.id === 'string' &&
    typeof candidato.nombre === 'string' &&
    typeof candidato.bucket === 'string' &&
    typeof candidato.transaccionesCount === 'number' &&
    Array.isArray(candidato.patrones) &&
    candidato.patrones.every(esPatronDto)
  );
}

function esCatalogoDto(value: unknown): value is CatalogoDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Partial<CatalogoDto>;
  return (
    Array.isArray(candidato.categorias) &&
    candidato.categorias.every(esCategoriaDto)
  );
}

/**
 * `GET /api/categorias` — MCTG-01. Never returns `403`: open to demo
 * sessions (read-only catalog), unlike the six mutations below.
 */
export async function fetchCatalogo(): Promise<ApiResult<CatalogoDto>> {
  if (!API_BASE_URL) {
    // Fail-visible, no fetch a `undefined/...` — mismo guard que
    // `fetchResumen`/`fetchMe` (design.md B.3).
    return { ok: false, error: { tag: 'network' } };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/categorias`, {
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

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: { tag: 'parse' } };
  }
  if (!esCatalogoDto(body)) {
    return { ok: false, error: { tag: 'parse' } };
  }

  return { ok: true, value: body };
}

/**
 * WRITE types use the closed literal unions from `catalogo-constantes.ts`
 * (design.md D-07) — unlike the read guards above, what the client SENDS is
 * worth pinning at compile time: a badly-capitalized `bucket: 'necesidades'`
 * should not surface only as a runtime `400 BUCKET_NO_ASIGNABLE`.
 */
export type CategoriaInput = {
  readonly nombre: string;
  readonly bucket: BucketAsignable;
};

export type CategoriaPatch = {
  readonly nombre?: string;
  readonly bucket?: BucketAsignable;
};

/**
 * `prioridad` is NOT part of this type — mobile never sends it (design.md
 * binding decision 3): omitted from every payload, the backend applies its
 * default (100). Controlling the value is out of this US's scope.
 */
export type PatronInput = {
  readonly categoriaId: string;
  readonly patron: string;
  readonly matchType: MatchType;
};

export type PatronPatch = {
  readonly patron?: string;
  readonly matchType?: MatchType;
};

/** `POST /api/categorias` — MCTG-02. Success body discarded. */
export async function crearCategoria(
  input: CategoriaInput,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion('/api/categorias', 'POST', input);
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `PATCH /api/categorias/:id` — MCTG-03. Success body discarded. */
export async function actualizarCategoria(
  id: string,
  patch: CategoriaPatch,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion(
    `/api/categorias/${encodeURIComponent(id)}`,
    'PATCH',
    patch,
  );
  return r.ok ? { ok: true, value: undefined } : r;
}

/**
 * `DELETE /api/categorias/:id` — MCTG-04 (design decision 5: ALWAYS `204`
 * for the caller's own row, referenced or not — see the file docblock).
 */
export async function eliminarCategoria(id: string): Promise<ApiResult<void>> {
  const r = await enviarMutacion(
    `/api/categorias/${encodeURIComponent(id)}`,
    'DELETE',
  );
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `POST /api/patrones` — MCTG-05. Success body discarded. */
export async function crearPatron(
  input: PatronInput,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion('/api/patrones', 'POST', input);
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `PATCH /api/patrones/:id` — MCTG-06. Success body discarded. */
export async function actualizarPatron(
  id: string,
  patch: PatronPatch,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion(
    `/api/patrones/${encodeURIComponent(id)}`,
    'PATCH',
    patch,
  );
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `DELETE /api/patrones/:id` — MCTG-06. */
export async function eliminarPatron(id: string): Promise<ApiResult<void>> {
  const r = await enviarMutacion(
    `/api/patrones/${encodeURIComponent(id)}`,
    'DELETE',
  );
  return r.ok ? { ok: true, value: undefined } : r;
}
