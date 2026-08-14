import type { ApiError } from '@/api/client';
import type { ResultadoGuardado } from '@/api/use-guardar-perfil';

/**
 * mensajes.ts — la tabla cerrada de copy + los dos traductores totales
 * (US-042 design.md §1/Q8c, WCFG-09). Ningún mensaje se deriva de
 * `error.message`/`body.message` del servidor — cada string es una
 * constante del cliente elegida por `status + code` (design.md D-04, el
 * anti-enumeration constraint de PERF040-04: "wrong password" y "that email
 * belongs to someone else" son byte-idénticos y esta tabla los mantiene
 * así).
 *
 * `mensajeDeResultado` cierra con `const _exhaustive: never = r` — agregar
 * un miembro a `ResultadoGuardado` sin agregar su fila acá deja de
 * compilar (mismo idioma que `aPerfilHttpError` del lado del API).
 * `mensajeDeApiError` NO necesita el mismo guard: es un helper interno,
 * `ApiError` no crece dentro de este cambio.
 */

export type Mensaje = {
  readonly tono: 'ok' | 'error';
  readonly lineas: readonly string[];
};

const GENERICO = 'Ocurrió un error inesperado. Intenta nuevamente.';

/**
 * MENSAJE_DEMO_SOLO_LECTURA — copy verbatim de WCFG-09/design.md §Q9c,
 * exportada porque `PerfilForm` la necesita DOS veces: reactivamente (acá,
 * como fila de `mensajeDeServerError`, cuando el 403 `DEMO_SOLO_LECTURA`
 * llega del servidor) y proactivamente (el `role="note"` que deshabilita el
 * form antes de que el usuario intente guardar). Una sola constante evita
 * que las dos copias diverjan (`dry`).
 */
export const MENSAJE_DEMO_SOLO_LECTURA =
  'Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.';

/**
 * mensajeDeServerError — la tabla de ocho códigos (Q8a/Q8b), cerrada sobre
 * `status + code`. `origen` distingue las dos únicas filas que lo
 * necesitan (`PERFIL_RECHAZADO` en el llamado de perfil vs. el de
 * password, filas 6/7 de Q2c) — es un parámetro, no dos funciones casi
 * idénticas que divergirían con el tiempo (`dry`).
 */
function mensajeDeServerError(
  error: Extract<ApiError, { tag: 'server' }>,
  origen: 'perfil' | 'password' | 'google',
): string {
  const clave = `${error.status}:${error.code ?? ''}`;
  switch (clave) {
    case '403:PERFIL_RECHAZADO':
      // Apply-time addition (PR #2, task 5.5): VINC041-07 maps a wrong
      // `passwordActual` on link/unlink to the SAME `PerfilRechazadoError` →
      // `403 PERFIL_RECHAZADO` that `perfil-usuario` uses — design.md §1/Q8b's
      // table only rows the `perfil`/`password` origins for this code, not
      // `google`. Falling through to the `perfil` row's "...y el email." would
      // reference a field ConfirmarPasswordDialog never shows. A third,
      // origen-specific line closes the gap without naming which of link/
      // unlink failed (anti-enumeration, PERF040-04, still honoured).
      if (origen === 'google') {
        return 'No se pudo completar la acción. Revisa tu password actual.';
      }
      return origen === 'password'
        ? 'No se pudo cambiar la password. Revisa tu password actual.'
        : 'No se pudieron guardar los cambios. Revisa tu password actual y el email.';
    case '400:NOMBRE_INVALIDO':
      return 'El nombre debe tener entre 1 y 80 caracteres.';
    case '400:EMAIL_INVALIDO':
      return 'El email no es válido.';
    case '400:PASSWORD_INVALIDA':
      return 'La password nueva no cumple los requisitos mínimos.';
    case '403:DEMO_SOLO_LECTURA':
      return MENSAJE_DEMO_SOLO_LECTURA;
    case '403:VINCULO_REQUIERE_PASSWORD':
      return 'No puedes desvincular Google sin una password en tu cuenta.';
    case '409:GOOGLE_YA_VINCULADO':
      return 'Tu cuenta ya tiene Google vinculado.';
    case '503:GOOGLE_NO_DISPONIBLE':
      return 'El ingreso con Google no está disponible por ahora. Intenta más tarde.';
    default:
      return GENERICO;
  }
}

/**
 * mensajeDeApiError — total sobre los tags de `ApiError` que este cambio
 * consume. `'unauthorized'` devuelve `''` deliberadamente: WCFG-09 no le
 * asigna copy ("no message" — `navigate({ to: '/login' })` en su lugar), y
 * el caller (`PerfilForm`) intercepta ese tag ANTES de llamar a esta
 * función, así que la cadena vacía nunca llega a renderizarse — existe
 * solo para que la función sea total sobre el tipo.
 */
export function mensajeDeApiError(
  error: ApiError,
  origen: 'perfil' | 'password' | 'google',
): string {
  switch (error.tag) {
    case 'network':
      return 'No se pudo conectar con el servidor.';
    case 'unauthorized':
      return '';
    case 'parse':
    case 'invalid':
      return GENERICO;
    case 'server':
      return mensajeDeServerError(error, origen);
  }
}

/**
 * mensajeDeResultado — total sobre `ResultadoGuardado` (Q2c). El copy de
 * cada fila está tomado verbatim de design.md §1/Q2c y §1/Q8b.
 */
export function mensajeDeResultado(r: ResultadoGuardado): Mensaje {
  switch (r.tipo) {
    case 'sin-cambios':
      return { tono: 'ok', lineas: ['No hay cambios para guardar.'] };
    case 'falta-password-actual':
      return { tono: 'error', lineas: ['Ingresa tu password actual.'] };
    case 'perfil-fallo':
      return {
        tono: 'error',
        lineas: [mensajeDeApiError(r.error, 'perfil')],
      };
    case 'password-fallo':
      return r.perfilGuardado
        ? {
            tono: 'error',
            lineas: [
              'Se guardaron tus datos, pero no se pudo cambiar la password.',
              mensajeDeApiError(r.error, 'password'),
            ],
          }
        : { tono: 'error', lineas: [mensajeDeApiError(r.error, 'password')] };
    case 'ok':
      return {
        tono: 'ok',
        lineas: [
          r.passwordCambiada
            ? 'Cambios guardados. Se cerraron tus otras sesiones.'
            : 'Cambios guardados.',
        ],
      };
    default: {
      const _exhaustive: never = r;
      return _exhaustive;
    }
  }
}
