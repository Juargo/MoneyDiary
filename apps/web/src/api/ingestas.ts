import type { UploadIngestaResponse } from './types'

type ErrorBody = {
  message?: string | string[]
}

export async function uploadIngesta(
  file: File,
): Promise<UploadIngestaResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/ingestas', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody
    const raw = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message
    throw new Error(raw ?? `Error HTTP ${response.status}`)
  }

  return response.json() as Promise<UploadIngestaResponse>
}
