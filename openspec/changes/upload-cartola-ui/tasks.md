# Tasks: Sprint 8 — Subir cartola desde el cliente (`upload-cartola-ui`)

> Phase: `sdd-tasks`. Inputs: `openspec/changes/upload-cartola-ui/specs/client-ingesta-upload/spec.md`
> (CU-01..CU-12) + `openspec/changes/upload-cartola-ui/design.md` (7 decisions). Strict TDD is active
> for this project (web: Vitest + Testing Library; mobile: jest-expo + RNTL). Every task that writes
> behavior is ordered test-first: **write failing test → implement → green**. The one exception is
> Tarea 0 (below) — a regression-lock contract test for existing, already-correct proxy behavior, same
> pattern as the `auth-login-session` Slice-3 cookie tests already in `proxy.test.ts:112-125`.
>
> Backend is unchanged (`apps/api` untouched) — no domain/application/infrastructure ordering applies
> here. Work units follow `work-unit-commits`: one deliverable behavior per commit, tests travel with
> the code they verify. See the Review Workload Forecast at the end for the recommended PR split
> (decision owned by the orchestrator, not this doc).

---

## Work Unit 0 — Tarea 0: multipart-through-proxy contract test (Decision 7)

**Blocks nothing structurally, but MUST land first** — it de-risks the entire web upload path
(Track A) before any component depends on the proxy forwarding a multipart body correctly. Currently
`apps/web/api/proxy.test.ts` only exercises GET.

- [x] **0.1** — Extend `apps/web/api/proxy.test.ts` with a POST/multipart case: build a `createReq`
  (reuse the existing `createReq`/`createRes` fakes) whose `[Symbol.asyncIterator]` yields the raw
  bytes of a small hand-crafted `multipart/form-data` body, `method: 'POST'`,
  `headers: { 'content-type': 'multipart/form-data; boundary=...' }`. Assert:
  - `fetchMock` is called with `init.method === 'POST'`.
  - `init.body` is **byte-for-byte equal** (`Buffer.compare` or `.toEqual`) to the original buffer —
    proves `readRequestBody`'s `Buffer.concat` round-trip (`[...path].ts:83-91`) does not corrupt or
    re-encode the body.
  - The `content-type` header (with its `boundary=...`) is forwarded verbatim by `forwardableHeaders`
    (`[...path].ts:93-104`).
  - No proxy source change is expected — `[...path].ts` already handles this correctly (confirmed by
    design). This test is a regression lock, like the existing Slice-3 cookie-forwarding tests
    (`proxy.test.ts:112-143`): write it, run it, confirm it is green on the current `[...path].ts` with
    no implementation change needed.
  - File: `apps/web/api/proxy.test.ts` (existing file, new `describe`/`it` block).

**Work unit boundary:** single-commit, test-only change. No production code touched.

---

## Work Unit A — Track A: Web upload (US-031 authenticated + US-032 demo)

**Depends on:** 0.1 (proxy contract locked before building the UI on top of it).

### API layer — DTO types (no test file; mirrors the existing `types.ts` convention — plain
interfaces, no logic to unit-test)

- [x] **A.1** — Extend `apps/web/src/api/types.ts`: add `TransaccionResponseDto`
  (`fecha: string; descripcion: string; cargo: string; abono: string`) and `IngestaResponseDto`
  (`ingestaId: string; banco: string; tipoCuenta: string; numeroCuenta: string;
  archivo: { nombre: string; extension: string; tamanoBytes: number };
  totalTransacciones: number; transacciones: ReadonlyArray<TransaccionResponseDto>`) — exact mirror of
  `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts`. Web does NOT import from
  `apps/api/src/domain` (ADR-008). `cargo`/`abono`/`fecha` stay `string` (BigInt-safe, ISO-8601) —
  never parsed to `number` here, same discipline as every other DTO in this file.

