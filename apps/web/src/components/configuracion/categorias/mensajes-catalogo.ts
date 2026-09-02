import type { ApiError } from '@/api/client';
import type { MatchType } from '@/api/catalogo-constantes';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { etiquetaTransacciones } from './plural';

/**
 * mensajes-catalogo.ts (US-043 design.md §1/Q8, §1/Q6b, WCTG-12, WCTG-07,
 * WCTG-08). Two independent halves in one file: the error table (below) and
 * the dialog-payload translator (`ImpactoCatalogo`/`fraseDeImpacto`, added
 * in PR #3b).
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
 * ETIQUETA_MATCH_TYPE — `MatchType` → UI label (US-043 PR #4, design.md
 * §1/Q9b/D-07). Same shape as `ETIQUETA_BUCKET` (A1): the wire vocabulary
 * (`MATCH_TYPES`, `catalogo-constantes.ts`) stays plain and server-facing;
 * the display label lives here, one `Record` per D-07's table so a new
 * `MatchType` member fails `tsc` until this row is added.
 */
export const ETIQUETA_MATCH_TYPE: Record<MatchType, string> = {
  CONTAINS: 'CONTIENE',
  STARTS_WITH: 'EMPIEZA CON',
  REGEX: 'REGEX',
};

/**
 * CodigoCatalogo — el union literal cerrado de los 11 códigos que el
 * deployed catalog API devuelve (verificado contra
 * `catalogo-http-error.ts`'s propio `_exhaustive: never` guard, design.md
 * §1/Q8a: una clase de error ⇒ exactamente un status ⇒ exactamente un
 * código, ningún código aparece en dos statuses) más `BODY_INVALIDO`. Este
 * último tiene DOS productores reales, no uno: el backend lo emite
 * literalmente (`res.status(400).json({ code: 'BODY_INVALIDO', ... })` en
 * `categorias.routes.ts`/`patrones.routes.ts` cuando `.safeParse()` rechaza
 * el body de una mutación) y el cliente lo produce vía `tag: 'parse'`
 * cuando `fetchCatalogo` recibe un body 2xx que falla la guarda de runtime.
 * Doce miembros en total.
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
  NOMBRE_DUPLICADO: 'Ya tienes una categoría con ese nombre en ese bucket.',
  PATRON_DUPLICADO: 'Ya tienes un patrón con ese texto.',
};

const GENERICO = 'Ocurrió un error inesperado. Intenta nuevamente.';

/**
 * mensajeDeErrorCatalogo — total over `ApiError.tag` (5 members), closed
 * with `const _exhaustive: never` so a sixth tag fails `tsc`. This is a
 * DIFFERENT axis from `COPY`'s totality above (`code`, 12 members) — both
 * guards are needed, neither replaces the other (design's Q8b CORRECTION
 * governs `COPY` only).
 *
 * `code` is keyed ALONE (Q8a), never `${status}:${code}` — US-042's
 * composite would carry a discriminator that discriminates nothing here.
 *
 * - `network` → fixed connection message.
 * - `parse` → `COPY.BODY_INVALIDO`. This is the shape `fetchCatalogo`
 *   actually produces when `esCatalogoDto` rejects a 2xx body (no `code`
 *   field exists on `tag: 'parse'` at all) — before this fix, `parse` fell
 *   through to `GENERICO` and `BODY_INVALIDO` was unreachable dead code.
 * - `server` → `COPY[code]` when `code` is present and a known
 *   `CodigoCatalogo`, else `GENERICO`.
 * - `unauthorized` → `''`, same treatment as `mensajes.ts` (perfil,
 *   WCFG-09): every page lives under the `_authenticated` layout, whose
 *   `beforeLoad` guard (`require-session.ts`) redirects to `/login` on a
 *   401 before any catalog screen renders. No caller wires this function to
 *   the UI yet (that lands with the categories page itself), so this isn't
 *   a today-verified caller interception like `PerfilForm`'s — but it
 *   follows the same app-wide pattern, so a rendered `unauthorized` message
 *   is expected to stay unreachable once wired. `''` keeps the function
 *   total without inventing user-facing copy for a state the user isn't
 *   meant to see.
 * - `invalid` (400 período inválido) → `GENERICO`. This tag belongs to the
 *   dashboard endpoints (`fetchResumen`/`fetchResumenAnual`/
 *   `fetchDetalleBucketMes`, all keyed on `periodo`), not the catalog ones —
 *   no catalog call produces it today. Falling back to `GENERICO` (rather
 *   than a dedicated string) keeps the total switch honest about that: it's
 *   defensive coverage for a tag this module doesn't own, not a real UI
 *   state.
 */
