# Design: Sprint 8 — Subir cartola desde el cliente (`upload-cartola-ui`)

> Phase: `sdd-design`. Input: `proposal.md` + `explore.md`. Verified against real code (paths cited).
> Design in English; Spanish domain/UI identifiers and copy preserved (ADR-005/008, project convention).
> Pragmatic by the project SOLID/KISS/YAGNI skills. Thin client surface over a DONE backend — no `apps/api` change.

## Architecture approach

No new backend, no new pattern beyond the codebase's first `useMutation`. Reuse the proven web layering:
pure `src/domain/` functions (Vitest, no React) + hand-written `src/api/` DTO types + same-origin `fetch`
client returning the `ApiResult<T>`/`ApiError` tag union (`apps/web/src/api/client.ts`) + a TanStack Query
hook + a presentational component under a `_authenticated/` route. Mobile mirrors its own layering:
`src/api/` transport reusing `construirHeadersSesion()` + a screen under `Stack.Protected`. The web key stays
server-side — the browser POSTs same-origin `/api/ingestas` with NO key; the Vite/Vercel proxy injects it,
exactly the Sprint-5 0-W boundary (`apps/web/api/[...path].ts`, which already forwards non-GET bodies raw).

---

## Decision 1 — First web `useMutation` convention (`use-ingesta.ts`)

**Choice:** a `useIngesta()` hook wrapping `useMutation<IngestaResponseDto, ApiError, File>`, delegating transport
to a pure `postIngesta(file)` in `client.ts` (same `ApiResult`/never-throw discipline as `fetchResumen`), and
invalidating the three read caches on success.
**Alternatives considered:** (a) inline `fetch` in the component — rejected, scatters transport + no cache
invalidation; (b) `mutationFn` doing `fetch` directly in the hook — rejected, breaks the established split where
`client.ts` owns every `fetch` and the shape-guard/error mapping (SOLID SRP).
**Rationale:** mirrors the query hooks (`use-resumen.ts` throws `result.error` so TanStack sees a typed `ApiError`),
so the component switches on `mutation.status` (`idle|pending|success|error`) with the same mental model.

**Exact invalidation query keys** (cited from the three real hooks — TanStack v5 does prefix matching, so the
array prefix invalidates every keyed variant):

| Cache | Real `queryKey` (source) | Invalidate with |
|---|---|---|
| Monthly resumen | `['resumen', periodo ?? 'actual']` (`use-resumen.ts:20`) | `{ queryKey: ['resumen'] }` |
| Annual resumen | `['resumen-anual', anio ?? 'actual']` (`use-resumen-anual.ts:16`) | `{ queryKey: ['resumen-anual'] }` |
| Bucket detail | `['detalle-bucket', bucket, periodo ?? 'actual']` (`use-detalle-bucket.ts:15`) | `{ queryKey: ['detalle-bucket'] }` |

> The proposal's "movimientos" cache does **not** exist in `apps/web` — there is no `useMovimientos`/`['movimientos']`
> queryKey (verified). Three invalidations only. `['resumen']` does NOT prefix-match `['resumen-anual']` (different
> index-0 string), so all three are required.

```ts
export function useIngesta() {
  const queryClient = useQueryClient()
  return useMutation<IngestaResponseDto, ApiError, File>({
    mutationFn: async (file) => {
      const r = await postIngesta(file)
      if (!r.ok) throw r.error
      return r.value
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumen'] })
      queryClient.invalidateQueries({ queryKey: ['resumen-anual'] })
      queryClient.invalidateQueries({ queryKey: ['detalle-bucket'] })
    },
  })
}
```

`postIngesta(file)` builds `FormData`, appends the field name **`file`** (backend `FileInterceptor('file')`,
`ingesta.controller.ts:54`), does `fetch('/api/ingestas', { method: 'POST', body: formData })` — **no manual
`Content-Type`** (the browser sets the multipart boundary), returns `ApiResult<IngestaResponseDto>`.

## Decision 2 — Client-side size validation (web only, below the Vercel cap)

**Choice:** a pure `validarArchivoWeb(file): ArchivoValido | ArchivoRechazado` in `apps/web/src/domain/validar-archivo.ts`,
called by the component in the `validando` state BEFORE `mutate`. Constant
`export const LIMITE_SUBIDA_WEB_BYTES = 4 * 1024 * 1024` (4 MB).
**Alternatives considered:** exactly 4.5 MB — rejected: multipart adds a small boundary/header overhead and the
Vercel legacy `(req,res)` body cap is a hard 413; 4 MB is a round number comfortably **below** the cap with margin.
Validating inside `postIngesta` — rejected: keeping it a pure domain fn makes it Vitest-testable without a fetch
and lets the component render a precise message without a round-trip (SOLID SRP, mirrors `formatear-monto.ts`).
**Rationale:** defense in depth; the backend stays the size authority (10 MB) but the web transport can't reach it,
so we fail fast, honestly. Also validates extension (`.xlsx`/`.pdf`) here.
**Messages (Spanish, neutral):** too large → `"El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para archivos más grandes."`; bad extension → `"Formato no soportado. Sube un archivo .xlsx o .pdf."`
Mobile keeps 10 MB (direct API, no proxy cap) — no web constant reused there.

