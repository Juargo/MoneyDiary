import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMe, postLogin, postLogout } from './auth'
import type { MeDto } from './types'

const validMeDto: MeDto = { userId: 'user-1', email: 'usuario@moneydiary.cl', esDemo: false }
const validDemoMeDto: MeDto = { userId: 'demo-1', email: null, esDemo: true }

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('postLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a POST /api/auth/login same-origin con las credenciales en el body', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ token: 't', userId: 'u', expiresAt: '2026-07-24T00:00:00.000Z' }) })

    await postLogin({ email: 'a@b.cl', password: 'secreta' })

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.cl', password: 'secreta' }),
    })
  })

  it('en éxito resuelve {ok: true, value: undefined} — NUNCA expone el token del body (AUTH-01)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: 'super-secreto', userId: 'u', expiresAt: '2026-07-24T00:00:00.000Z' }),
    })

    const result = await postLogin({ email: 'a@b.cl', password: 'secreta' })

    expect(result).toEqual({ ok: true, value: undefined })
    expect(result.ok && result.value !== null && typeof result.value === 'object' && 'token' in result.value).toBe(
      false,
    )
  })

  it('mapea un 401 a {tag: "unauthorized"} con mensaje genérico', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await postLogin({ email: 'a@b.cl', password: 'mala' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({ tag: 'unauthorized', message: 'Credenciales inválidas.' })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await postLogin({ email: 'a@b.cl', password: 'secreta' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea cualquier otro no-2xx (p.ej. 429 rate limit) a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 429 })

    const result = await postLogin({ email: 'a@b.cl', password: 'secreta' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 429,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })
})

describe('fetchMe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a GET /api/auth/me same-origin', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validMeDto) })

    await fetchMe()

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'same-origin' })
  })

  it('en éxito resuelve {ok: true, value: MeDto}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validMeDto) })

    const result = await fetchMe()

    expect(result).toEqual({ ok: true, value: validMeDto })
  })

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await fetchMe()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('unauthorized')
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await fetchMe()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await fetchMe()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  // demo-trial-mode DEMO-UI: un usuario demo tiene email:null y esDemo:true
  // (DEMO-AUTH-05) — el guard debe aceptar esta forma, no solo la de un
  // usuario real (email:string, esDemo:false).
  it('en éxito acepta un usuario demo (email:null, esDemo:true)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDemoMeDto) })

    const result = await fetchMe()

    expect(result).toEqual({ ok: true, value: validDemoMeDto })
  })

  it('mapea un body 2xx sin esDemo (forma pre-demo obsoleta) a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ userId: 'user-1', email: 'usuario@moneydiary.cl' }),
    })

    const result = await fetchMe()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it.each([['"true"', 'true'], ['1', 1], ['null', null]])(
    'mapea un esDemo mal tipado (%s) a {tag: "parse"}',
    async (_label, esDemoInvalido) => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ userId: 'user-1', email: 'usuario@moneydiary.cl', esDemo: esDemoInvalido }),
      })

      const result = await fetchMe()

      expect(result.ok).toBe(false)
      expect(!result.ok && result.error.tag).toBe('parse')
    },
  )

  // El guard hace cumplir el invariante cruzado documentado en `types.ts`
  // (espejo fail-closed del guard del backend en `buscarIdentidad`, PR1): un
  // usuario real (esDemo:false) sin email es una forma inválida, no una
  // variante aceptable — aunque cada campo type-checkee por separado.
  it('mapea {esDemo:false, email:null} (usuario real sin email) a {tag: "parse"} — fail-closed', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ userId: 'user-1', email: null, esDemo: false }),
    })

    const result = await fetchMe()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  // Nota: el caso de aceptación {esDemo:true, email:null} ya está cubierto
  // más arriba por "en éxito acepta un usuario demo" — no se duplica aquí.

  it('mapea un body 2xx cuyo json() lanza a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.reject(new Error('invalid json')) })

    const result = await fetchMe()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })
})

describe('postLogout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a POST /api/auth/logout same-origin', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 })

    await postLogout()

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { credentials: 'same-origin', method: 'POST' })
  })

  it('en éxito (204) resuelve {ok: true, value: undefined}', async () => {
    mockFetchOnce({ ok: true, status: 204 })

    const result = await postLogout()

    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await postLogout()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un no-2xx inesperado a {tag: "server"}', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await postLogout()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })
})