export function mensajeDeErrorCatalogo(error: ApiError): string {
  switch (error.tag) {
    case 'network':
      return 'No se pudo conectar con el servidor.';
    case 'parse':
      return COPY.BODY_INVALIDO;
    case 'server':
      return error.code !== undefined && Object.hasOwn(COPY, error.code)
        ? COPY[error.code as CodigoCatalogo]
        : GENERICO;
    case 'unauthorized':
      return '';
    case 'invalid':
      return GENERICO;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

/**
 * ImpactoCatalogo/fraseDeImpacto — the dialog-payload translator (PR #3b,
 * design.md §1/Q6b, WCTG-07/WCTG-08). `ConfirmarImpactoDialog` (task 28)
 * takes rendered copy and knows nothing about what it's confirming (Q6a,
 * US-042 D-02 applied verbatim) — the branch on `tipo` lives here instead,
 * in a pure function that needs no RTL to test, closed by `const
 * _exhaustive: never = i` so a third payload stops compiling.
 *
 * **The zero case SOFTENS the sentence, it never SKIPS the dialog** — both
 * payloads keep the same `titulo`/`textoConfirmar` at
 * `transaccionesCount === 0`, only `lineas` drops the money-move clause.
 * Skipping would falsify the success criterion "a dirty Bucket cannot be
 * saved without an all-periods impact confirmation" (`EliminarIngestaControl
 * :109-114`'s precedent, applied here).
 */
export type ImpactoCatalogo =
  | {
      readonly tipo: 'eliminar';
      readonly nombre: string;
      readonly transaccionesCount: number;
    }
  | {
      readonly tipo: 'cambiar-bucket';
      readonly nombre: string;
      readonly transaccionesCount: number;
      readonly bucketAnterior: string;
      readonly bucketNuevo: string;
    };

function etiqueta(bucket: string): string {
  return ETIQUETA_BUCKET[bucket] ?? bucket;
}

export function fraseDeImpacto(i: ImpactoCatalogo): {
  readonly titulo: string;
  readonly lineas: readonly string[];
  readonly textoConfirmar: string;
} {
  switch (i.tipo) {
    case 'eliminar': {
      const lineas =
        i.transaccionesCount > 0
          ? [
              `Vas a eliminar «${i.nombre}».`,
              `${etiquetaTransacciones(i.transaccionesCount)} ${i.transaccionesCount === 1 ? 'queda' : 'quedan'} en Sin categoría, en todos los períodos.`,
              'Esta acción no se puede deshacer.',
            ]
          : [
              `Vas a eliminar «${i.nombre}».`,
              'No tiene transacciones asociadas.',
              'Esta acción no se puede deshacer.',
            ];
      return {
        titulo: 'Eliminar categoría',
        lineas,
        textoConfirmar: 'Eliminar',
      };
    }
    case 'cambiar-bucket': {
      const cabecera = `«${i.nombre}» pasa de ${etiqueta(i.bucketAnterior)} a ${etiqueta(i.bucketNuevo)}.`;
      const lineas =
        i.transaccionesCount > 0
          ? [
              cabecera,
              `Esto mueve ${etiquetaTransacciones(i.transaccionesCount)} en TODOS los períodos, incluidos los meses ya cerrados.`,
              'Tu resumen 50/30/20 va a cambiar para esos meses.',
            ]
          : [
              cabecera,
              'No tiene transacciones asociadas, así que no se mueve ningún monto.',
            ];
      return {
        titulo: 'Cambiar el bucket',
        lineas,
        textoConfirmar: 'Cambiar bucket',
      };
    }
    default: {
      const _exhaustive: never = i;
      return _exhaustive;
    }
  }
}
