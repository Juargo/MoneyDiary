import type { ApiError } from './api-error';
import { copiaPorApiError } from './api-error';
import type { ResultadoGuardado } from './guardar-perfil';
import {
  mensajeDeApiError,
  mensajeDeResultado,
  MENSAJE_DEMO_SOLO_LECTURA,
  type CodigoPerfil,
} from './mensajes-perfil';

describe('mensajes-perfil domain (US-044 PR4a)', () => {
  describe('mensajeDeApiError', () => {
    it.each([
      { tag: 'network' as const },
      { tag: 'unauthorized' as const },
      { tag: 'parse' as const },
    ])(
      'resolves transport error $tag via copiaPorApiError (D-08)',
      ({ tag }) => {
        const error: ApiError = { tag };
        expect(mensajeDeApiError(error, 'perfil')).toBe(
          copiaPorApiError(error),
        );
      },
    );

    it('returns exact message for 403 PERFIL_RECHAZADO with perfil origin (anti-enumeration)', () => {
      const error: ApiError = {
        tag: 'http',
        status: 403,
        code: 'PERFIL_RECHAZADO',
      };
      // Must be byte-identical string regardless of whether email was taken or password was wrong
      expect(mensajeDeApiError(error, 'perfil')).toBe(
        'No se pudieron guardar los cambios. Revisa tu password actual y el email.',
      );
    });

    it('returns exact message for 403 PERFIL_RECHAZADO with password origin', () => {
      const error: ApiError = {
        tag: 'http',
        status: 403,
        code: 'PERFIL_RECHAZADO',
      };
      expect(mensajeDeApiError(error, 'password')).toBe(
        'No se pudo cambiar la password. Revisa tu password actual.',
      );
    });

    it('returns exact message for 400 NOMBRE_INVALIDO', () => {
      const error: ApiError = {
        tag: 'http',
        status: 400,
        code: 'NOMBRE_INVALIDO',
      };
      expect(mensajeDeApiError(error, 'perfil')).toBe(
        'El nombre debe tener entre 1 y 80 caracteres.',
      );
    });

    it('returns exact message for 400 EMAIL_INVALIDO', () => {
      const error: ApiError = {
        tag: 'http',
        status: 400,
        code: 'EMAIL_INVALIDO',
      };
      expect(mensajeDeApiError(error, 'perfil')).toBe('El email no es válido.');
    });

    it('returns exact message for 400 PASSWORD_INVALIDA', () => {
      const error: ApiError = {
        tag: 'http',
        status: 400,
        code: 'PASSWORD_INVALIDA',
      };
      expect(mensajeDeApiError(error, 'password')).toBe(
        'La password nueva no cumple los requisitos mínimos.',
      );
    });

    it('returns MENSAJE_DEMO_SOLO_LECTURA for 403 DEMO_SOLO_LECTURA', () => {
      const error: ApiError = {
        tag: 'http',
        status: 403,
        code: 'DEMO_SOLO_LECTURA',
      };
      expect(mensajeDeApiError(error, 'perfil')).toBe(
        MENSAJE_DEMO_SOLO_LECTURA,
      );
      expect(MENSAJE_DEMO_SOLO_LECTURA).toBe(
        'Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.',
      );
    });

    it('falls back to generic error message on unknown server code', () => {
      const error: ApiError = {
        tag: 'http',
        status: 500,
        code: 'INTERNAL_ERROR',
      };
      expect(mensajeDeApiError(error, 'perfil')).toBe(
        'Ocurrió un error inesperado. Intenta nuevamente.',
      );
    });

    it('falls back to generic error message when code is undefined', () => {
      const error: ApiError = {
        tag: 'http',
        status: 500,
      };
      expect(mensajeDeApiError(error, 'password')).toBe(
        'Ocurrió un error inesperado. Intenta nuevamente.',
      );
    });
  });

  describe('mensajeDeResultado', () => {
    it('returns sin-cambios copy with tono ok', () => {
      const r: ResultadoGuardado = { tipo: 'sin-cambios' };
      expect(mensajeDeResultado(r)).toEqual({
        tono: 'ok',
        lineas: ['No hay cambios para guardar.'],
      });
    });

    it('returns falta-password-actual copy with tono error', () => {
      const r: ResultadoGuardado = { tipo: 'falta-password-actual' };
      expect(mensajeDeResultado(r)).toEqual({
        tono: 'error',
        lineas: ['Ingresa tu password actual.'],
      });
    });

    it('returns single error line for perfil-fallo', () => {
      const r: ResultadoGuardado = {
        tipo: 'perfil-fallo',
        error: { tag: 'http', status: 400, code: 'NOMBRE_INVALIDO' },
      };
      expect(mensajeDeResultado(r)).toEqual({
        tono: 'error',
        lineas: ['El nombre debe tener entre 1 y 80 caracteres.'],
      });
    });

    it('returns single error line for password-fallo when perfil was not saved', () => {
      const r: ResultadoGuardado = {
        tipo: 'password-fallo',
        perfilGuardado: false,
        error: { tag: 'http', status: 400, code: 'PASSWORD_INVALIDA' },
      };
      expect(mensajeDeResultado(r)).toEqual({
        tono: 'error',
        lineas: ['La password nueva no cumple los requisitos mínimos.'],
      });
    });

    it('returns two error lines for password-fallo when perfil was saved', () => {
      const r: ResultadoGuardado = {
        tipo: 'password-fallo',
        perfilGuardado: true,
        error: { tag: 'http', status: 400, code: 'PASSWORD_INVALIDA' },
      };
      expect(mensajeDeResultado(r)).toEqual({
        tono: 'error',
        lineas: [
          'Se guardaron tus datos, pero no se pudo cambiar la password.',
          'La password nueva no cumple los requisitos mínimos.',
        ],
      });
    });

    it('returns session-revocation warning when password was changed (R6)', () => {
      const r: ResultadoGuardado = {
        tipo: 'ok',
        perfilGuardado: true,
        passwordCambiada: true,
      };
      expect(mensajeDeResultado(r)).toEqual({
        tono: 'ok',
        lineas: ['Cambios guardados. Se cerraron tus otras sesiones.'],
      });
    });

    it('returns standard success line when password was not changed', () => {
      const r: ResultadoGuardado = {
        tipo: 'ok',
        perfilGuardado: true,
        passwordCambiada: false,
      };
      expect(mensajeDeResultado(r)).toEqual({
        tono: 'ok',
        lineas: ['Cambios guardados.'],
      });
    });
  });

  describe('CodigoPerfil union boundaries (design §1.9)', () => {
    it('Google-only codes are excluded from CodigoPerfil at compile time (T4a.3)', () => {
      // Positive runtime case: a real CodigoPerfil code resolves to the expected copy.
      expect(
        mensajeDeApiError(
          { tag: 'http', status: 400, code: 'NOMBRE_INVALIDO' },
          'perfil',
        ),
      ).toBe('El nombre debe tener entre 1 y 80 caracteres.');

      // Compile-time absence proofs: each line below MUST trigger a TypeScript error.
      // If any @ts-expect-error is NOT followed by an actual error, tsc itself fails —
      // that is the point of the test (T4a.3, design §1.9).

      // @ts-expect-error — VINCULO_REQUIERE_PASSWORD is Google-only, not in CodigoPerfil
      const _a: CodigoPerfil = 'VINCULO_REQUIERE_PASSWORD';
      // @ts-expect-error — GOOGLE_YA_VINCULADO is Google-only, not in CodigoPerfil
      const _b: CodigoPerfil = 'GOOGLE_YA_VINCULADO';
      // @ts-expect-error — GOOGLE_NO_DISPONIBLE is Google-only, not in CodigoPerfil
      const _c: CodigoPerfil = 'GOOGLE_NO_DISPONIBLE';

      // Suppress unused-variable warnings without touching the type check above
      void _a;
      void _b;
      void _c;
    });
  });
});