### Domain — client-side validation (pure function, Vitest, no React, no deps — write first, no
network involved)

- [x] **A.2** — `apps/web/src/domain/validar-archivo.test.ts` (write first): cases — `.xlsx`/`.pdf`
  under 4 MB → `{ tag: 'valido' }` (or equivalent ok variant); `.csv`/other extension → rejected with
  the exact Spanish message `"Formato no soportado. Sube un archivo .xlsx o .pdf."`; file at/above
  `LIMITE_SUBIDA_WEB_BYTES` (4 MB) → rejected with the exact Spanish message
  `"El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para
  archivos más grandes."`; a file exactly 1 byte under the limit passes (boundary case, CU-01).
- [x] **A.3** — `apps/web/src/domain/validar-archivo.ts`: `export const LIMITE_SUBIDA_WEB_BYTES = 4 * 1024 * 1024`
  + `validarArchivoWeb(file: File): ArchivoValido | ArchivoRechazado` — checks extension first (mirrors
  `esFechaValida`/`esMontoStringValido`'s guard-clause style, KISS), then size. Pure, no `fetch`, no
  React import — Vitest-testable in isolation (design Decision 2, SOLID SRP). Make A.2 pass.

### API layer — transport (`postIngesta`, write test first — mock `fetch`, same style as
`client.test.ts`'s existing `fetchResumen`/`fetchDetalleBucket` blocks)

- [x] **A.4** — Extend `apps/web/src/api/client.test.ts`: `describe('postIngesta', ...)` — asserts (a)
  POST to `/api/ingestas` with a `FormData` body containing the file under field name `file` (backend
  `FileInterceptor('file')`), (b) **no manual `Content-Type` header set** (browser sets the multipart
  boundary — assert the call's `init` has no `Content-Type`/`content-type` key), (c) a 2xx with a
  well-formed `IngestaResponseDto` body resolves `{ ok: true, value }`, (d) a 400 resolves
  `{ ok: false, error: { tag: 'invalid', message: <backend's body.message verbatim> } }` (Decision 4 —
  pass-through, not a client-side enum remap; test with two different backend messages to prove no
  hardcoded mapping), (e) a 400 with an unreadable/malformed body falls back to a generic message, (f)
  a 401 resolves `{ tag: 'unauthorized', message: 'Tu sesión expiró. Inicia sesión de nuevo.' }`, (g) a
  network rejection resolves `{ tag: 'network' }` (existing shared error style), (h) a 2xx with a
  shape-guard-failing body resolves `{ tag: 'parse' }` (mirrors `esResumenMesDto`'s shape-guard
  discipline — add an `esIngestaResponseDto` guard covering `ingestaId`, `banco`, `totalTransacciones`,
  and each `transacciones[i].cargo`/`abono` via `esMontoStringValido`, `fecha` via `esFechaValida` —
  same money-safety reasoning as the existing `esDetalleBucketTransaccionDto` guard).
- [x] **A.5** — `apps/web/src/api/client.ts`: `postIngesta(file: File): Promise<ApiResult<IngestaResponseDto>>`
  — builds `FormData`, `formData.append('file', file)`, `fetch('/api/ingestas', { method: 'POST', body: formData })`
  (no manual `Content-Type`), maps 400 → `{ tag: 'invalid', message: body.message ?? <generic fallback> }`,
  401 → the fixed unauthorized message, other non-2xx → existing `server` tag, network/parse failures →
  existing tags. Add the `esIngestaResponseDto` shape guard (same style as `esDetalleBucketDto`). Make
  A.4 pass.

### API layer — first `useMutation` (write test first — mocked `fetch` + a real/spied `QueryClient`,
mirrors `use-resumen.test.tsx`'s `QueryClientProvider` wrapper pattern)

- [x] **A.6** — `apps/web/src/api/use-ingesta.test.tsx` (write first): on `mutate(file)` success, assert
  `queryClient.invalidateQueries` was called with **exactly** three separate calls —
  `{ queryKey: ['resumen'] }`, `{ queryKey: ['resumen-anual'] }`, `{ queryKey: ['detalle-bucket'] }` (no
  more, no fewer — lock the exact set from design Decision 1, and explicitly assert `['movimientos']`
  is NOT invalidated since that cache doesn't exist in `apps/web`); on failure, `mutation.error` carries
  the typed `ApiError` (not a thrown raw error reaching the component); `mutation.status` transitions
  `idle → pending → success|error`.
- [x] **A.7** — `apps/web/src/api/use-ingesta.ts`: `useIngesta()` wrapping
  `useMutation<IngestaResponseDto, ApiError, File>`, `mutationFn` delegates to `postIngesta` (throws
  `result.error` on failure — same pattern as `use-resumen.ts`), `onSuccess` invalidates the three keys
  above. Make A.6 pass. This is the codebase's first `useMutation` — no existing hook to copy structure
  from beyond the `useQuery` hooks' error-throwing convention.

### shadcn scaffolding (only if the component design below needs a primitive not already installed —
`badge`/`card` already exist per W1.9 precedent; `button` does not)

- [x] **A.8** — `npx shadcn@latest add button` (first `button` primitive in this repo — `badge`/`card`
  already exist from Sprint 5). Only add this one primitive; do not pre-install unused ones (YAGNI, W1.9
  precedent). Re-check the tsconfig-paths alias gotcha from W1.9 (`@/*` resolution) before committing —
  same class of bug bit that task.

### Components (test-first, Testing Library — mirrors `BucketDetailList.spec.tsx`'s
flat-list-wires-a-hook-and-a-state-switch shape)

- [x] **A.9** — `apps/web/src/components/SubirCartola.test.tsx` (write first): cases covering every
  spec requirement in one component-level suite —
  - CU-01: selecting an oversized/wrong-extension file shows the exact `validarArchivoWeb` message and
    **no `postIngesta`/`fetch` call happens** (assert the mocked mutation's `mutate` was never called).
  - CU-02: confirm triggers `subiendo`; a second click while `subiendo` does not fire a second `mutate`
    call and the control stays `disabled`.
  - CU-03: on success, the result panel shows `banco`, `tipoCuenta`, `numeroCuenta`,
    `totalTransacciones`, and at least one row of the transaction preview.
  - CU-04: each of the four known error variants (banco no reconocido, estructura inválida, PDF sin
    texto, tamaño/extensión rechazada — simulate via the mocked `mutation.error` shape from A.4/A.6)
    renders its `body.message` text; an unrecognized/malformed error falls back to a generic message —
    never a raw JSON/stack string in the DOM.
  - CU-05: `<input type="file">` has an associated `<label>` (queryable via `getByLabelText`); an
    `aria-live="polite"` region's text changes across `idle → validando → subiendo → éxito`/`error`; on
    `éxito` focus moves to the result heading, on `error` to the error text (assert `document.activeElement`).
  - CU-07: when `esDemo` is `true`, the demo nudge (`<DemoUploadNudge>`, A.11) is visible AND the file
    input remains enabled/usable in the same render (non-blocking).
  - Mock `useIngesta` (A.7) — this is a component test, not an integration test against real `fetch`.
- [x] **A.10** — `apps/web/src/components/SubirCartola.tsx`: presentational state machine
  `idle → validando → subiendo → éxito | error` per design Decision 5. `validando`/`error` states
  driven by `validarArchivoWeb` (A.3); `subiendo`/`éxito` by `mutation.status` (A.7). Submit `disabled`
  while `subiendo`. Result panel renders `banco`/`tipoCuenta`/`numeroCuenta`/`totalTransacciones` +
  transaction preview (reuse `formatearMontoCLP` for `cargo`/`abono`). `accept=".xlsx,.pdf"` on the
  file input. `aria-live="polite"` region + managed focus per CU-05. Accepts an `esDemo?: boolean` prop
  and renders `<DemoUploadNudge>` when true (A.11 — wired here, not in the route, so the component test
  in A.9 can cover CU-07 directly). Make A.9 pass.

### Demo nudge (US-032, CU-07 — isolated sub-component so its own visibility logic is independently
testable, same reasoning as `DemoBanner.tsx`)

- [x] **A.11** — `apps/web/src/components/SubirCartola.test.tsx` (extend A.9, or a small dedicated
  `DemoUploadNudge` test block if kept in its own file — KISS call at implementation time): assert the
  nudge text mentions temporary demo data plus a CTA to create an account, and that it renders `null`
  when `esDemo` is `false`/absent.
- [x] **A.12** — `<DemoUploadNudge>` — either inlined in `SubirCartola.tsx` (A.10) or its own file,
  matching `DemoBanner.tsx`'s style (non-blocking, no gate, `role="status"` region distinct from the
  upload's own `aria-live` region so screen readers don't conflate the two announcements). Does **not**
  touch `<DemoBanner>` or import anything from the `demo-trial-mode` change beyond `MeDto.esDemo`
  (already stable, already threaded into route context — no new `fetchMe` call, per design Decision 6).

