import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import handler from './proxy'

// Minimal fakes for the Vercel Node.js runtime request/response. Note the
// `url` the function sees is the POST-REWRITE url: the `vercel.json` rewrite
// (`/api/(.*)` -> `/api/proxy?upstream=$1`) means every browser call to
// `/api/<subpath>` reaches this handler as `/api/proxy?upstream=<subpath>`.
// The handler reads `req.url`/`req.method`/`req.headers` (and, for non-GET/HEAD,
// iterates `req` for the body) and calls `res.statusCode`/`setHeader`/`end`.
function createReq(
  overrides: Partial<{
    url: string
    method: string
    headers: Record<string, string>
    // Raw body bytes, split into chunks to mimic real Node.js stream delivery
    // (multiple `data` events) — exercises the same `Buffer.concat` round-trip
    // the handler relies on, not a single-chunk shortcut.
    bodyChunks: Buffer[]
  }> = {},
): IncomingMessage {
  const bodyChunks = overrides.bodyChunks ?? []
  const req = {
    url: overrides.url ?? '/api/proxy?upstream=resumen',
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

/** Builds the post-rewrite `req.url` for a given browser `/api/<subpath>` call. */
function proxyUrl(subpath: string): string {
  return `/api/proxy?upstream=${encodeURIComponent(subpath)}`
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
  it('reconstructs the original /api path from `upstream` (incl. nested) and forwards it to API_BASE_URL with the server-side x-api-key', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    // Nested path — the exact case the old catch-all 404'd on.
    const req = createReq({ url: proxyUrl('auth/login') })
    const res = createRes()

    await handler(req, res)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(targetUrl.origin).toBe('https://backend.example')
    expect(targetUrl.pathname).toBe('/api/auth/login')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('server-side-secret')
    expect(res.statusCode).toBe(200)
  })

  it('preserves the original query string alongside the reconstructed path', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    // Vercel merges the original query into the rewritten url next to `upstream`.
    const req = createReq({ url: '/api/proxy?upstream=resumen&periodo=2026-07' })
    const res = createRes()

    await handler(req, res)

    const [targetUrl] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(`${targetUrl.pathname}${targetUrl.search}`).toBe('/api/resumen?periodo=2026-07')
  })

  it('strips any client-supplied x-api-key header and replaces it with the server-side key', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const req = createReq({ headers: { 'x-api-key': 'attacker-supplied' } })
    const res = createRes()

    await handler(req, res)

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('server-side-secret')
  })

  it("relays the browser's Sec-Fetch metadata as x-fwd-sec-fetch-* (undici strips the standard ones on the proxied fetch)", async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const req = createReq({
      url: proxyUrl('auth/demo'),
      headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' },
    })
    const res = createRes()

    await handler(req, res)

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['x-fwd-sec-fetch-dest']).toBe('document')
    expect(headers['x-fwd-sec-fetch-mode']).toBe('navigate')
  })

  it('sets x-fwd-sec-fetch-* ONLY from the real request, dropping a client-forged one (unforgeable, like x-api-key)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const req = createReq({
      url: proxyUrl('auth/demo'),
      // A malicious embed can't set Sec-Fetch (browser-controlled) but might try
      // to smuggle the custom header directly — it must never win.
      headers: { 'sec-fetch-dest': 'image', 'x-fwd-sec-fetch-dest': 'document' },
    })
    const res = createRes()

    await handler(req, res)

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect((init.headers as Record<string, string>)['x-fwd-sec-fetch-dest']).toBe('image')
  })

  it.each(['http://attacker.example/x', '//attacker.example/x', 'foo/../../bar'])(
    'never forwards to an attacker host — a malicious `upstream` (%s) is rejected or pinned to the backend origin (SSRF / key-exfiltration guard)',
    async (maliciousUpstream) => {
      fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
      const req = createReq({ url: proxyUrl(maliciousUpstream) })
      const res = createRes()

      await handler(req, res)

      // Whatever the input, the key-injected request must NEVER leave the
      // backend origin: either rejected with 400 (no fetch), or forwarded but
      // only to API_BASE_URL's host.
      if (fetchMock.mock.calls.length > 0) {
        const [targetUrl] = fetchMock.mock.calls[0] as [URL, RequestInit]
        expect(targetUrl.origin).toBe('https://backend.example')
      } else {
        expect(res.statusCode).toBe(400)
        expect(res.end).toHaveBeenCalledWith(expect.stringContaining('invalid request path'))
      }
    },
  )

  it('rejects an `upstream` that path-traverses out of /api/ with a 400 (key-injected request stays on the /api surface)', async () => {
    // `..%2f..%2fhealth` decodes to `../../health`; `/api/../../health`
    // collapses to `/health`, which is OUTSIDE `/api/*` — must be rejected so
    // the server-side key can't be walked onto other backend paths.
    const req = createReq({ url: proxyUrl('../../health') })
    const res = createRes()

    await handler(req, res)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

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

  // auth-login-session Slice 3 (AUTH-01): the cookie-through-proxy decision
  // design.md §6.1 relies on. Regression guard on the (unchanged) forwarding.
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

  // upload-cartola-ui Tarea 0.1 (Decision 7): locks that `readRequestBody`'s
  // `Buffer.concat` round-trip does not corrupt or re-encode a multipart body,
  // and that the `content-type` boundary is forwarded verbatim.
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
    const bodyChunks = [
      multipartBody.subarray(0, 10),
      multipartBody.subarray(10, 25),
      multipartBody.subarray(25),
    ]

    const req = createReq({
      url: proxyUrl('ingestas'),
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
