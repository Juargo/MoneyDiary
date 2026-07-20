# Exploration — `upload-cartola-ui` (subir cartola UI: web + demo + mobile)

> Sprint 8. Client-only surface over an already-complete ingesta backend. Read-only exploration; see the Sprint-8 plan and ADR-026 for product intent.

## Scope

Client surface over a **done** backend: `POST /api/ingestas` (`apps/api/src/infrastructure/http/ingesta.controller.ts`) — multipart field `file`, `memoryStorage`, 10 MB limit, `.xlsx`+`.pdf`, session-bound via `@CurrentUser() userId`, returns `IngestaResponseDto`. Three tracks:

- **US-031** — web upload, authenticated app.
- **US-032** — web upload in demo mode (depends on the separate `demo-trial-mode` change — **do not touch it**).
- **US-033** — mobile upload, authenticated only. Revises ADR-010 per **ADR-026** (mobile gains ONE write capability: ingesta only).

## Key finding — multipart-through-proxy (the flagged high-risk item)

Read `apps/web/vite.config.ts` (dev) and `apps/web/api/[...path].ts` (prod, Vercel Node function).

- **Dev (Vite proxy):** standard `server.proxy` (node-http-proxy under the hood); `configure` only hooks `proxyReq` to inject `x-api-key`. Raw byte-stream passthrough — no body parsing, no JSON coercion. Multipart passes through **unchanged**. Low risk.
- **Prod (Vercel function):** `readRequestBody()` reads the raw request via `for await (const chunk of req)` into a `Buffer`; `forwardableHeaders()` forwards all headers except `host`/`connection`/`x-api-key`, so `content-type: multipart/form-data; boundary=...` passes verbatim. Body forwarded as a raw `Buffer` to `fetch()`, never JSON-parsed. **The proxy code does NOT corrupt multipart** — contrary to the Sprint-8 risk table's original framing.

### The real risk instead: Vercel 4.5 MB body cap vs backend 10 MB

Vercel serverless functions using the **legacy `(req, res)` / `IncomingMessage` signature** (which this file uses, not the newer streaming Web Handler) hard-cap the request body at **4.5 MB**, returning `413 FUNCTION_PAYLOAD_TOO_LARGE` beyond that (verified via Vercel docs, Jul 2026). The backend advertises/accepts **10 MB** (`multer` `fileSize: 10*1024*1024`).

⇒ A cartola between **4.5–10 MB** succeeds via direct API call or the Vite dev proxy but **fails in prod** through this Vercel function with a generic 413. This is a client/server mismatch that must be surfaced in UX. Whether rewriting the proxy to a streaming Web Handler signature bypasses the cap is **unconfirmed** (Vercel docs did not state it) — open question, not an asserted fix.

Also: `apps/web/api/proxy.test.ts` only ever exercises GET — the POST-body forwarding path is **genuinely untested today**. No `vercel.json` exists for `apps/web` (only `apps/landing`), so no body-size override is present.

## Current state — other findings

- **Web API pattern** (`apps/web/src/api/client.ts`, `use-resumen.ts`): typed `ApiResult<T>`/`ApiError` tag union, same-origin `fetch` (no base URL, no key — proxy injects it), TanStack Query `useQuery` hooks. **No `useMutation` exists anywhere in `apps/web/src`** — `use-ingesta.ts` will be the codebase's first mutation, a new pattern to establish (not copy).
- **Web routing** (`apps/web/src/routes/_authenticated.tsx`): pathless `_authenticated` layout runs `requireSession(fetchMe, ...)` in `beforeLoad`, threads `esDemo` into route context, mounts `<DemoBanner esDemo={esDemo}>` (already exists, presentational, from `demo-trial-mode`). `MeDto.esDemo` (`apps/web/src/api/types.ts`) is a stable contract — US-032 builds on it directly without importing `demo-trial-mode` internals.
- **Mobile client** (`apps/mobile/src/api/client.ts`): typed `ApiResult<T>`/`ApiError`, `construirHeadersSesion()` builds `{x-api-key, Authorization: Bearer}` from `session-store` (SecureStore). `app/index.tsx` is the single authenticated screen; `_layout.tsx` uses `Stack.Protected` guarded by `useSession().estado`. **No `expo-document-picker`** in `apps/mobile/package.json` yet; no FormData/upload code exists.
- **OpenSpec conventions:** repo uses `explore.md` (not `exploration.md`); format = Scope / Current State / Approaches (table per sub-decision) / Risks / Ready for Proposal.

