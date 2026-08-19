import type { ApiError, ApiResult } from './api-error';
import type { MeDto } from './resumen.types';

export type DraftPerfil = {
  readonly nombre: string;
  readonly email: string;
  readonly passwordActual: string;
  readonly passwordNueva: string;
};

export type PerfilPatch = {
  readonly nombre?: string;
  readonly email?: string;
  readonly passwordActual?: string;
};

export type PasswordPatch = {
  readonly passwordActual: string;
  readonly passwordNueva: string;
};

export type ResultadoGuardado =
  | { readonly tipo: 'sin-cambios' }
  | { readonly tipo: 'falta-password-actual' }
  | { readonly tipo: 'perfil-fallo'; readonly error: ApiError }
  | {
      readonly tipo: 'password-fallo';
      readonly perfilGuardado: boolean;
      readonly error: ApiError;
    }
  | {
      readonly tipo: 'ok';
      readonly perfilGuardado: boolean;
      readonly passwordCambiada: boolean;
    };

/**
 * Builds the PerfilPatch object based on draft comparison against me.
 * PasswordActual is included only when email changes (PERF040-01).
 */
export function construirPerfilPatch(
  draft: DraftPerfil,
  me: MeDto,
): PerfilPatch | undefined {
  const nombreCambio = draft.nombre.trim() !== me.nombre;
  const emailCambio = draft.email.trim() !== (me.email ?? '');

  if (!nombreCambio && !emailCambio) {
    return undefined;
  }

  return {
    ...(nombreCambio ? { nombre: draft.nombre.trim() } : {}),
    ...(emailCambio
      ? { email: draft.email.trim(), passwordActual: draft.passwordActual }
      : {}),
  };
}

/**
 * Orchestrates saving profile and/or changing password (US-044 PR4a, design §1.8).
 * Pure domain logic: IO functions are injected so domain stays decoupled from network.
 */
export async function guardarPerfil(
  draft: DraftPerfil,
  me: MeDto,
  io: {
    patchPerfil: (patch: PerfilPatch) => Promise<ApiResult<void>>;
    patchPassword: (patch: PasswordPatch) => Promise<ApiResult<void>>;
  },
): Promise<ResultadoGuardado> {
  const perfilPatch = construirPerfilPatch(draft, me);
  const cambiaPassword = draft.passwordNueva !== '';

  if (perfilPatch === undefined && !cambiaPassword) {
    return { tipo: 'sin-cambios' };
  }

  if (
    (perfilPatch?.email !== undefined || cambiaPassword) &&
    draft.passwordActual === ''
  ) {
    return { tipo: 'falta-password-actual' };
  }

  let perfilGuardado = false;
  if (perfilPatch !== undefined) {
    const r = await io.patchPerfil(perfilPatch);
    if (!r.ok) {
      return { tipo: 'perfil-fallo', error: r.error };
    }
    perfilGuardado = true;
  }

  if (cambiaPassword) {
    const r = await io.patchPassword({
      passwordActual: draft.passwordActual,
      passwordNueva: draft.passwordNueva,
    });
    if (!r.ok) {
      return { tipo: 'password-fallo', perfilGuardado, error: r.error };
    }
  }

  return { tipo: 'ok', perfilGuardado, passwordCambiada: cambiaPassword };
}
