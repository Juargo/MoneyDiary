import type { ApiError } from '@/api/client';

/**
 * mensajes-catalogo.ts, error-table portion (US-043 design.md §1/Q8,
 * WCTG-12). Extended in PR #3b with the dialog-payload translator
 * (`ImpactoCatalogo`/`fraseDeImpacto`, design.md §1/Q6b) — this file only
 * carries the error table for now.
 *
 * Every message is a CLIENT constant. `body.message`/`error.message` is
 * NEVER rendered (`perfil.ts`'s discipline, applied here for a different
 * reason: the backend's messages enumerate valid values, which is wire
 * vocabulary, not UI copy — design.md §1/Q8b).
 *
 * Totality is a `Record<CodigoCatalogo, string>` over the closed literal
 * union, NOT a `switch` + `never` (design's **Q8b CORRECTION** — no code
 * here needs two messages depending on context, unlike `mensajes.ts`'s
 * `PERFIL_RECHAZADO`, so a `Record` gives the same totality with less
 * machinery: adding a member without a row fails `tsc` directly).
 */

/**
 * MENSAJE_DEMO_CATALOGO — **a new sibling constant**, not
 * `MENSAJE_DEMO_SOLO_LECTURA` reused verbatim (design's **Q6c CORRECTION**):
 * that string reads "…para editar tu perfil.", which is false on the
 * categories screen. Same two-layer pattern as `PerfilForm` (proactively
 * disabled controls + a `role="note"` explanation + the defensive `403
 * DEMO_SOLO_LECTURA` mapping below), one honest sentence instead of one
 * reused false one.
 */
export const MENSAJE_DEMO_CATALOGO =
  'Estás en una cuenta de demostración. Crea una cuenta real para editar tus categorías.';

/**
 * CodigoCatalogo — el union literal cerrado de los 11 códigos que el
 * deployed catalog API devuelve (verificado contra
 * `catalogo-http-error.ts`'s propio `_exhaustive: never` guard, design.md
 * §1/Q8a: una clase de error ⇒ exactamente un status ⇒ exactamente un
 * código, ningún código aparece en dos statuses) más un `BODY_INVALIDO`
 * client-only, para el caso `tag: 'parse'` (body malformado, falla la
 * guarda de runtime). Doce miembros en total.
 */
export type CodigoCatalogo =
  | 'NOMBRE_INVALIDO'
  | 'BUCKET_NO_ASIGNABLE'
  | 'PATRON_INVALIDO'
  | 'MATCH_TYPE_INVALIDO'
  | 'REGEX_INVALIDA'
  | 'PRIORIDAD_INVALIDA'
  | 'BODY_INVALIDO'
  | 'DEMO_SOLO_LECTURA'
  | 'CATEGORIA_NO_ENCONTRADA'
  | 'PATRON_NO_ENCONTRADO'
  | 'NOMBRE_DUPLICADO'
  | 'PATRON_DUPLICADO';

/**
 * COPY — la tabla de 12 filas, verbatim de design.md §1/Q8b. Notas que un
 * revisor pediría de otro modo:
 * - `BUCKET_NO_ASIGNABLE` dice `Gustos`, no `Deseos` — A1 aplica también al
 *   copy de error, o la app nombra un valor que el dropdown nunca mostró.
 * - `PRIORIDAD_INVALIDA` es INALCANZABLE desde esta UI: ningún control
 *   envía `prioridad`, así que el default del API (100) siempre aplica
 *   (open question 7 resuelta: oculto y con default). La fila existe para
 *   que el código no caiga al genérico si algún día aparece un control.
 * - **No existe un `409` en delete y nunca lo habrá** (decisión 5,
 *   `CAT038-04`) — por eso no hay fila `409` en esta tabla; el 409 de
 *   `deleteCategoria` cae en la rama genérica de `enviarMutacion`
 *   (`categorias.ts` task 12), no en esta tabla.
 */
const COPY: Record<CodigoCatalogo, string> = {
  NOMBRE_INVALIDO: 'El nombre debe tener entre 1 y 40 caracteres.',
  BUCKET_NO_ASIGNABLE: 'Elige un bucket: Necesidades, Gustos o Ahorro.',
  PATRON_INVALIDO: 'El patrón debe tener entre 1 y 200 caracteres.',
  MATCH_TYPE_INVALIDO: 'Elige un tipo de coincidencia válido.',
  REGEX_INVALIDA: 'Esa expresión regular no es válida.',
  PRIORIDAD_INVALIDA: 'La prioridad debe ser un número entre 1 y 999.',
  BODY_INVALIDO:
    'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
  DEMO_SOLO_LECTURA: MENSAJE_DEMO_CATALOGO,
  CATEGORIA_NO_ENCONTRADA:
    'Esa categoría ya no existe. Vuelve a la lista y recarga.',
  PATRON_NO_ENCONTRADO: 'Ese patrón ya no existe. Recarga la página.',
  NOMBRE_DUPLICADO: 'Ya tienes una categoría con ese nombre.',
  PATRON_DUPLICADO: 'Ya tienes un patrón con ese texto.',
};

const GENERICO = 'Ocurrió un error inesperado. Intenta nuevamente.';

/**
 * mensajeDeErrorCatalogo — keyed by `code` ALONE (Q8a), never
 * `${status}:${code}` — US-042's composite would carry a discriminator that
 * discriminates nothing here. The guard reads `COPY`'s own keys — no second
 * list to keep in sync (`dry`). `tag: 'unauthorized'` is intentionally NOT a
 * row: the caller navigates to `/login`, as everywhere else in the app.
 */
export function mensajeDeErrorCatalogo(error: ApiError): string {
  if (error.tag === 'network') {
    return 'No se pudo conectar con el servidor.';
  }
  if (
    error.tag === 'server' &&
    error.code !== undefined &&
    Object.hasOwn(COPY, error.code)
  ) {
    return COPY[error.code as CodigoCatalogo];
  }
  return GENERICO;
}
