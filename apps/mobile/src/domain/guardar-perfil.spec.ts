import type { ApiError, ApiResult } from './api-error';
import type { MeDto } from './resumen.types';
import {
  construirPerfilPatch,
  guardarPerfil,
  type DraftPerfil,
} from './guardar-perfil';

const sampleMe: MeDto = {
  userId: 'user-1',
  email: 'test@example.com',
  nombre: 'Juan Pérez',
  esDemo: false,
  googleVinculado: false,
};

describe('guardar-perfil domain (US-044 PR4a)', () => {
  describe('construirPerfilPatch', () => {
    it('returns undefined when neither nombre nor email changed', () => {
      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: 'test@example.com',
        passwordActual: '',
        passwordNueva: '',
      };
      expect(construirPerfilPatch(draft, sampleMe)).toBeUndefined();
    });

    it('returns patch with only trimmed nombre when email is untouched', () => {
      const draft: DraftPerfil = {
        nombre: '  Juan Carlos  ',
        email: 'test@example.com',
        passwordActual: 'secret',
        passwordNueva: '',
      };
      const patch = construirPerfilPatch(draft, sampleMe);
      expect(patch).toEqual({ nombre: 'Juan Carlos' });
      expect(patch?.passwordActual).toBeUndefined();
    });

    it('returns patch with email and passwordActual when email changed', () => {
      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: 'nuevo@example.com',
        passwordActual: 'mypassword',
        passwordNueva: '',
      };
      const patch = construirPerfilPatch(draft, sampleMe);
      expect(patch).toEqual({
        email: 'nuevo@example.com',
        passwordActual: 'mypassword',
      });
      expect(patch?.nombre).toBeUndefined();
    });

    it('returns patch with both nombre and email when both changed', () => {
      const draft: DraftPerfil = {
        nombre: 'Pedro',
        email: 'pedro@example.com',
        passwordActual: 'mypassword',
        passwordNueva: '',
      };
      const patch = construirPerfilPatch(draft, sampleMe);
      expect(patch).toEqual({
        nombre: 'Pedro',
        email: 'pedro@example.com',
        passwordActual: 'mypassword',
      });
    });
  });

  describe('construirPerfilPatch — demo account (me.email = null)', () => {
    const demoMe: MeDto = { ...sampleMe, email: null };

    it('returns undefined when draft.email is empty string (unchanged for null email)', () => {
      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: '',
        passwordActual: '',
        passwordNueva: '',
      };
      expect(construirPerfilPatch(draft, demoMe)).toBeUndefined();
    });

    it('includes email and passwordActual in patch when draft.email is non-empty', () => {
      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: 'nuevo@x.com',
        passwordActual: 'secret',
        passwordNueva: '',
      };
      const patch = construirPerfilPatch(draft, demoMe);
      expect(patch).toEqual({
        email: 'nuevo@x.com',
        passwordActual: 'secret',
      });
      expect(patch?.nombre).toBeUndefined();
    });
  });

  describe('guardarPerfil orchestration', () => {
    it('returns sin-cambios and makes zero IO calls when no fields changed', async () => {
      const mockPatchPerfil = jest.fn();
      const mockPatchPassword = jest.fn();

      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: 'test@example.com',
        passwordActual: '',
        passwordNueva: '',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({ tipo: 'sin-cambios' });
      expect(mockPatchPerfil).not.toHaveBeenCalled();
      expect(mockPatchPassword).not.toHaveBeenCalled();
    });

    it('returns falta-password-actual when email changed but passwordActual is empty', async () => {
      const mockPatchPerfil = jest.fn();
      const mockPatchPassword = jest.fn();

      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: 'nuevo@example.com',
        passwordActual: '',
        passwordNueva: '',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({ tipo: 'falta-password-actual' });
      expect(mockPatchPerfil).not.toHaveBeenCalled();
      expect(mockPatchPassword).not.toHaveBeenCalled();
    });

    it('returns falta-password-actual when passwordNueva is set but passwordActual is empty', async () => {
      const mockPatchPerfil = jest.fn();
      const mockPatchPassword = jest.fn();

      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: 'test@example.com',
        passwordActual: '',
        passwordNueva: 'newsecret123',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({ tipo: 'falta-password-actual' });
      expect(mockPatchPerfil).not.toHaveBeenCalled();
      expect(mockPatchPassword).not.toHaveBeenCalled();
    });

    it('performs only patchPerfil for nombre-only change and succeeds without passwordActual', async () => {
      const mockPatchPerfil = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: true, value: undefined });
      const mockPatchPassword = jest.fn();

      const draft: DraftPerfil = {
        nombre: 'Nuevo Nombre',
        email: 'test@example.com',
        passwordActual: '',
        passwordNueva: '',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({
        tipo: 'ok',
        perfilGuardado: true,
        passwordCambiada: false,
      });
      expect(mockPatchPerfil).toHaveBeenCalledTimes(1);
      expect(mockPatchPerfil).toHaveBeenCalledWith({ nombre: 'Nuevo Nombre' });
      expect(mockPatchPassword).not.toHaveBeenCalled();
    });

    it('aborts sequence when patchPerfil fails — patchPassword is never called (MCFG-03)', async () => {
      const networkError: ApiError = { tag: 'network' };
      const mockPatchPerfil = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: false, error: networkError });
      const mockPatchPassword = jest.fn();

      const draft: DraftPerfil = {
        nombre: 'Nuevo Nombre',
        email: 'test@example.com',
        passwordActual: 'secret',
        passwordNueva: 'newsecret123',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({
        tipo: 'perfil-fallo',
        error: networkError,
      });
      expect(mockPatchPerfil).toHaveBeenCalledTimes(1);
      expect(mockPatchPassword).not.toHaveBeenCalled();
    });

    it('returns password-fallo with perfilGuardado: true when profile succeeds but password fails', async () => {
      const authError: ApiError = { tag: 'unauthorized' };
      const mockPatchPerfil = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: true, value: undefined });
      const mockPatchPassword = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: false, error: authError });

      const draft: DraftPerfil = {
        nombre: 'Nuevo Nombre',
        email: 'test@example.com',
        passwordActual: 'secret',
        passwordNueva: 'newsecret123',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({
        tipo: 'password-fallo',
        perfilGuardado: true,
        error: authError,
      });
      expect(mockPatchPerfil).toHaveBeenCalledTimes(1);
      expect(mockPatchPassword).toHaveBeenCalledTimes(1);
      expect(mockPatchPassword).toHaveBeenCalledWith({
        passwordActual: 'secret',
        passwordNueva: 'newsecret123',
      });
    });

    it('returns password-fallo with perfilGuardado: false when only password was dirty and failed', async () => {
      const serverError: ApiError = {
        tag: 'http',
        status: 400,
        code: 'PASSWORD_INVALIDA',
      };
      const mockPatchPerfil = jest.fn();
      const mockPatchPassword = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: false, error: serverError });

      const draft: DraftPerfil = {
        nombre: 'Juan Pérez',
        email: 'test@example.com',
        passwordActual: 'secret',
        passwordNueva: 'short',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({
        tipo: 'password-fallo',
        perfilGuardado: false,
        error: serverError,
      });
      expect(mockPatchPerfil).not.toHaveBeenCalled();
      expect(mockPatchPassword).toHaveBeenCalledTimes(1);
    });

    it('returns ok with both perfilGuardado: true and passwordCambiada: true on full success', async () => {
      const mockPatchPerfil = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: true, value: undefined });
      const mockPatchPassword = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: true, value: undefined });

      const draft: DraftPerfil = {
        nombre: 'Nuevo Nombre',
        email: 'nuevo@example.com',
        passwordActual: 'secret',
        passwordNueva: 'newsecret123',
      };

      const result = await guardarPerfil(draft, sampleMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({
        tipo: 'ok',
        perfilGuardado: true,
        passwordCambiada: true,
      });
      expect(mockPatchPerfil).toHaveBeenCalledTimes(1);
      expect(mockPatchPassword).toHaveBeenCalledTimes(1);
    });

    it('handles idempotent retry after partial failure against updated me', async () => {
      const mockPatchPerfil = jest.fn();
      const mockPatchPassword = jest
        .fn<Promise<ApiResult<void>>, [any]>()
        .mockResolvedValue({ ok: true, value: undefined });

      const draft: DraftPerfil = {
        nombre: 'Nuevo Nombre',
        email: 'test@example.com',
        passwordActual: 'secret',
        passwordNueva: 'newsecret123',
      };

      const updatedMe: MeDto = {
        ...sampleMe,
        nombre: 'Nuevo Nombre',
      };

      const result = await guardarPerfil(draft, updatedMe, {
        patchPerfil: mockPatchPerfil,
        patchPassword: mockPatchPassword,
      });

      expect(result).toEqual({
        tipo: 'ok',
        perfilGuardado: false,
        passwordCambiada: true,
      });
      expect(mockPatchPerfil).not.toHaveBeenCalled();
      expect(mockPatchPassword).toHaveBeenCalledTimes(1);
    });
  });
});
