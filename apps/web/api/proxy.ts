import { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Vercel Serverless Function (Node.js runtime) — same-origin proxy for `/api/*`.
//
// Prod counterpart of the dev Vite proxy (`vite.config.ts`): the browser calls
// same-origin `/api/*` (NO key attached); a `vercel.json` rewrite maps EVERY
// `/api/*` path to THIS single function, passing the original sub-path in an
// `upstream` query param. The function injects `x-api-key` server-side from
// `process.env.API_KEY`, forwards to the backend (`process.env.API_BASE_URL`),
// and streams the response back. The key lives only in this Node process — it
// never reaches the browser bundle.
//
// WHY a rewrite + single function instead of an `api/[...path].ts` catch-all:
// on this project Vercel only routed the catch-all ONE segment deep, so every
// nested path (`/api/auth/login`, `/api/buckets/:b`, `/api/auth/demo`, …) 404'd
// and the whole authenticated app + demo were dead in prod. The rewrite
// (functions are matched before rewrites, so the broken auto-route can't win)
// funnels all depths here and hands the real path via `upstream`.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const apiKey = process.env.API_KEY
  const apiBaseUrl = process.env.API_BASE_URL

  if (!apiKey || !apiBaseUrl) {
    sendJsonError(res, 500, 'proxy misconfigured: missing API_KEY or API_BASE_URL')
    return
  }

  const safePath = resolveUpstreamPath(req.url)
  if (safePath === null) {
    sendJsonError(res, 400, 'invalid request path')
    return
  }

  const targetUrl = new URL(safePath, apiBaseUrl)
  const body = await readRequestBody(req)

  const headers: Record<string, string> = {
    ...forwardableHeaders(req.headers),
    'x-api-key': apiKey,
  }
  // Relay the browser's Fetch Metadata under a custom name for the backend's
  // anti-embed guard on `GET /api/auth/demo`. undici drops the forbidden
  // `sec-fetch-*` request headers from this proxied fetch, so the guard would
  // otherwise never see the real navigation context (and reject every proxied
  // demo call). Set ONLY from the incoming request — `forwardableHeaders`
  // strips any client-supplied `x-fwd-sec-fetch-*`, so these can't be forged
  // (same posture as `x-api-key`).
  const secFetchDest = headerValue(req.headers['sec-fetch-dest'])
  const secFetchMode = headerValue(req.headers['sec-fetch-mode'])
  if (secFetchDest !== undefined) headers['x-fwd-sec-fetch-dest'] = secFetchDest
  if (secFetchMode !== undefined) headers['x-fwd-sec-fetch-mode'] = secFetchMode

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, { method: req.method, headers, body })
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

// Reconstructs the same-origin path to forward from THIS function's `req.url`.
// After the `vercel.json` rewrite (`/api/(.*)` -> `/api/proxy?upstream=$1`),
// `req.url` is `/api/proxy?upstream=<subpath>[&<original query>]`. We take
// `upstream` (whatever followed `/api/`), rebuild `/api/<subpath>` with the
// remaining query, and run it through the anti-SSRF guard: the key-injected
// request must never be pointed at another host (`http://host`, `//host`), only
// a same-origin relative path. Because the result is always `new URL(path,
// apiBaseUrl)` with a single-leading-slash path, the target host is ALWAYS the
// backend — `sanitizeSameOriginPath` additionally rejects an `upstream` that
// tries to smuggle a scheme.
function resolveUpstreamPath(reqUrl: string | undefined): string | null {
  if (!reqUrl) return null

  const parsed = new URL(reqUrl, 'http://proxy-base.invalid')
  const upstream = parsed.searchParams.get('upstream')
  if (upstream === null) return null
  parsed.searchParams.delete('upstream')

  const query = parsed.searchParams.toString()
  const candidate = `/api/${upstream}${query ? `?${query}` : ''}`

  return sanitizeSameOriginPath(candidate)
}

function sanitizeSameOriginPath(url: string): string | null {
  if (!url.startsWith('/')) return null
  if (url.startsWith('//') || url.startsWith('/\\') || url.startsWith('\\')) return null
  if (url.includes('://')) return null

  // Re-parse against a throwaway base to NORMALIZE (collapse `.`/`..`) before
  // checking. The forwarded path MUST stay under `/api/`: `upstream` is
  // percent-decoded once by the caller, so a smuggled `..%2f..%2f` would
  // otherwise walk the key-injected request off `/api/*` onto other backend
  // paths (health/root/etc.) — same host, but outside the intended surface.
  // Requiring the collapsed pathname to start with `/api/` closes that.
  const parsed = new URL(url, 'http://proxy-base.invalid')
  if (!parsed.pathname.startsWith('/api/')) return null

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

// Headers set server-side by this proxy — a client-supplied value for any of
// them must NEVER pass through (they'd forge the api-key or the anti-embed
// Fetch-Metadata relay). `host`/`connection` are hop-by-hop.
const NON_FORWARDABLE = new Set([
  'host',
  'connection',
  'x-api-key',
  'x-fwd-sec-fetch-dest',
  'x-fwd-sec-fetch-mode',
])

function forwardableHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (NON_FORWARDABLE.has(key)) continue
    result[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return result
}

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}
