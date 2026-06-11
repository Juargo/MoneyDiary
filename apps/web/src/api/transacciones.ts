import type { GrupoPresupuesto, ListTransaccionesResponse } from './types'

export async function getTransacciones(): Promise<ListTransaccionesResponse> {
  const response = await fetch('/api/transacciones')
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}`)
  }
  return response.json() as Promise<ListTransaccionesResponse>
}

export async function updateTransaccionGrupo(input: {
  id: string
  grupo: GrupoPresupuesto
}): Promise<void> {
  const response = await fetch(`/api/transacciones/${input.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grupo: input.grupo }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string }
      | null
    throw new Error(body?.message ?? `Error HTTP ${response.status}`)
  }
}
