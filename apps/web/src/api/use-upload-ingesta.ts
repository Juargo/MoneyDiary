import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadIngesta } from './ingestas'
import { transaccionesQueryKey } from './use-transacciones'

export function useUploadIngesta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: uploadIngesta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transaccionesQueryKey })
    },
  })
}