### Route (wires everything together — thin container, mirrors `routes/index.tsx`'s
router-agnostic-component split from W1.13)

- [x] **A.13** — `apps/web/src/routes/_authenticated/subir.tsx`: `createFileRoute('/_authenticated/subir')`,
  `component` reads `esDemo` from `Route.useRouteContext()` (same pattern as
  `routes/_authenticated.tsx:38`, no extra `fetchMe` call) and renders `<SubirCartola esDemo={esDemo} />`.
  Deep-linkable route (design Decision 5, explore Approach B1) — no modal, no focus-trap complexity.
  Thin/untested container, same reasoning as `routes/index.tsx` (a `createFileRoute` component can't
  call route hooks outside a live router in a unit test).

**Work unit boundary:** A.1–A.7 (types + client + hook, no UI) is a clean standalone commit —
independently testable via mocked `fetch`/`QueryClient`, no shadcn dependency. A.8–A.13 (shadcn +
component + demo nudge + route) is a second, larger commit — the natural US-031/US-032 delivery slice,
since the demo nudge is a prop on the same component, not a separate code path.

---

## Work Unit B — Track B: Mobile upload (US-033, authenticated only, ADR-026)

**Depends on:** nothing from Work Unit A (disjoint app, `apps/mobile` vs `apps/web`) — can run in
parallel with Work Unit A once Work Unit 0 is merged (Work Unit 0 only touches `apps/web`, so it is not
actually a hard dependency for Track B either — sequencing here is about the ADR record, not the proxy).

