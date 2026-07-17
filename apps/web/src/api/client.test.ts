import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchResumen } from './client'
import type { ResumenMesDto } from './types'

const validDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '400000', porcentajeBp: 4000, estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '250000', porcentajeBp: 2500, estadoSemaforo: 'verde' },
    { bucket: 'Ahorro', total: '350000', porcentajeBp: 3500, estadoSemaforo: 'amarillo' },
    { bucket: 'SinCategoria', total: '0', porcentajeBp: 0, estadoSemaforo: null },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'amarillo',
}

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchResumen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a GET /api/resumen same-origin, sin base URL ni key (W0-02)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDto) })

    await fetchResumen()

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen')
  })

  it('agrega el query param periodo cuando se provee', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDto) })

    await fetchResumen('2026-07')

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen?periodo=2026-07')
  })

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDto) })

    const result = await fetchResumen()

    expect(result).toEqual({ ok: true, value: validDto })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un 400 a {tag: "invalid"} ("período inválido")', async () => {
    mockFetchOnce({ ok: false, status: 400 })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El período no es válido.',
    })
  })

  it('mapea un 401 a {tag: "unauthorized"} ("sin acceso")', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    })
  })

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea un body 2xx cuyo json() lanza a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.reject(new Error('invalid json')) })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando buckets[0].total es number en vez de string (money-safety boundary)', async () => {
    const bodyConTotalNumerico = {
      ...validDto,
      buckets: [{ ...validDto.buckets[0], total: 400000 }, ...validDto.buckets.slice(1)],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConTotalNumerico) })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })
})
