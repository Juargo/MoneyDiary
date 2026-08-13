import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from './client';
import { patchPassword, patchPerfil } from './perfil';
import type { PerfilPatch } from './perfil';
import { ME_QUERY_KEY } from './use-me';
import type { MeDto } from './types';

/**
 * ResultadoGuardado — el resultado modelado de un submit de `Guardar
 * cambios` (US-042 design.md §1/Q2d, CORRECTION). El `mutationFn` de
 * `useGuardarPerfil` RESUELVE esta unión para todo desenlace conocido y
 * rechaza SOLO ante un throw genuinamente no modelado (un bug) — nunca
 * lanza `error` para transportar buenas noticias parciales
 * (`password-fallo` con `perfilGuardado: true` es un éxito parcial, no una
 * excepción).
 *
 * Declarado antes que la orquestación misma (4.6/4.7) porque
 * `components/configuracion/mensajes.ts` (4.3) necesita el tipo para su
 * propia firma total (`mensajeDeResultado`) — sequencing tipo-primero
 * (design.md D-07).
 */
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

/** El borrador editable del formulario — nunca sale de `PerfilForm` (design.md §1/Q1b). */
export type DraftPerfil = {
  readonly nombre: string;
  readonly email: string;
  readonly passwordActual: string;
  readonly passwordNueva: string;
};

/**
 * construirPerfilPatch — Q2a: "qué cuenta como cambio", en un solo lugar.
 * `undefined` ⇒ ningún llamado a `PATCH /api/perfil`. `passwordActual` viaja
 * en el patch SOLO cuando `email` cambia (PERF040-01: un cambio de solo
 * `nombre` NO debe exigirla — mandar un string vacío fallaría la validación
 * server-side para nada).
 *
 * Comparado contra la caché de la query (`me`, leído en el `mutationFn` al
 * momento del submit — NUNCA un snapshot de montaje), no contra un estado
 * guardado en este componente. Es la pieza que hace idempotente el retry
 * tras una falla parcial (row 11 de Q2c): tras invalidar+refetch, `me` ya
 * trae el nombre/email nuevos, así que el segundo submit los ve "limpios"
 * sin código de reset explícito.
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
 * guardar — la orquestación completa (design.md §1/Q2b), verbatim. "Un
 * click = uno o dos calls" SIN máquina de estados: la secuencia ES el
 * estado — el orden forzado es el orden físico de los dos bloques, el
 * aborto es el primer `return`. Invertir el orden exigiría mover un bloque
 * entero, que es justo lo que la prueba de orden (Q9a) detecta.
 *
 * El chequeo local `falta-password-actual` es sobre la propia entrada del
 * usuario (form-completeness), no una adivinanza sobre la respuesta del
 * servidor — no viola el anti-enumeration constraint (PERF040-04), que es
 * sobre nunca NOMBRAR una causa de rechazo del servidor.
 */
async function guardar(
  draft: DraftPerfil,
  me: MeDto,
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
    const r = await patchPerfil(perfilPatch);
    if (!r.ok) {
      return { tipo: 'perfil-fallo', error: r.error }; // ← ABORT: password NUNCA se llama
    }
    perfilGuardado = true;
  }

  if (cambiaPassword) {
    const r = await patchPassword({
      passwordActual: draft.passwordActual,
      passwordNueva: draft.passwordNueva,
    });
    if (!r.ok) {
      return { tipo: 'password-fallo', perfilGuardado, error: r.error };
    }
  }

  return { tipo: 'ok', perfilGuardado, passwordCambiada: cambiaPassword };
}

/**
 * useGuardarPerfil — el `useMutation` que expone `guardar` a `PerfilForm`
 * (design.md §1/Q2d). `mutationFn` lee `me` DIRECTO de la caché de
 * `['auth-me']` en el momento del submit (nunca de una prop/closure del
 * componente) — es la garantía física de que Q2a compara contra la caché,
 * no contra un snapshot capturado en el render. `me` ausente no debería ser
 * alcanzable (WCFG-01/03 garantizan que `beforeLoad` la primó antes de que
 * esta página exista); si ocurre, es un bug genuino y por eso se lanza (cae
 * en `mutation.error`, nunca en `ResultadoGuardado`).
 *
 * Política de caché en `onSuccess`, no en la secuencia (SRP): la secuencia
 * orquesta dos llamadas HTTP, el hook es dueño de la invalidación. Invalida
 * `['auth-me']` en CUALQUIER `perfilGuardado` (row 5/9/11) — incluido un
 * `password-fallo` con `perfilGuardado: true`, porque la identidad
 * realmente cambió. Un éxito solo-password (`perfilGuardado: false`) no
 * invalida nada: ningún campo de `MeDto` cambió, invalidar gastaría un
 * round trip para traer un payload idéntico.
 */
export function useGuardarPerfil() {
  const queryClient = useQueryClient();

  return useMutation<ResultadoGuardado, Error, DraftPerfil>({
    mutationFn: async (draft) => {
      const me = queryClient.getQueryData<MeDto>(ME_QUERY_KEY);
      if (me === undefined) {
        throw new Error(
          'useGuardarPerfil: identidad no primada en la caché — no debería ser alcanzable (WCFG-03).',
        );
      }
      return guardar(draft, me);
    },
    onSuccess: (r) => {
      const identidadCambio =
        (r.tipo === 'ok' && r.perfilGuardado) ||
        (r.tipo === 'password-fallo' && r.perfilGuardado);
      if (identidadCambio) {
        return queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      }
    },
  });
}