- [x] **B.1** — Sequencing note: confirm ADR-026 (ADR-010 amendment — mobile gains ingesta-only write
  capability) is recorded in the Obsidian vault under `02 Diseño/ADRs/` before writing any Track B code.
  This is a documentation/sequencing gate per the proposal, not a blocking code task — if ADR-026 is
  already recorded (per the design's "already decided" framing), this task is a verification check, not
  new writing. No repo file changes.

### Dependency

- [x] **B.2** — Add `expo-document-picker` (Expo SDK 57-compatible version) to
  `apps/mobile/package.json` dependencies. Run `npx expo install expo-document-picker` (not raw
  `pnpm add`) so Expo resolves the SDK-57-compatible version — matches how `expo-secure-store` was
  added originally. No test for a dependency addition itself.

### API layer — transport (`post-ingesta.ts`, write test first — jest-expo + mocked `fetch`, mirrors
`client.ts`'s `fetchResumen`/`postLogin` test conventions)

- [x] **B.3** — `apps/mobile/src/api/post-ingesta.spec.ts` (write first): cases —
  - the `FormData` file part is built as `{ uri, name, type }` (NOT a `Blob`/`File` object) — assert via
    inspecting the constructed `FormData` mock/spy, per RN's native `FormData` contract (Decision 3).
  - **MIME type is derived from the file extension, never trusted from the picker's `mimeType`**: `.xlsx`
    → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `.pdf` → `application/pdf`.
    Test with a picker result carrying a deliberately wrong/missing `mimeType` to prove the extension
    wins.
  - **`Content-Type` header is NEVER set manually** — assert the `fetch` call's `headers` has no
    `Content-Type`/`content-type` key (RN generates the multipart boundary itself; setting it manually
    drops the boundary, per Decision 3's explicit warning).
  - Headers reuse `construirHeadersSesion()` verbatim (`x-api-key` + `Authorization: Bearer` when a
    token exists) — spy/mock it, assert it's called and its result spread into the request headers.
  - A 2xx with a well-formed body resolves `{ ok: true, value }`; add a light shape guard mirroring
    `esResumenMesDto`'s style (`esIngestaResponseDto`, checking `ingestaId`/`banco`/`totalTransacciones`
    at minimum — KISS, mobile's existing guards are lighter than web's).
  - A 400 resolves an `{ ok: false, error }` that carries the backend's `body.message` — since mobile's
    shared `ApiError` union has no `message` field today, add a small local extension for this call only
    (design Decision 4: "mobile surfaces `body.message` for `http` 400 via a small extension in
    `post-ingesta.ts`" — do not widen the shared `ApiError` type for every mobile call, scope the
    extension to this function's return type only, YAGNI).
  - A network failure resolves `{ tag: 'network' }` (existing shared tag, CU-11).
- [x] **B.4** — `apps/mobile/src/api/post-ingesta.ts`: `postIngesta(pickerResult): Promise<...>` — RN
  `FormData`, `.append('file', { uri, name, type })`, MIME-per-extension lookup (small map, not a
  switch — KISS), `fetch('${API_BASE_URL}/api/ingestas', { method: 'POST', headers: await construirHeadersSesion(), body: formData })`
  with no manual `Content-Type`. Make B.3 pass.

### Screen (test-first, jest-expo + RNTL — mirrors `app/index.tsx`'s
`useState`-machine + `renderEstado` switch pattern, no TanStack Query)

- [x] **B.5** — `apps/mobile/app/subir.spec.tsx` (write first): cases —
  - CU-08: the document-picker trigger is present with an `accessibilityRole`/`accessibilityLabel`
    (CU-12); mock `expo-document-picker` to assert it's invoked with a type filter restricted to
    `.xlsx`/`.pdf` MIME types (or the picker's equivalent `type` option).
  - CU-09: confirming enters a `subiendo` state (assert loading indicator/disabled trigger); **no
    client-side size rejection below 10 MB** — a mocked 7 MB file selection proceeds to calling
    `postIngesta` (do not port `validarArchivoWeb`/`LIMITE_SUBIDA_WEB_BYTES` to mobile — that constant
    is web-only per design Decision 2's closing line).
  - CU-10: on success, the result summary shows `banco`/cuenta/`totalTransacciones`, and the mobile
    resumen re-fetch is triggered (spy on the passed-in `cargar`/refetch callback — reuse the existing
    `app/index.tsx` `cargar()` pattern, do not introduce TanStack Query here).
  - CU-11: on a backend error or network failure, the screen returns to a retryable `error` state (not
    stuck `subiendo`) — assert the trigger becomes enabled again and an error message renders.
  - CU-12: result/error views expose `accessibilityRole`/`accessibilityLabel`; assert no edit/delete
    affordance exists anywhere in this screen's render tree (locks the ADR-026 write-scope boundary —
    same intent as W3.21's disabled-edit-placeholder assertion in the web bucket-detail list, but here
    the assertion is **absence**, not a disabled control, since mobile has zero editing UI to begin
    with).
- [x] **B.6** — `apps/mobile/app/subir.tsx`: plain `useState` machine `idle | subiendo | éxito | error`
  (matches `app/index.tsx`'s hand-rolled switch, no TanStack Query per design Decision 5). Uses
  `expo-document-picker` filtered to `.xlsx`/`.pdf`, calls `postIngesta` (B.4) on confirm, result
  summary + error text, NativeWind styling, RN a11y labels/roles on the trigger and result/error views.
  On `éxito`, triggers the resumen re-fetch (accept a `onUploaded`/`cargar` callback prop, or read it
  via a shared context if that's simpler at implementation time — KISS call deferred to implementation,
  do not over-design the wiring here). Register the screen in `apps/mobile/app/_layout.tsx`'s existing
  `Stack.Protected` block (`<Stack.Screen name="subir" />` alongside `index`) — this is a small,
  necessary addition to `_layout.tsx` beyond the design's file-changes table (the screen cannot be
  reachable under `Stack.Protected` without it). Make B.5 pass.
- [x] **B.7** — `apps/mobile/app/index.tsx`: add a "Subir cartola" entry affordance (a `Pressable`
  navigating to `/subir` via `expo-router`'s `router.push` or a `<Link>`, `accessibilityRole="button"`,
  next to the existing "Cerrar sesión" pressable — matches the file's existing structure, no new
  container component needed for one added control, KISS).

### E2E (manual, real device — NOT CI, ADR-017)

- [x] **B.8** — `apps/mobile/.maestro/subir.yaml`: tap the "Subir cartola" entry, open the picker, select
  a real `.xlsx`/`.pdf` fixture, confirm, assert the result summary appears. This is the **required
  gate** for the multipart boundary correctness that jest-expo cannot validate (design's flagged
  HIGH-risk runtime spike) — run on a real device before merging Work Unit B, per ADR-017. Mirrors the
  existing `.maestro/resumen-semaforo.yaml`/`.maestro/ver-movimientos.yaml` flow structure.

**Work unit boundary:** B.1–B.4 (ADR sequencing check + dependency + transport layer, no screen) is a
clean standalone commit — the transport is independently testable via jest-expo with no navigation
wiring. B.5–B.8 (screen + entry point + Maestro) is a second commit — the largest slice of Track B
because it's the first screen beyond `index`/`login` and needs the `_layout.tsx` `Stack.Protected`
registration plus the real-device Maestro gate before merge.

---

## Review Workload Forecast

Estimate based on sibling-file sizes already in this repo (`fetchResumen`+guard ≈90 lines,
`use-detalle-bucket.ts` ≈25 lines, `BucketDetailList.tsx`+spec ≈150–200 combined, mobile
`fetchResumen`/`postLogin` ≈40 lines each, shadcn-generated primitives ≈30–80 lines each non-negotiable
boilerplate per the W1.9 precedent).

| Work unit | Scope | Est. changed lines |
|---|---|---|
| 0 | `proxy.test.ts` extension (new `describe` block, hand-crafted multipart fixture) | ~60–90 |
| A.1–A.7 | DTO types extension, `postIngesta`+guard+test, `use-ingesta.ts`+test (first mutation, needs a `QueryClientProvider` test harness) | ~350–450 |
| A.8–A.13 | shadcn `button` install (~30–80 lines, non-negotiable boilerplate), `validar-archivo.ts`+test, `SubirCartola.tsx`+test (largest single component: 5-state machine, result panel, a11y, demo nudge — easily 200+ lines of JSX/test alone), `DemoUploadNudge`, route file | ~500–650 |
| B.1–B.4 | ADR sequencing check (no diff), `package.json` diff, `post-ingesta.ts`+spec (FormData/MIME/no-Content-Type assertions are verbose to set up correctly) | ~200–280 |
| B.5–B.8 | `subir.tsx`+spec (state machine + picker + a11y, mirrors `app/index.tsx`'s size), `_layout.tsx` diff, `index.tsx` diff, Maestro YAML (not counted toward PR line budget — E2E flow, not reviewed as source diff) | ~300–400 |

**Total estimate: ~1,400–1,870 changed lines** across the whole change.

- **400-line budget risk: High** — every work unit except Work Unit 0 alone is already at or above the
  400-line budget on its own; A.8–A.13 is the single largest slice (first non-trivial component +
  first shadcn primitive beyond Sprint 5's `badge`/`card`).
- **Chained PRs recommended: Yes.**
- **Suggested split** (natural seam, per the task prompt's guidance — Track A and Track B touch
  disjoint apps and Track B only has a soft dependency on Work Unit 0 via the ADR-026 sequencing note,
  not a hard code dependency):
  1. **PR 1 — Tarea 0 + Track A (web)**: Work Unit 0 (0.1) + Work Unit A (A.1–A.13). ~910–1,190 lines
     combined — likely still needs an internal split given the size: **PR 1a** = 0.1 + A.1–A.7 (contract
     test + API/hook layer, no UI, ~410–540 lines) → **PR 1b** = A.8–A.13 (shadcn + component + route,
     ~500–650 lines, depends on 1a's `useIngesta`/`postIngesta` being stable).
  2. **PR 2 — Track B (mobile)**: Work Unit B (B.1–B.8), based on the ADR-026 record from B.1 being
     confirmed. ~500–680 lines combined — candidate internal split: **PR 2a** = B.1–B.4 (dependency +
     transport, ~200–280 lines) → **PR 2b** = B.5–B.8 (screen + entry + Maestro, ~300–400 lines,
     depends on 2a's `postIngesta` shape).
  - PR 2 does not need to wait for PR 1 to merge (disjoint apps, no shared code) — it can run on a
    parallel branch, but the ADR-026 sequencing note (B.1) is a hard prerequisite for *starting* Track B
    regardless of PR 1's status.
- **Decision needed before apply: Yes** — per `delivery_strategy: ask-on-risk`, the orchestrator must
  ask whether to use the 4-slice chain above (1a / 1b / 2a / 2b) or a coarser 2-slice chain (Track A /
  Track B), and which chain strategy (`stacked-to-main` vs `feature-branch-chain`) to use per slice —
  `feature-branch-chain` for the 1a→1b dependency (1b needs 1a's contract stable before building UI on
  top of it) is the stronger fit if review isolation matters more than merge speed; Track B's 2a→2b pair
  has the same shape. Track A and Track B can use `stacked-to-main` relative to each other since they
  are code-disjoint (no shared file to go stale).

---

## Task-to-requirement traceability

| Requirement | Tasks |
|---|---|
| CU-01 (web file selection + client-side validation) | A.2, A.3, A.9, A.10 |
| CU-02 (web submission via proxy, progress, no double-submit) | 0.1, A.4, A.5, A.6, A.7, A.9, A.10 |
| CU-03 (web success result + resumen refresh) | A.4, A.5, A.6, A.7, A.9, A.10 |
| CU-04 (web backend-error mapping) | A.4, A.5, A.9, A.10 |
| CU-05 (web upload accessibility) | A.9, A.10 |
| CU-06 (demo reuses identical UI, isolated by userId) | A.9, A.10, A.13 |
| CU-07 (demo temporary-data nudge) | A.9, A.10, A.11, A.12 |
| CU-08 (mobile document picker restricted to supported types) | B.5, B.6 |
| CU-09 (mobile upload submission) | B.3, B.4, B.5, B.6 |
| CU-10 (mobile success result + resumen refetch) | B.5, B.6 |
| CU-11 (mobile error handling never hangs) | B.3, B.5, B.6 |
| CU-12 (mobile a11y + ingesta-only write scope) | B.5, B.6 |
