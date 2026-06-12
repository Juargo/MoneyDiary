import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPatron,
  deletePatron,
  listPatrones,
  updatePatron,
  type PatronInput,
} from './patrones'

export const patronesQueryKey = ['patrones'] as const

export function usePatrones() {
  return useQuery({
    queryKey: patronesQueryKey,
    queryFn: listPatrones,
  })
}

export function useCreatePatron() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PatronInput) => createPatron(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: patronesQueryKey }),
  })
}

export function useUpdatePatron() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PatronInput> }) =>
      updatePatron(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: patronesQueryKey }),
  })
}

export function useDeletePatron() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePatron(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: patronesQueryKey }),
  })
}
