import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from './proxy';

// The proxy forwards with `node:https.request` (never follows redirects, sends
// headers verbatim). Mock it: capture the outgoing request (target/method/
// headers/body) and drive a fake upstream response.
interface Captured {
  target: URL;
  options: { method: string; headers: Record<string, string> };
  body: Buffer[];
}
let captured: Captured | null = null;
let upstream: {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
  error?: boolean;
};

function fakeRequest(
  target: URL,
  options: { method: string; headers: Record<string, string> },
  cb: (
    res: Readable & {
      statusCode: number;
      headers: Record<string, string | string[]>;
    },
  ) => void,
) {
  captured = { target, options, body: [] };
  const clientReq = new EventEmitter() as EventEmitter & {
    write: (c: Buffer) => void;
    end: () => void;
    destroy: () => void;
  };
  clientReq.write = (chunk: Buffer) => captured?.body.push(chunk);
  clientReq.destroy = () => undefined;
  clientReq.end = () => {
    queueMicrotask(() => {
      if (upstream.error) {
        clientReq.emit('error', new Error('ECONNREFUSED'));
        return;
      }
      const resStream = Readable.from(upstream.body) as Readable & {
        statusCode: number;
        headers: Record<string, string | string[]>;
      };
      resStream.statusCode = upstream.statusCode;
      resStream.headers = upstream.headers;
      cb(resStream);
    });
  };
  return clientReq;
}

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  const request = (...args: unknown[]) =>
    fakeRequest(...(args as Parameters<typeof fakeRequest>));
  // node:https is CJS — the interop `default` is the module object; provide it
  // (with the mocked `request`) so both `import { request }` and default work.
  return { ...actual, request, default: { ...actual, request } };
});

function createReq(
  overrides: Partial<{
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyChunks: Buffer[];
  }> = {},
): IncomingMessage {
  const bodyChunks = overrides.bodyChunks ?? [];
  const req = {
    url: overrides.url ?? '/api/proxy?upstream=resumen',
    method: overrides.method ?? 'GET',
    headers: overrides.headers ?? {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of bodyChunks) yield chunk;
    },
  };
  return req as unknown as IncomingMessage;
}

interface FakeRes extends ServerResponse {
  _body: () => Buffer;
  _headers: Record<string, string | string[] | number>;
}

function createRes(): FakeRes {
  const written: Buffer[] = [];
  const headers: Record<string, string | string[] | number> = {};
  const res = new Writable({
    write(chunk, _enc, done) {
      written.push(Buffer.from(chunk as Buffer));
      done();
    },
  }) as unknown as FakeRes;
  res.statusCode = 200;
  (res as unknown as { headersSent: boolean }).headersSent = false;
  res.setHeader = vi.fn(
    (key: string, value: string | number | readonly string[]) => {
      headers[key.toLowerCase()] = value as string | string[] | number;
      (res as unknown as { headersSent: boolean }).headersSent = true;
      return res;
    },
  ) as unknown as FakeRes['setHeader'];
  res._body = () => Buffer.concat(written);
  res._headers = headers;
  return res;
}

/** Builds the post-rewrite `req.url` for a given browser `/api/<subpath>` call. */
function proxyUrl(subpath: string): string {
  return `/api/proxy?upstream=${encodeURIComponent(subpath)}`;
}

const okResponse = { statusCode: 200, headers: {}, body: Buffer.from('{}') };

beforeEach(() => {
  captured = null;
  upstream = { ...okResponse };
  process.env.API_KEY = 'server-side-secret';
  process.env.API_BASE_URL = 'https://backend.example';
});

afterEach(() => {
  delete process.env.API_KEY;
  delete process.env.API_BASE_URL;
});

