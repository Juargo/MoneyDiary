import { useMutation } from '@tanstack/react-query'
import { uploadIngesta } from './ingestas'

export function useUploadIngesta() {
  return useMutation({
    mutationFn: uploadIngesta,
  })
}
