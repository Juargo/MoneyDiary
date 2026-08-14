import type { BucketAsignable, MatchType } from './catalogo-constantes';
import type { ApiError, ApiResult } from './client';
import type { CatalogoDto, CategoriaDto, PatronDto } from './types';

/**
 * api/categorias.ts — cliente de `/api/categorias` y `/api/patrones`
 * (US-043, design.md §1/Q2a). Misma disciplina never-throw `ApiResult<T>`
 * que `perfil.ts`: `credentials: 'same-origin'` explícito, toda falla
 * mapeada a un `ApiError` tipado, nunca lanza. `enviarMutacion` es el
 * fetch/401/no-2xx compartido por las seis mutaciones (`dry`), levantando
 * `body.code` al `ApiError` discriminado — mismo mecanismo que
 * `perfil.ts`'s `enviarMutacion`/`errorConCodigo`, repetido en un segundo
 * archivo en vez de un import cruzado: los dos módulos evolucionan por
 * razones distintas (perfil vs. catálogo) y no comparten un tipo de patch.
 *
 * ⚠️ SEGUNDA ocurrencia — la tercera OBLIGA a extraer (`dry`: 1ª escribe,
 * 2ª anota, 3ª extrae). Y la justificación de arriba NO cubre a
 * `errorConCodigo`: es agnóstico al tipo (`Response -> ApiError`) y nunca
 * toca un patch, así que hoy son dos copias idénticas sin nada que las
 * enlace — un fix en una no se propaga a la otra y ni tsc ni eslint lo
 * detectan. Hallazgo de judgment-day sobre PR #334 (ambos jueces).
 *
 * Los bodies de éxito de las seis mutaciones se DESCARTAN sin leerlos — el
 * estado fresco llega por la invalidación de `['categorias']`
 * (`categorias-invalidacion.ts`, PR #1c), no por este body. Solo
 * `fetchCatalogo` lee y guarda el body (design.md §1/Q2a).
 *
 * **No existe una rama `409` para `deleteCategoria` y nunca la habrá**
 * (decisión 5, `CAT038-04`): el borrado siempre responde `204` para la
 * propia fila del caller. Un `409` (si el backend alguna vez lo enviara)
 * cae en la rama genérica `!res.ok` de `enviarMutacion`, exactamente igual
 * que cualquier otro status no distinguido explícitamente — no hay nada
 * que un futuro mantenedor deba "encontrar" acá (`categorias.test.ts`
 * prueba esto explícitamente).
 */

const SESSION_FETCH_OPTIONS: RequestInit = { credentials: 'same-origin' };

/**
 * Guardas de runtime (design.md §1/Q2b). `transaccionesCount` se guarda
 * como `number` y NO se valida su rango — es el input de la frase de
 * impacto (PR #3b), así que un campo faltante debe ser un `parse` failure,
 * no un `undefined` silencioso interpolado en una advertencia destructiva.
 * `matchType`/`bucket` se guardan como STRING PLANO, no contra los enums
 * del propio web (`catalogo-constantes.ts`) — el servidor es la autoridad
 * de validez (ADR-024); una categoría cuyo bucket el web no reconoce debe
 * poder listarse igual (design.md Q4c), no rechazarse como parse failure.
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

async function errorConCodigo(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      tag: 'server',
      status: res.status,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    };
  }
  const code = (body as { code?: unknown } | null)?.code;
  return {
    tag: 'server',
    status: res.status,
    code: typeof code === 'string' ? code : undefined,
    message: 'Ocurrió un error inesperado. Intenta nuevamente.',
  };
}

/**
 * enviarMutacion — el fetch + mapeo de error compartido por las seis
 * mutaciones (`dry`: red/401/no-2xx son la MISMA lógica en las seis).
 * `body` es opcional porque `deleteCategoria`/`deletePatron` no envían
 * cuerpo. Devuelve el `Response` crudo en éxito — todo caller de este
 * archivo lo descarta (Q2a); solo `fetchCatalogo` tiene su propio fetch
 * inline porque además necesita leer y guardar el body.
 */
async function enviarMutacion(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<ApiResult<Response>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...SESSION_FETCH_OPTIONS,
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
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
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    };
  }
  if (!res.ok) {
    return { ok: false, error: await errorConCodigo(res) };
  }

  return { ok: true, value: res };
}

/**
 * `GET /api/categorias` — CAT038-01/02/07. Nunca devuelve `403`: el `GET`
 * queda abierto a sesiones demo (`CAT038-08`), a diferencia de las seis
 * mutaciones de abajo.
 */
export async function fetchCatalogo(): Promise<ApiResult<CatalogoDto>> {
  let res: Response;
  try {
    res = await fetch('/api/categorias', SESSION_FETCH_OPTIONS);
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
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    };
  }
  if (!res.ok) {
    return { ok: false, error: await errorConCodigo(res) };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }
  if (!esCatalogoDto(body)) {
    return {
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    };
  }

  return { ok: true, value: body };
}

/**
 * Los tipos de ESCRITURA usan las uniones literales de `catalogo-constantes.ts`;
 * los de LECTURA (guards) no. No es una inconsistencia: en la respuesta el
 * servidor es la autoridad y un valor nuevo no debe romper el parseo (Q2b,
 * ADR-024), pero lo que el cliente ENVÍA sí conviene fijarlo en compilación —
 * si no, un `bucket: 'necesidades'` mal capitalizado sólo se descubre como
 * `400 BUCKET_NO_ASIGNABLE` en runtime. Hallazgo de judgment-day sobre PR #334,
 * confirmado por ambos jueces.
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
 * `prioridad` NO forma parte de este tipo — nunca se envía desde el web
 * (design.md §1/Q9b): omitido de todo payload, el backend aplica su default
 * (100). El control del valor queda fuera de alcance de esta US.
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

/** `POST /api/categorias` — CAT038-01. Body de éxito descartado (Q2a). */
export async function postCategoria(
  input: CategoriaInput,
): Promise<ApiResult<void>> {
  const r = await enviarMutacion('/api/categorias', 'POST', input);
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `PATCH /api/categorias/:id` — CAT038-02. Body de éxito descartado. */
export async function patchCategoria(
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
 * `DELETE /api/categorias/:id` — CAT038-04 (decisión 5: SIEMPRE `204` para
 * la propia fila del caller, en uso o no — ver el docblock del archivo).
 */
export async function deleteCategoria(id: string): Promise<ApiResult<void>> {
  const r = await enviarMutacion(
    `/api/categorias/${encodeURIComponent(id)}`,
    'DELETE',
  );
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `POST /api/patrones` — CAT038-05. Body de éxito descartado. */
export async function postPatron(input: PatronInput): Promise<ApiResult<void>> {
  const r = await enviarMutacion('/api/patrones', 'POST', input);
  return r.ok ? { ok: true, value: undefined } : r;
}

/** `PATCH /api/patrones/:id` — CAT038-06. Body de éxito descartado. */
export async function patchPatron(
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

/** `DELETE /api/patrones/:id` — CAT038-06. */
export async function deletePatron(id: string): Promise<ApiResult<void>> {
  const r = await enviarMutacion(
    `/api/patrones/${encodeURIComponent(id)}`,
    'DELETE',
  );
  return r.ok ? { ok: true, value: undefined } : r;
}
