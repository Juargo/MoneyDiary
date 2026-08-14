import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from './client';
import { postDesvincularGoogle, postVincularGoogle } from './perfil';
import { ME_QUERY_KEY } from './use-me';

/**
 * useVincularGoogle — `useMutation` para `POST /api/perfil/google/vincular`
 * (VINC041-01, US-042 design.md §1/Q9c). En éxito NAVEGA fuera de la app vía
 * `window.location.assign(urlAutorizacion)` — un MÉTODO, deliberadamente, no
 * `window.location.href = urlAutorizacion`: jsdom no permite reemplazar
 * `window.location` por asignación, pero sí permite espiar un método
 * (`vi.spyOn`) — es una decisión de testabilidad, no de estilo.
 *
 * No invalida `['auth-me']`: la navegación es un full document load, así que
 * `_authenticated.tsx`'s `beforeLoad` vuelve a primar la identidad
 * post-vínculo cuando el callback redirige de vuelta (design.md §1/Q6c) — un
 * invalidate acá gastaría un round trip que la propia navegación ya hace
 * innecesario.
 *
 * `mutationFn` lanza `result.error` en falla (idioma `useEliminarIngesta`):
 * a diferencia de `useGuardarPerfil`, acá solo hay UN desenlace de falla, no
 * un parcial que necesite ser un valor de primera clase (D-03 no aplica).
 */
export function useVincularGoogle() {
  return useMutation<void, ApiError, string>({
    mutationFn: async (passwordActual) => {
      const r = await postVincularGoogle(passwordActual);
      if (!r.ok) {
        throw r.error;
      }
      window.location.assign(r.value.urlAutorizacion);
    },
  });
}

/**
 * useDesvincularGoogle — `useMutation` para
 * `POST /api/perfil/google/desvincular` (VINC041-06). A diferencia del link,
 * esto NO navega — invalida `['auth-me']` en éxito para que el pill pase a
 * "No vinculada" sin un refresh manual. El mensaje "Desvinculaste tu cuenta
 * de Google." (WCFG-09) lo decide el CALLER (`GoogleVinculoSection`) en su
 * propio `onSuccess`, no este hook (SRP: el hook orquesta la mutación e
 * invalida, no posee copy — mismo reparto de responsabilidad que
 * `useGuardarPerfil`/`mensajes.ts`).
 */
export function useDesvincularGoogle() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (passwordActual) => {
      const r = await postDesvincularGoogle(passwordActual);
      if (!r.ok) {
        throw r.error;
      }
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}
