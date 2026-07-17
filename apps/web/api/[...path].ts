import type { IncomingMessage, ServerResponse } from 'node:http'

// Vercel Serverless Function (Node.js runtime) — catch-all proxy for `/api/*`.
//
// Prod counterpart of the dev Vite proxy (`vite.config.ts`): receives the
// same-origin `/api/*` request from the browser (with NO key attached),
// injects `x-api-key` server-side from `process.env.API_KEY`, forwards it to
// the Render backend (`process.env.API_BASE_URL`), and streams the response
// back unchanged. The key lives only in this Node process — it never reaches
// the browser bundle. No caching of authenticated responses.
//
// Exit criterion is the manual prod check in the 0-W.5 checklist: deployed
// URL returns 200 from `/api/resumen`, and `dist/` contains no `x-api-key` /
// `VITE_API_KEY` string. Unit-covered in `proxy.test.ts` with faked
// req/res/fetch.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const apiKey = process.env.API_KEY
  const apiBaseUrl = process.env.API_BASE_URL

  if (!apiKey || !apiBaseUrl) {
    sendJsonError(res, 500, 'proxy misconfigured: missing API_KEY or API_BASE_URL')
    return
  }

  const safePath = resolveSafePath(req.url)
  if (safePath === null) {
    sendJsonError(res, 400, 'invalid request path')
    return
  }

  const targetUrl = new URL(safePath, apiBaseUrl)
  const body = await readRequestBody(req)

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers: { ...forwardableHeaders(req.headers), 'x-api-key': apiKey },
      body,
    })
  } catch {
    sendJsonError(res, 502, 'upstream request failed')
    return
  }

  res.statusCode = upstream.status
  upstream.headers.forEach((value, key) => {
    // Node re-decodes the body below, so a stale content-encoding header
    // would make the client try to decode already-decoded bytes.
    if (key.toLowerCase() === 'content-encoding') return
    res.setHeader(key, value)
  })
  res.end(Buffer.from(await upstream.arrayBuffer()))
}

function sendJsonError(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ message }))
}

// Validates `req.url` BEFORE it is ever used to build the upstream target or
// attach the server-side `x-api-key`. `new URL(req.url, apiBaseUrl)` follows
// WHATWG URL rules: a protocol-relative (`//host/...`) or absolute
// (`http://host/...`) `req.url` IGNORES the base entirely, so an unvalidated
// value would let a client redirect the authenticated request — key included
// — to an attacker-controlled host (SSRF / key exfiltration). Only a
// same-origin-relative path+query (single leading `/`, no scheme, no
// protocol-relative prefix) is allowed through.
function resolveSafePath(url: string | undefined): string | null {
  if (!url || !url.startsWith('/')) return null
  if (url.startsWith('//') || url.startsWith('/\\') || url.startsWith('\\')) return null
  if (url.includes('://')) return null

  // Re-parse against a throwaway base to normalize the path+query; this also
  // rejects anything that still resolves outside a single-leading-slash path.
  const parsed = new URL(url, 'http://proxy-base.invalid')
  if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return null

  return `${parsed.pathname}${parsed.search}`
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined
}

function forwardableHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    // `host`/`connection` are hop-by-hop and must not be forwarded as-is;
    // `x-api-key` is set explicitly below from the server-side env var, so
    // any client-supplied value must never pass through.
    if (key === 'host' || key === 'connection' || key === 'x-api-key') continue
    result[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return result
}