## Decision 3 — RN `FormData` file-part (`apps/mobile/src/api/post-ingesta.ts`)

**Choice:** `expo-document-picker` yields `{ uri, name, mimeType, size }`; build
`formData.append('file', { uri, name, type } as unknown as Blob)` where `type` is derived per extension, NOT trusted
from the picker's `mimeType`. **`Content-Type` is NEVER set manually** — RN generates the multipart boundary; setting
it drops the boundary and the backend sees a malformed body. Reuse `construirHeadersSesion()` verbatim
(`x-api-key` + `Authorization: Bearer`) as the headers — it does not set `Content-Type`, which is exactly correct here.
**MIME per extension:** `.xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `.pdf` → `application/pdf`.
**Alternatives considered:** passing a `Blob`/`File` — rejected: RN `FormData` on native expects the `{uri,name,type}`
object, not a web Blob. Custom native module — YAGNI.
**Rationale:** follows ADR-026's documented rule; the picker's `mimeType` is unreliable across OSes, so extension →
MIME is deterministic. Returns `ApiResult<IngestaResponseDto>` (same union as mobile `client.ts`).
**⚠ Runtime spike:** the multipart wire format (boundary correctness on device) cannot be validated by jest-expo —
a real-device Maestro flow (ADR-017) is the gate before merge. Flagged in Risks.

## Decision 4 — Backend-error → human message mapping

**Choice:** the backend already emits scrubbed, Spanish `message` strings for every 400 variant (extension, banco no
reconocido, estructura inválida, PDF sin texto — `ingesta.controller.ts:97-119` documents no PII in these messages;
413 is normalized to a 400 with a Spanish message by `upload-too-large.filter.ts`). So on a 400 the client **surfaces
the backend body's `message`** rather than re-mapping variants it can't structurally distinguish (all are 400).
Client owns only the status-level, transport-side messages.
**Alternatives considered:** a client-side enum mapping each domain error — rejected: duplicates the backend's already-Spanish
messages, drifts on the next backend error, and the client cannot tell banco-vs-estructura from a 400 alone (DRY,
single source of truth). Generic "algo salió mal" — rejected by the proposal's success criteria.
**Mapping (extends the `ApiError` union already in `client.ts`):**

| Status | Tag → user message |
|---|---|
| 400 | `invalid` — pass through `body.message` (backend Spanish text); fallback generic if body unreadable |
| 401 | `unauthorized` — `"Tu sesión expiró. Inicia sesión de nuevo."` (redirect-on-401 handled by `_authenticated`) |
| 413 (web, defense in depth) | `invalid` — the 4 MB message; should be pre-empted by Decision 2 |
| network/parse/5xx | existing generic tags/messages, unchanged |

Shared concept, per-client copy: web reuses `client.ts`'s union; mobile reuses its own `ApiError` (no `message`
field there today — mobile surfaces `body.message` for `http` 400 via a small extension in `post-ingesta.ts`).

## Decision 5 — Component/state design

**Web** `apps/web/src/components/SubirCartola.tsx` (presentational + local state machine):
`idle → validando → subiendo → éxito | error`. `validando`/`error` from `validarArchivoWeb`; `subiendo`/`éxito`
from `mutation.status`. Submit disabled while `subiendo` (double-submit prevention). Result panel renders
`IngestaResponseDto`: `banco`, `tipoCuenta`, `numeroCuenta`, `totalTransacciones`, and a preview of `transacciones`
(reuse `formatearMontoCLP` for `cargo`/`abono`, `fecha` label). **a11y (WCAG 2.2 AA, ADR-018):** `<label>` bound to
the file `<input type="file" accept=".xlsx,.pdf">`; an `aria-live="polite"` region announces state transitions; on
`éxito` move focus to the result heading, on `error` to the error text. Route `apps/web/src/routes/_authenticated/subir.tsx`
(deep-linkable, simpler focus mgmt than a modal — explore Approach B1).
**Mobile** `apps/mobile/app/subir.tsx` under `Stack.Protected`, reached from `app/index.tsx`: a plain
`useState` machine `idle|subiendo|éxito|error` (matching `index.tsx`'s hand-rolled switch — no TanStack Query on
mobile), NativeWind styling, result summary, error text, and `accessibilityRole`/`accessibilityLabel` on the
picker button and result (RN a11y). On `éxito`, trigger the resumen re-fetch (the existing `cargar()` pattern).

## Decision 6 — Demo nudge (US-032)

**Choice:** `subir.tsx` reads `esDemo` from `Route.useRouteContext()` (already threaded by `_authenticated.tsx:33`)
and passes it to `<SubirCartola esDemo={esDemo}>`, which renders a local `<DemoUploadNudge>` ("los datos demo son
temporales" + CTA) only when `esDemo` is true.
**Alternatives considered:** touching `<DemoBanner>` or importing `demo-trial-mode` internals — rejected by proposal
scope. **Rationale:** zero coupling; consumes only the stable `MeDto.esDemo` field. No extra `fetchMe` call (context
already has it). Mobile has no demo mode (ADR-026) — nudge is web-only.

## Decision 7 — Tarea 0: multipart-through-proxy contract test

**Choice:** extend `apps/web/api/proxy.test.ts` (GET-only today) with a POST case: build a `createReq` whose
`[Symbol.asyncIterator]` yields the bytes of a small hand-crafted `multipart/form-data` body, `method: 'POST'`,
`headers: { 'content-type': 'multipart/form-data; boundary=...' }`. Assert the handler calls `fetch` with
`init.method === 'POST'`, `init.body` **byte-for-byte equal** to the original buffer (`Buffer.concat` round-trip in
`readRequestBody`, `[...path].ts:83-91`), and the `content-type` (boundary) forwarded verbatim by `forwardableHeaders`.
**Rationale:** the POST-body path is genuinely untested; this locks that the proxy does not corrupt or JSON-coerce a
multipart body (confirmed by reading `[...path].ts`, but unproven by a test). No proxy code change — contract test only.

---

## File changes

| File | Action | Description |
|---|---|---|
| `apps/web/api/proxy.test.ts` | Modify | Add POST/multipart contract test (Decision 7) |
| `apps/web/src/api/types.ts` | Modify | Add `IngestaResponseDto` + `TransaccionResponseDto` (mirror `apps/api/.../ingesta-response.dto.ts`) |
| `apps/web/src/api/client.ts` | Modify | Add `postIngesta(file): ApiResult<IngestaResponseDto>` + shape guard; surface `body.message` on 400 |
| `apps/web/src/api/use-ingesta.ts` | Create | First `useMutation`; invalidates the 3 keys |
| `apps/web/src/domain/validar-archivo.ts` (+ `.test.ts`) | Create | Pure size/extension validation, `LIMITE_SUBIDA_WEB_BYTES` |
| `apps/web/src/components/SubirCartola.tsx` (+ `.test.tsx`) | Create | Upload UI, state machine, result panel, a11y, demo nudge |
| `apps/web/src/routes/_authenticated/subir.tsx` | Create | Route; reads `esDemo` from route context |
| shadcn primitives (`button`, maybe `card`) | Create | `npx shadcn@latest add` if needed |
| `apps/mobile/package.json` | Modify | Add `expo-document-picker` (SDK 57) |
| `apps/mobile/src/api/post-ingesta.ts` (+ spec) | Create | RN FormData transport (Decision 3) |
| `apps/mobile/app/subir.tsx` (+ spec) | Create | Upload screen under `Stack.Protected` |
| `apps/mobile/app/index.tsx` | Modify | Add entry affordance to `/subir` |
| `apps/mobile/.maestro/subir.yaml` | Create | Real-device picker + multipart flow (ADR-017) |

## Interfaces / contracts

`IngestaResponseDto` mirrored by hand (ADR-008 — no import from `apps/api`), exact shape from
`apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts`: `{ ingestaId, banco, tipoCuenta, numeroCuenta,
archivo: { nombre, extension, tamanoBytes }, totalTransacciones, transacciones: ReadonlyArray<{ fecha, descripcion,
cargo, abono }> }` — money as decimal `string` (BigInt-safe), `fecha` ISO-8601 (`toISOString()`).

## Testing strategy

| Layer | What | How |
|---|---|---|
| Unit (web domain) | `validarArchivoWeb`: > 4 MB rejected, wrong extension rejected, `.xlsx`/`.pdf` ok | Vitest, no React |
| Unit (web api) | `postIngesta` shape guard; `useIngesta` invalidates exactly `['resumen']`,`['resumen-anual']`,`['detalle-bucket']` | Vitest + mocked `fetch` / spied `queryClient` |
| Component (web) | state machine, result panel, error message from `body.message`, focus/`aria-live` | Testing Library (+ `vitest-axe` if wired) |
| Contract (proxy) | multipart POST body forwarded intact (Decision 7) | Vitest, faked req/res/fetch |
| Unit (mobile) | `post-ingesta` FormData part shape, MIME per ext, no manual `Content-Type` | jest-expo + RNTL |
| E2E (mobile) | picker + real multipart boundary on device | Maestro (ADR-017), manual — NOT CI |

## Migration / rollout
No migration. Additive client code + one mobile dependency. Backend unchanged.

## Open questions / risks for `sdd-tasks`
- **[Runtime spike — HIGH]** RN multipart boundary correctness on device — jest-expo cannot validate it; Maestro is the gate.
- **[Ops]** Whether the Vercel streaming Web Handler bypasses the 4.5 MB cap is **unconfirmed** — deferred (YAGNI), 4 MB client cap ships now.
- **[Sizing]** shadcn primitives may need install; inflates task sizing / 400-line budget.
- **[Coordination]** Merge with the Sprint-7 demo agent so `<DemoBanner>` / `_authenticated.tsx` context is not clobbered.
