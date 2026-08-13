import { describe, expect, it } from 'vitest';
import type { ApiError } from '@/api/client';
import { mensajeDeApiError, mensajeDeResultado } from './mensajes';
import type { ResultadoGuardado } from '@/api/use-guardar-perfil';

function server(status: number, code?: string): ApiError {
  return {
    tag: 'server',
    status,
    code,
    message: 'irrelevante — nunca se renderiza (D-04)',
  };
}

describe('mensajeDeApiError — la tabla de ocho códigos (WCFG-09 / design Q8b)', () => {
  it.each<[string, ApiError, 'perfil' | 'password' | 'google', string]>([
    [
      '403 PERFIL_RECHAZADO, origen perfil',
      server(403, 'PERFIL_RECHAZADO'),
      'perfil',
      'No se pudieron guardar los cambios. Revisa tu password actual y el email.',
    ],
    [
      '403 PERFIL_RECHAZADO, origen password',
      server(403, 'PERFIL_RECHAZADO'),
      'password',
      'No se pudo cambiar la password. Revisa tu password actual.',
    ],
    [
      '400 NOMBRE_INVALIDO',
      server(400, 'NOMBRE_INVALIDO'),
      'perfil',
      'El nombre debe tener entre 1 y 80 caracteres.',
    ],
    [
      '400 EMAIL_INVALIDO',
      server(400, 'EMAIL_INVALIDO'),
      'perfil',
      'El email no es válido.',
    ],
    [
      '400 PASSWORD_INVALIDA',
      server(400, 'PASSWORD_INVALIDA'),
      'password',
      'La password nueva no cumple los requisitos mínimos.',
    ],
    [
      '403 DEMO_SOLO_LECTURA',
      server(403, 'DEMO_SOLO_LECTURA'),
      'perfil',
      'Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.',
    ],
    [
      '403 VINCULO_REQUIERE_PASSWORD',
      server(403, 'VINCULO_REQUIERE_PASSWORD'),
      'google',
      'No puedes desvincular Google sin una password en tu cuenta.',
    ],
    [
      '409 GOOGLE_YA_VINCULADO',
      server(409, 'GOOGLE_YA_VINCULADO'),
      'google',
      'Tu cuenta ya tiene Google vinculado.',
    ],
    [
      '503 GOOGLE_NO_DISPONIBLE',
      server(503, 'GOOGLE_NO_DISPONIBLE'),
      'google',
      'El ingreso con Google no está disponible por ahora. Intenta más tarde.',
    ],
    [
      'network',
      { tag: 'network', message: 'x' },
      'perfil',
      'No se pudo conectar con el servidor.',
    ],
    [
      'un código de servidor no mapeado cae al genérico',
      server(418, 'ALGO_NUEVO'),
      'perfil',
      'Ocurrió un error inesperado. Intenta nuevamente.',
    ],
    [
      'un server sin code (p.ej. body no parseable) cae al genérico',
      server(500, undefined),
      'perfil',
      'Ocurrió un error inesperado. Intenta nuevamente.',
    ],
    [
      'parse',
      { tag: 'parse', message: 'x' },
      'perfil',
      'Ocurrió un error inesperado. Intenta nuevamente.',
    ],
    [
      'invalid',
      { tag: 'invalid', message: 'x' },
      'perfil',
      'Ocurrió un error inesperado. Intenta nuevamente.',
    ],
  ])('%s', (_nombre, error, origen, esperado) => {
    expect(mensajeDeApiError(error, origen)).toBe(esperado);
  });
});

describe('mensajeDeResultado — total sobre ResultadoGuardado (Q2c)', () => {
  it('sin-cambios → tono ok, "No hay cambios para guardar."', () => {
    const r: ResultadoGuardado = { tipo: 'sin-cambios' };
    expect(mensajeDeResultado(r)).toEqual({
      tono: 'ok',
      lineas: ['No hay cambios para guardar.'],
    });
  });

  it('falta-password-actual → tono error, "Ingresa tu password actual."', () => {
    const r: ResultadoGuardado = { tipo: 'falta-password-actual' };
    expect(mensajeDeResultado(r)).toEqual({
      tono: 'error',
      lineas: ['Ingresa tu password actual.'],
    });
  });

  it('perfil-fallo → tono error, una línea vía mensajeDeApiError origen perfil', () => {
    const r: ResultadoGuardado = {
      tipo: 'perfil-fallo',
      error: server(403, 'PERFIL_RECHAZADO'),
    };
    expect(mensajeDeResultado(r)).toEqual({
      tono: 'error',
      lineas: [
        'No se pudieron guardar los cambios. Revisa tu password actual y el email.',
      ],
    });
  });

  it('password-fallo con perfilGuardado=false → una sola línea', () => {
    const r: ResultadoGuardado = {
      tipo: 'password-fallo',
      perfilGuardado: false,
      error: server(403, 'PERFIL_RECHAZADO'),
    };
    expect(mensajeDeResultado(r)).toEqual({
      tono: 'error',
      lineas: ['No se pudo cambiar la password. Revisa tu password actual.'],
    });
  });

  it('password-fallo con perfilGuardado=true → dos líneas, la primera anuncia el guardado parcial', () => {
    const r: ResultadoGuardado = {
      tipo: 'password-fallo',
      perfilGuardado: true,
      error: server(403, 'PERFIL_RECHAZADO'),
    };
    expect(mensajeDeResultado(r)).toEqual({
      tono: 'error',
      lineas: [
        'Se guardaron tus datos, pero no se pudo cambiar la password.',
        'No se pudo cambiar la password. Revisa tu password actual.',
      ],
    });
  });

  it('ok sin cambio de password → "Cambios guardados."', () => {
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

  it('ok con cambio de password → menciona el cierre de otras sesiones', () => {
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
});
