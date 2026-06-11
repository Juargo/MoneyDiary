import { useQuery } from '@tanstack/react-query'
import { getTransacciones } from './transacciones'

export const transaccionesQueryKey = ['transacciones'] as const

export function useTransacciones() {
  return useQuery({
    queryKey: transaccionesQueryKey,
    queryFn: getTransacciones,
  })
}
