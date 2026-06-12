export type MatchType = 'CONTAINS' | 'STARTS_WITH' | 'REGEX'

export interface Patron {
  id: string
  bucketName: string
  label: string | null
  icon: string | null
  expression: string
  matchType: MatchType
  priority: number
  active: boolean
}

export interface PatronInput {
  bucketName: string
  label?: string | null
  icon?: string | null
  expression: string
  matchType: MatchType
  priority: number
  active?: boolean
}

export interface ListPatronesResponse {
  total: number
  patrones: Patron[]
}

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null
  const msg = body?.message
  if (Array.isArray(msg)) return msg.join(', ')
  return msg ?? `Error HTTP ${response.status}`
}

export async function listPatrones(): Promise<ListPatronesResponse> {
  const response = await fetch('/api/patrones')
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<ListPatronesResponse>
}

export async function createPatron(input: PatronInput): Promise<Patron> {
  const response = await fetch('/api/patrones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<Patron>
}

export async function updatePatron(
  id: string,
  input: Partial<PatronInput>,
): Promise<Patron> {
  const response = await fetch(`/api/patrones/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<Patron>
}

export async function deletePatron(id: string): Promise<void> {
  const response = await fetch(`/api/patrones/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await parseError(response))
}
