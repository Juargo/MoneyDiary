import type { ApiError } from './api-error';
import { copiaPorApiError } from './api-error';
import type { ResultadoGuardado } from './guardar-perfil';

export type Mensaje = {
  readonly tono: 'ok' | 'error';
  readonly lineas: readonly string[];
};

export type CodigoPerfil =
  | 'PERFIL_RECHAZADO'
  | 'NOMBRE_INVALIDO'
  | 'EMAIL_INVALIDO'
  | 'PASSWORD_INVALIDA'
  | 'DEMO_SOLO_LECTURA';

export const MENSAJE_DEMO_SOLO_LECTURA =
  'Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.';

const GENERICO = 'Ocurrió un error inesperado. Intenta nuevamente.';

function mensajeDeServerError(
  error: Extract<ApiError, { tag: 'http' }>,
  origen: 'perfil' | 'password',
): string {
  const clave = `${error.status}:${error.code ?? ''}`;
  switch (clave) {
    case '403:PERFIL_RECHAZADO':
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
    default:
      return GENERICO;
  }
}

/**
 * Resolves ApiError to a localized user-facing message (US-044 PR4a, design §1.7).
 * Transport errors resolve via mobile's copiaPorApiError; http codes resolve via the closed table.
 */
export function mensajeDeApiError(
  error: ApiError,
  origen: 'perfil' | 'password',
): string {
  if (error.tag !== 'http') {
    return copiaPorApiError(error);
  }
  return mensajeDeServerError(error, origen);
}

/**
 * Translates ResultadoGuardado into a typed Mensaje with tono and lines (US-044 PR4a, design §1.7).
 * Exhaustively checked over ResultadoGuardado union.
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
        : {
            tono: 'error',
            lineas: [mensajeDeApiError(r.error, 'password')],
          };
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
