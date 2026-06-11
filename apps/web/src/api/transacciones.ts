import type { ListTransaccionesResponse } from './types'

export async function getTransacciones(): Promise<ListTransaccionesResponse> {
  const response = await fetch('/api/transacciones')
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}`)
  }
  return response.json() as Promise<ListTransaccionesResponse>
}
