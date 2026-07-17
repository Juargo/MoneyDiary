import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import handler from './[...path]'

// Minimal fakes for the Vercel Node.js runtime request/response — the
// handler only reads `req.url`/`req.method`/`req.headers` (and would iterate
// `req` for the body on non-GET/HEAD, unused by these tests) and only calls
// `res.statusCode`/`setHeader`/`end` on the response.
function createReq(
  overrides: Partial<{ url: string; method: string; headers: Record<string, string> }> = {},
): IncomingMessage {
  const req = {
    url: overrides.url ?? '/api/resumen',
    method: overrides.method ?? 'GET',
    headers: overrides.headers ?? {},
    async *[Symbol.asyncIterator]() {},
  }
  return req as unknown as IncomingMessage
}

function createRes() {
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  }
  return res as unknown as ServerResponse & {
    statusCode: number
    setHeader: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.API_KEY = 'server-side-secret'
  process.env.API_BASE_URL = 'https://backend.example'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.API_KEY
  delete process.env.API_BASE_URL
})

describe('proxy handler', () => {
  it('forwards a valid path to the configured API_BASE_URL origin with the server-side x-api-key', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const req = createReq({ url: '/api/resumen?periodo=2026-07' })
    const res = createRes()

    await handler(req, res)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(targetUrl.origin).toBe('https://backend.example')
    expect(`${targetUrl.pathname}${targetUrl.search}`).toBe('/api/resumen?periodo=2026-07')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('server-side-secret')
    expect(res.statusCode).toBe(200)
  })

  it('strips any client-supplied x-api-key header and replaces it with the server-side key', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const req = createReq({ headers: { 'x-api-key': 'attacker-supplied' } })
    const res = createRes()

    await handler(req, res)

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('server-side-secret')
  })

  it.each(['//attacker.example/x', 'http://attacker.example/x'])(
    'rejects req.url %s with a 400 and never calls fetch (SSRF / key exfiltration guard)',
    async (maliciousUrl) => {
      const req = createReq({ url: maliciousUrl })
      const res = createRes()

      await handler(req, res)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(400)
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('invalid request path'))
    },
  )

  it('returns the existing misconfigured 500 contract when API_KEY or API_BASE_URL is missing', async () => {
    delete process.env.API_KEY
    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(500)
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('proxy misconfigured'))
  })

  it('returns a clean error response when the upstream fetch rejects instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const req = createReq()
    const res = createRes()

    await expect(handler(req, res)).resolves.toBeUndefined()
    expect(res.statusCode).toBe(502)
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('upstream request failed'))
  })
})
