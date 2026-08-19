import { enviarMutacion } from './mutacion';
import type { ApiResult } from '../domain/api-error';
import type { PasswordPatch, PerfilPatch } from '../domain/guardar-perfil';

export type { PasswordPatch, PerfilPatch } from '../domain/guardar-perfil';

/**
 * api/perfil.ts — cliente de `/api/perfil*` (US-044, design.md §1.4).
 * Mirrors `apps/web/src/api/perfil.ts:29-38`'s two write endpoints
 * verbatim, but delegates to the shared `enviarMutacion` transport
 * (design.md D-06) instead of duplicating a second `enviarMutacion`
 * copy the way web's `perfil.ts`/`categorias.ts` independently do.
 *
 * Both functions discard the success `Response` body without reading it
 * (`{ok:true, value:undefined}`) — same discipline as web: neither
 * caller (`guardar-perfil.ts`, PR4a) ever reads `r.value`, only
 * `r.ok`/`r.error`.
 */

/** `PATCH /api/perfil` — MCFG-03. */
export async function patchPerfil(
  patch: PerfilPatch,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion('/api/perfil', 'PATCH', patch);
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `PATCH /api/perfil/password` — MCFG-03. */
export async function patchPassword(
  patch: PasswordPatch,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion('/api/perfil/password', 'PATCH', patch);
  return r.ok ? { ok: true, value: undefined } : r;
}