describe('proxy handler', () => {
  it('reconstructs the original /api path from `upstream` (incl. nested) and forwards it to API_BASE_URL with the server-side x-api-key', async () => {
    const res = createRes();
    await handler(createReq({ url: proxyUrl('auth/login') }), res);

    expect(captured?.target.origin).toBe('https://backend.example');
    expect(captured?.target.pathname).toBe('/api/auth/login');
    expect(captured?.options.headers['x-api-key']).toBe('server-side-secret');
    expect(res.statusCode).toBe(200);
  });

  it('preserves the original query string alongside the reconstructed path', async () => {
    const res = createRes();
    await handler(
      createReq({ url: '/api/proxy?upstream=resumen&periodo=2026-07' }),
      res,
    );

    expect(
      `${captured?.target.pathname ?? ''}${captured?.target.search ?? ''}`,
    ).toBe('/api/resumen?periodo=2026-07');
  });

  it('strips any client-supplied x-api-key header and replaces it with the server-side key', async () => {
    const res = createRes();
    await handler(
      createReq({ headers: { 'x-api-key': 'attacker-supplied' } }),
      res,
    );

    expect(captured?.options.headers['x-api-key']).toBe('server-side-secret');
  });

  it("relays the browser's Sec-Fetch metadata as x-fwd-sec-fetch-*", async () => {
    const res = createRes();
    await handler(
      createReq({
        url: proxyUrl('auth/demo'),
        headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' },
      }),
      res,
    );

    expect(captured?.options.headers['x-fwd-sec-fetch-dest']).toBe('document');
    expect(captured?.options.headers['x-fwd-sec-fetch-mode']).toBe('navigate');
  });

  it('sets x-fwd-sec-fetch-* ONLY from the real request, dropping a client-forged one (unforgeable, like x-api-key)', async () => {
    const res = createRes();
    await handler(
      createReq({
        url: proxyUrl('auth/demo'),
        headers: {
          'sec-fetch-dest': 'image',
          'x-fwd-sec-fetch-dest': 'document',
        },
      }),
      res,
    );

    expect(captured?.options.headers['x-fwd-sec-fetch-dest']).toBe('image');
  });

  it('does NOT follow a backend redirect — forwards the 302 + Location + Set-Cookie so the browser follows it WITH the session cookie', async () => {
    upstream = {
      statusCode: 302,
      headers: {
        location: '/',
        'set-cookie':
          'md_session=abc123; HttpOnly; Path=/; SameSite=Strict; Secure',
        'transfer-encoding': 'chunked',
      },
      body: Buffer.from(''),
    };
    const res = createRes();
    await handler(createReq({ url: proxyUrl('auth/demo') }), res);

    expect(res.statusCode).toBe(302);
    expect(res._headers['location']).toBe('/');
    expect(res._headers['set-cookie']).toBe(
      'md_session=abc123; HttpOnly; Path=/; SameSite=Strict; Secure',
    );
    // hop-by-hop response header is dropped (the runtime re-frames)
    expect(res._headers['transfer-encoding']).toBeUndefined();
  });

  it.each([
    'http://attacker.example/x',
    '//attacker.example/x',
    'foo/../../bar',
  ])(
    'never forwards to an attacker host — a malicious `upstream` (%s) is rejected or pinned to the backend origin (SSRF guard)',
    async (maliciousUpstream) => {
      const res = createRes();
      await handler(createReq({ url: proxyUrl(maliciousUpstream) }), res);

      if (captured !== null) {
        expect(captured.target.origin).toBe('https://backend.example');
      } else {
        expect(res.statusCode).toBe(400);
        expect(res._body().toString()).toContain('invalid request path');
      }
    },
  );

  it('rejects an `upstream` that path-traverses out of /api/ with a 400 (key-injected request stays on the /api surface)', async () => {
    const res = createRes();
    await handler(createReq({ url: proxyUrl('../../health') }), res);

    expect(captured).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it('returns the existing misconfigured 500 contract when API_KEY or API_BASE_URL is missing', async () => {
    delete process.env.API_KEY;
    const res = createRes();
    await handler(createReq(), res);

    expect(captured).toBeNull();
    expect(res.statusCode).toBe(500);
    expect(res._body().toString()).toContain('proxy misconfigured');
  });

  it('returns a clean 502 when the upstream request errors', async () => {
    upstream = { ...okResponse, error: true };
    const res = createRes();

    await expect(handler(createReq(), res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(502);
    expect(res._body().toString()).toContain('upstream request failed');
  });

  it('forwards the client-supplied Cookie header to the upstream request (session cookie on authenticated calls)', async () => {
    const res = createRes();
    await handler(createReq({ headers: { cookie: 'md_session=abc123' } }), res);

    expect(captured?.options.headers.cookie).toBe('md_session=abc123');
  });

  it('forwards the upstream Set-Cookie response header back to the browser (login sets md_session)', async () => {
    upstream = {
      statusCode: 200,
      headers: {
        'set-cookie':
          'md_session=abc123; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800',
      },
      body: Buffer.from('{}'),
    };
    const res = createRes();
    await handler(createReq(), res);

    expect(res._headers['set-cookie']).toBe(
      'md_session=abc123; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800',
    );
  });

  it('forwards a multipart/form-data POST body byte-for-byte with the boundary content-type intact', async () => {
    const boundary = '----moneydiary-test-boundary-abc123';
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="cartola-test.xlsx"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n` +
        `not-real-xlsx-bytes-\x00\x01\x02` +
        `\r\n--${boundary}--\r\n`,
      'binary',
    );
    const bodyChunks = [
      multipartBody.subarray(0, 10),
      multipartBody.subarray(10, 25),
      multipartBody.subarray(25),
    ];

    const res = createRes();
    await handler(
      createReq({
        url: proxyUrl('ingestas'),
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        bodyChunks,
      }),
      res,
    );

    expect(captured?.options.method).toBe('POST');
    expect(
      Buffer.compare(Buffer.concat(captured?.body ?? []), multipartBody),
    ).toBe(0);
    expect(captured?.options.headers['content-type']).toBe(
      `multipart/form-data; boundary=${boundary}`,
    );
  });
});
