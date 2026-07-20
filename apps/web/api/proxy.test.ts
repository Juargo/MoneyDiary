import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import handler from './[...path]'

// Minimal fakes for the Vercel Node.js runtime request/response — the
// handler only reads `req.url`/`req.method`/`req.headers` (and, for
// non-GET/HEAD, iterates `req` for the body — exercised by the multipart
// contract test below) and only calls `res.statusCode`/`setHeader`/`end` on
// the response.
function createReq(
  overrides: Partial<{
    url: string
    method: string
    headers: Record<string, string>
    // Raw body bytes, split into chunks to mimic real Node.js stream
    // delivery (multiple `data` events) — exercises the same
    // `Buffer.concat` round-trip the handler relies on, not a single-chunk
    // shortcut.
    bodyChunks: Buffer[]
  }> = {},
): IncomingMessage {
  const bodyChunks = overrides.bodyChunks ?? []
  const req = {
    url: overrides.url ?? '/api/resumen',
    method: overrides.method ?? 'GET',
    headers: overrides.headers ?? {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of bodyChunks) {
        yield chunk
      }
    },
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

  // auth-login-session Slice 3 (AUTH-01): confirms the cookie-through-proxy
  // decision design.md §6.1 already relies on — this handler was NOT changed
  // for this slice, these tests only lock in the existing (correct)
  // behavior as a regression guard.
  it('forwards the client-supplied Cookie header to the upstream request (session cookie on authenticated calls)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const req = createReq({ headers: { cookie: 'md_session=abc123' } })
    const res = createRes()

    await handler(req, res)

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect((init.headers as Record<string, string>).cookie).toBe('md_session=abc123')
  })

  it('forwards the upstream Set-Cookie response header back to the browser (login sets md_session)', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'set-cookie': 'md_session=abc123; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800' },
      }),
    )
    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res.setHeader).toHaveBeenCalledWith(
      'set-cookie',
      'md_session=abc123; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800',
    )
  })

  // upload-cartola-ui Tarea 0.1 (Decision 7): the POST-body path is
  // otherwise untested — this locks that `readRequestBody`'s
  // `Buffer.concat` round-trip (`[...path].ts:83-91`) does not corrupt or
  // re-encode a multipart body, and that the `content-type` boundary is
  // forwarded verbatim by `forwardableHeaders` (`[...path].ts:93-104`). No
  // proxy source change is expected — regression lock on already-correct
  // behavior, same pattern as the cookie-forwarding tests above.
  it('forwards a multipart/form-data POST body byte-for-byte with the boundary content-type intact', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    const boundary = '----moneydiary-test-boundary-abc123'
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="cartola-test.xlsx"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n` +
        `not-real-xlsx-bytes-\x00\x01\x02` +
        `\r\n--${boundary}--\r\n`,
      'binary',
    )
    // Split into several small chunks to exercise the same multi-`data`-event
    // `Buffer.concat` round-trip a real Node.js request stream would deliver.
    const bodyChunks = [
      multipartBody.subarray(0, 10),
      multipartBody.subarray(10, 25),
      multipartBody.subarray(25),
    ]

    const req = createReq({
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      bodyChunks,
    })
    const res = createRes()

    await handler(req, res)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(init.method).toBe('POST')
    expect(Buffer.isBuffer(init.body)).toBe(true)
    expect(Buffer.compare(init.body as Buffer, multipartBody)).toBe(0)
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      `multipart/form-data; boundary=${boundary}`,
    )
  })
})