## Approaches

### A. Multipart transport through the web proxy

| Option | Tradeoff |
|---|---|
| **1. Keep raw-Buffer passthrough as-is; add client-side size validation below 4.5 MB for the web path** ✅ *Recommended (MVP)* | Low effort, de-risks the 90% case (real cartolas are small), honest UX. Cost: documented divergence between backend's 10 MB and prod-web-reachable 4.5 MB. |
| 2. Rewrite the Vercel function as a streaming Web Handler (`fetch(request)`, pipe `request.body`) | Medium/high effort; **unconfirmed** it bypasses the 4.5 MB cap — needs a spike first. Risk of a wasted rewrite. Defer unless proven necessary. |
| 3. Client-side pre-check + explicit "archivo demasiado grande para esta conexión" messaging at the lower cap | Low effort, no proxy change; pairs with option 1. |

### B. Web upload placement

| Option | Tradeoff |
|---|---|
| **1. Dedicated route `_authenticated/subir`** ✅ *Recommended* | Deep-linkable, natural fit with the `_authenticated` layout + `DemoBanner`, simpler a11y focus management, matches sprint task 31.7. |
| 2. Modal from the resumen screen | Faster to reach, but adds focus-trap/dialog a11y complexity (WCAG 2.2 AA) and no deep link; complicates where the demo nudge renders. |

### C. Mobile picker + upload

| Option | Tradeoff |
|---|---|
| **1. `expo-document-picker` + RN `FormData` with `{uri, name, type}` file part** ✅ *(only realistic option, ADR-026-mandated)* | SDK 57 supports it. **Quirk:** the file part is `{uri,name,type}` (not a Blob), and `Content-Type` must NOT be set manually — RN sets the multipart boundary itself. New screen `app/subir.tsx` under `Stack.Protected`, entry from `app/index.tsx`. |
| 2. Custom native module | YAGNI — nothing to justify it. |

### D. Demo vs app differentiation

Near-total code sharing: same `<SubirCartola>` component, same `use-ingesta.ts` hook, same route. Demo sessions already flow through the identical `_authenticated` layout and session-bound `POST /api/ingestas` (no anonymous path, no demo-specific backend branch). Only delta: an upload-flow-local "datos temporales" nudge reusing `MeDto.esDemo` from route context — **no** change to `<DemoBanner>` and **no** import from `demo-trial-mode` beyond the stable `esDemo` field. Mobile has no demo mode (ADR-026) — Track B is authenticated-only.

## Scope boundaries

**In:** web upload (authenticated + demo), mobile upload (authenticated only), client-side extension/size validation (defense in depth; backend remains authority), progress states (`idle/validando/subiendo/éxito/error`), result panel, error mapping, TanStack Query invalidation of `resumen`/`movimientos`/`resumen-anual` after success, a11y (WCAG 2.2 AA).

**Out:** mobile demo mode (ADR-026), inline transaction/category editing (US-013), ingesta history/management (US-018), real byte-progress bar (indeterminate spinner suffices), column-level encryption (11.6, accepted risk, unaffected), signup/registration.

## Risks

- **Vercel 4.5 MB body cap vs backend's 10 MB** — needs an explicit product/UX decision in the proposal (not purely technical).
- **POST-body-through-proxy is zero-tested today** — sprint Tarea 0.3 (contract test: `FormData` arrives intact) is not optional; it covers genuinely new ground.
- **`use-ingesta.ts` is the first `useMutation` in `apps/web`** — design phase should establish the convention; confirm exact invalidation query keys before writing.
- **RN FormData file-part quirks** — easy to get subtly wrong; needs a real-device Maestro check (ADR-017) since jest-expo can't validate multipart wire format.
- **ADR-026 sequencing** (task 33.1) — the ADR is already decided (read during exploration); this is a documentation/sequencing dependency, not a blocker.

## Ready for proposal

Yes. Backend contract is stable and unchanged. The open unknowns (streaming bypass of the 4.5 MB cap, exact invalidation keys) are narrow enough to resolve in design, not blocking the proposal.
