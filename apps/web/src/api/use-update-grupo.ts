import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { GrupoPresupuesto, ListTransaccionesResponse } from './types'
import { updateTransaccionGrupo } from './transacciones'
import { transaccionesQueryKey } from './use-transacciones'

const grupoLabels: Record<GrupoPresupuesto, string> = {
  Ingresos: 'Ingreso',
  Necesidades: 'Necesidades',
  Gustos: 'Gustos',
  Ahorro: 'Ahorro',
  SinCategorizar: 'Sin categorizar',
}

export function useUpdateGrupo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; grupo: GrupoPresupuesto }) =>
      updateTransaccionGrupo(input),

    // Optimistic update: ajusta la categoria del row al instante.
    // No invalidamos al terminar — confiamos en el optimistic. Si el PATCH
    // falla, onError revierte. Así no hay parpadeo ni delay de refetch.
    onMutate: async ({ id, grupo }) => {
      await queryClient.cancelQueries({ queryKey: transaccionesQueryKey })
      const snapshot = queryClient.getQueryData<ListTransaccionesResponse>(
        transaccionesQueryKey,
      )
      if (snapshot) {
        queryClient.setQueryData<ListTransaccionesResponse>(
          transaccionesQueryKey,
          {
            ...snapshot,
            transacciones: snapshot.transacciones.map((t) =>
              t.id === id
                ? { ...t, categoria: { nombre: grupoLabels[grupo], grupo } }
                : t,
            ),
          },
        )
      }
      return { snapshot }
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(transaccionesQueryKey, ctx.snapshot)
      }
    },
  })
}
