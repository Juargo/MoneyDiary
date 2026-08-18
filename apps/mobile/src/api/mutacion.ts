import { API_BASE_URL } from './config';
import { construirHeadersSesion } from './client';
import type { ApiError, ApiResult } from '../domain/api-error';

/**
 * enviarMutacion — el transporte HTTP compartido por toda escritura mobile
 * (US-044, design.md §1.3/D-06): PATCH/POST/DELETE con la MISMA disciplina
 * never-throw que el resto de `client.ts` (guard de `API_BASE_URL` →
 * `network`; `401` → `unauthorized`; cualquier otro no-2xx → `{tag:'http',
 * status,code}` vía `errorConCodigo`; nunca lanza). Extraído en la SEGUNDA
 * ocurrencia (D-06) — hallazgo de judgment-day en el diseño: web tiene dos
 * copias no enlazadas de esta misma función (`apps/web/src/api/perfil.ts` y
 * `apps/web/src/api/categorias.ts`); mobile no repite ese error.
 *
 * Resolución del hallazgo de diseño (§3 vs. §1.3, documentada en
 * `tasks.md` T2a.1 / apply-progress de PR2a): la matriz de branches de §3
 * lista "malformed 2xx → parse", pero §1.3 es explícito en que la vía de
 * éxito de esta función jamás lee el body — devuelve el `Response` crudo
 * tal cual. Se sigue la disciplina de §1.3: NO se agrega parseo al camino
 * de éxito solo para fabricar un caso `parse`. Un 2xx con body no-JSON o
 * malformado sigue resolviendo `{ok:true, value:res}` sin leer el body —
 * cada caller (`perfil.ts`, `categorias.ts`) decide si lo lee y cómo lo
 * valida.
 */
async function errorConCodigo(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { tag: 'http', status: res.status, code: undefined };
  }
  const code = (body as { code?: unknown } | null)?.code;
  return {
    tag: 'http',
    status: res.status,
    code: typeof code === 'string' ? code : undefined,
  };
}

/**
 * `enviarMutacion(url, method, body?)` — `url` es el path relativo (p. ej.
 * `/api/perfil`), NUNCA una URL absoluta: la construcción de la URL final
 * (`${API_BASE_URL}${url}`) vive aquí, igual que `fetchResumen`/`fetchMe`
 * construyen la suya, así cada fetcher caller (`perfil.ts`, `categorias.ts`)
 * pasa el mismo literal de path que su contraparte web (design §1.4:
 * "mirroring `apps/web/src/api/perfil.ts:29-38`"). `content-type:
 * application/json` se agrega SOLO cuando hay `body` — una llamada sin
 * cuerpo (p. ej. `DELETE /api/categorias/:id`) no lo envía.
 */
export async function enviarMutacion(
  url: string,
  method: 'PATCH' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<ApiResult<Response>> {
  if (!API_BASE_URL) {
    // Fail-visible, no fetch a `undefined/...` — mismo guard que
    // `fetchResumen`/`fetchMe` (design.md B.3).
    return { ok: false, error: { tag: 'network' } };
  }

  const headers = await construirHeadersSesion();
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${url}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: { tag: 'network' } };
  }

  if (res.status === 401) {
    return { ok: false, error: { tag: 'unauthorized' } };
  }
  if (!res.ok) {
    return { ok: false, error: await errorConCodigo(res) };
  }

  return { ok: true, value: res };
}
