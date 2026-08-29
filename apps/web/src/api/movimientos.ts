/**
 * movimientos.ts — US-060 (D-06/D-07): client fn + request alias + response guard
 * for POST /api/movimientos (manual movement registration).
 *
 * Mirrors the JSON-body (non-multipart) never-throw doctrine established by
 * `postReclasificarCategoria` in `client.ts` (same pattern, different verb:
 * PATCH → POST, different endpoint). Only the URL, request body shape, and
 * response DTO differ.
 *
 * `RegistrarMovimientoManualInput` is co-located here (NOT re-exported from
 * types.ts), following the `CategoriaInput`/`PatronInput` precedent in
 * `categorias.ts` — request types live with their client fn, not in the
 * barrel.
 */
import type { ApiResult } from './client';
import type { RegistrarMovimientoManualDto } from './types';
import { esFechaValida } from '@/domain/fecha';
import { esMontoStringValido } from '@/domain/formatear-monto';
import type { BucketAsignable } from './catalogo-constantes';

// ---------------------------------------------------------------------------
// Request type alias (D-07): discriminated union on `tipo`.
// Ingreso arm is STRICT — no bucket/categoriaId keys (stray keys → 400).
// Gasto arm requires both bucket (BucketAsignable) and categoriaId.
// ---------------------------------------------------------------------------

export type RegistrarMovimientoManualInput =
  | {
      readonly tipo: 'Ingreso';
      readonly fecha: string;
      readonly descripcion: string;
      readonly monto: string;
    }
  | {
      readonly tipo: 'Gasto';
      readonly fecha: string;
      readonly descripcion: string;
      readonly monto: string;
      readonly bucket: BucketAsignable;
      readonly categoriaId: string;
    };

// ---------------------------------------------------------------------------
// Response guard (D-06/WEB-REG-10): validates the 201 body before success flow.
// Checks all 8 expected fields including money-safe cargo/abono strings and
// the literal `origen === 'Manual'`.
// ---------------------------------------------------------------------------

export function esRegistrarMovimientoManualDto(
  value: unknown,
): value is RegistrarMovimientoManualDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidato = value as Record<string, unknown>;
  return (
    typeof candidato['id'] === 'string' &&
    typeof candidato['fecha'] === 'string' &&
    esFechaValida(candidato['fecha']) &&
    typeof candidato['descripcion'] === 'string' &&
    typeof candidato['cargo'] === 'string' &&
    esMontoStringValido(candidato['cargo']) &&
    typeof candidato['abono'] === 'string' &&
    esMontoStringValido(candidato['abono']) &&
    typeof candidato['bucket'] === 'string' &&
    (typeof candidato['categoriaId'] === 'string' ||
      candidato['categoriaId'] === null) &&
    candidato['origen'] === 'Manual'
  );
}

// ---------------------------------------------------------------------------
// Client fn (D-06): POST /api/movimientos
// Status mapping mirrors postReclasificarCategoria:
//   400 → invalid (fixed message — 400 has NO body, do NOT read it)
//   401 → unauthorized
//   non-2xx → server
//   network throw → network
//   2xx guard-fail → parse
// ---------------------------------------------------------------------------

export async function postMovimientoManual(
  body: RegistrarMovimientoManualInput,
): Promise<ApiResult<RegistrarMovimientoManualDto>> {
  let res: Response;
  try {
    res = await fetch('/api/movimientos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  // 400: this endpoint sends NO JSON body (OpenAPI `content?: never` on 400).
  // Do NOT attempt res.json() — it would throw or yield undefined.
  // A fixed scrub-safe message is the correct fallback (D-06 §0).
  if (res.status === 400) {
    return {
      ok: false,
      error: {
        tag: 'invalid',
        message: 'Datos inválidos. Revisa los campos y vuelve a intentar.',
      },
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      error: {
        tag: 'unauthorized',
        message: 'Tu sesión expiró. Inicia sesión de nuevo.',
      },
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  if (!esRegistrarMovimientoManualDto(responseBody)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: responseBody };
}

// ---------------------------------------------------------------------------
// deleteMovimiento — DELETE /api/movimientos/:id
// (SDD `correccion-movimientos-manuales`, PR 3, design D-03, DEL-01/02/03).
//
// Status map mirrors `deleteIngesta` (client.ts) verbatim:
//   204 -> ok/undefined, WITHOUT calling res.json() (no body on a 204)
//   401 -> unauthorized
//   404 -> server, with a specific message (DEL-02 merged anti-enumeration —
//          absent id, another user's row, and an ingesta-born row are all
//          byte-identical on the wire, so the client copy stays generic too)
//   any other non-2xx (incl. 403 DEMO_SOLO_LECTURA) -> the generic server
//   fallback. The demo gate is surfaced client-side by `esDemo` disabling the
//   trigger BEFORE this ever fires (EliminarMovimientoControl) — a real 403
//   reaching this function is the server rejecting a stale/tampered request,
//   not the expected happy path, so it does not need its own copy the way
//   `enviarMutacion`/`errorConCodigo` (categorias.ts) surface `code` for
//   forms that display server-authored messages inline.
//   network throw -> network
//
// `keepalive` (design-hardening change, undo grace window): the smallest
// possible escape hatch for `undo-manager.ts`'s `pagehide` flush — see
// `deleteIngesta` (client.ts) for the identical rationale. `@default false`.
// ---------------------------------------------------------------------------

export async function deleteMovimiento(
  id: string,
  options?: { readonly keepalive?: boolean },
): Promise<ApiResult<void>> {
  const url = `/api/movimientos/${encodeURIComponent(id)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'DELETE',
      keepalive: options?.keepalive ?? false,
    });
  } catch {
    return {
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      error: { tag: 'unauthorized', message: 'Sin acceso.' },
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: 404,
        message: 'El movimiento ya no existe. La lista se actualizará.',
      },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        tag: 'server',
        status: res.status,
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    };
  }

  return { ok: true, value: undefined };
}
