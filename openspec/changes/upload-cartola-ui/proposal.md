# Proposal: Sprint 8 — Subir cartola desde el cliente (`upload-cartola-ui`)

Build the "subir cartola" surface in the clients — **web** (both authenticated app and demo mode) and **mobile** (authenticated only) — on top of the already-complete ingesta backend, so a user can pick a `.xlsx`/`.pdf` bank statement, watch the upload, read a result summary, and see their 50/30/20 resumen refresh without a manual reload. This is a thin client surface over a done, session-bound `POST /api/ingestas` — no domain logic, no new endpoint, no backend change.

## Why

Today there is **no way to get data into MoneyDiary from a client**. The full ingesta pipeline (detect → validate → normalize → persist → categorize) shipped long ago and `POST /api/ingestas` accepts `.xlsx`+`.pdf`, caps at 10 MB, and binds every ingesta to the caller's session via `@CurrentUser()`. But the only surface that calls it is the CLI (`pnpm api cli`). A real user — web or mobile — cannot upload their own cartola. All that backend value is stranded behind a command line.

Two facts make this the right moment:

1. **The consult side is already live and the write side is missing on purpose.** `apps/web` has the resumen + bucket-detail screens (US-015/016/017) and `apps/mobile` has login + resumen, but neither has an upload route or an ingesta hook. `apps/web/src/api/` has only `useQuery` hooks — no mutation exists anywhere in the web app yet. The client can *read* its finances but cannot *feed* them.
2. **The cartola often arrives on the phone.** The user exports it from their bank's app or receives it by email on the device. Forcing them to a desktop to upload breaks the flow exactly where they are. ADR-026 (decided 2026-07-19) amends ADR-010 to let mobile gain **one** write capability — ingesta, and nothing else.

Success looks like: a user in the authenticated web app **and** in a demo session **and** on the authenticated mobile app can pick a `.xlsx`/`.pdf`, see clear progress and a per-flow result (banco, cuenta, `totalTransacciones`, a preview of ingested transactions), get backend errors mapped to human, actionable Spanish messages (banco no reconocido, estructura inválida, PDF sin texto — not a generic "algo salió mal"), and watch the 50/30/20 resumen update on its own — with the `x-api-key` never reaching the web bundle and no anonymous ingesta path.

## What changes

### Tarea 0 — Multipart-through-proxy contract test (foundation for the web path)

The web app calls **same-origin** `/api/*`; the `x-api-key` is injected server-side by the Vite `configure` proxy (dev) and the `apps/web/api/[...path].ts` Vercel function (prod), exactly the 0-W pattern from Sprint 5. Exploration **confirmed** both paths forward `multipart/form-data` as a raw byte stream without JSON-coercing or corrupting the body — contrary to the Sprint-8 risk table's original framing, no proxy rewrite is needed for correctness.

What *is* genuinely new: the POST-body forwarding path is **zero-tested today** (`apps/web/api/proxy.test.ts` only exercises GET). This change adds the contract test that a `FormData` file part arrives intact at the destination handler through the proxy. This is not optional — it covers real, untested ground.

### Track A — Web upload

**US-031 — Authenticated web upload.** Hand-written `IngestaResponseDto` types in `apps/web/src/api/types.ts` (no import from `apps/api/src/domain`, ADR-008); a `use-ingesta.ts` hook that is **the codebase's first `useMutation`** (a new web pattern to establish in design, not copy) building `FormData` and posting to same-origin `/api/ingestas`, invalidating the `resumen`/`movimientos`/`resumen-anual` queries on success; a `<SubirCartola>` component with a keyboard/screen-reader-accessible file input plus client-side extension (`.xlsx`/`.pdf`) and size validation; explicit UI states (`idle | validando | subiendo | éxito | error`) with a spinner and double-submit prevention; a result panel (banco, cuenta, `totalTransacciones`, transaction preview); backend-error mapping to human messages; and a dedicated route `_authenticated/subir` (recommended over a modal for deep-linking and simpler focus management). WCAG 2.2 AA throughout (label, managed focus, `aria-live` state announcements).

**US-032 — Web upload in demo mode.** Reuses ~100% of US-031 — same component, same hook, same route. Demo sessions already flow through the identical `_authenticated` layout and the same session-bound `POST /api/ingestas`; there is no anonymous path and no demo-specific backend branch. The **only** delta is an upload-flow-local "los datos demo son temporales" nudge (with a CTA to register) keyed on the already-stable `MeDto.esDemo` from route context. This change does **not** modify `<DemoBanner>` and does **not** import anything from the separate `demo-trial-mode` change beyond that stable `esDemo` field.

### Track B — Mobile upload (US-033)

Record the **ADR-010 amendment via ADR-026** (already decided — a documentation/sequencing dependency, done before coding Track B), then add `expo-document-picker` (Expo SDK 57) to `apps/mobile`, limited to `.xlsx`/`.pdf`. A `postIngesta(fileUri)` client builds RN `FormData` reusing the existing `Authorization: Bearer` + `x-api-key` transport (no new credential surface). A new `app/subir.tsx` screen under `Stack.Protected`, reached from `app/index.tsx`, drives `subiendo | éxito | error` states (NativeWind), shows a result summary, re-fetches the mobile resumen on success, maps errors, and covers RN a11y (labels/roles). Tests via jest-expo + RNTL; the native picker + multipart wire format get a real-device Maestro check (ADR-017) since jest-expo cannot validate the multipart boundary.

## Constraints & locked decisions

- **Web upload is capped client-side below 4.5 MB (LOCKED, PO this session).** The web prod path goes through the Vercel function, whose legacy `(req, res)` signature hard-caps request bodies at **4.5 MB** (413 beyond that), while the backend accepts **10 MB** and mobile hits the API directly with no cap. For MVP the web client validates size **below 4.5 MB** with clear "archivo demasiado grande para esta conexión" messaging. We do **not** rewrite the proxy to a streaming Web Handler. This is an **accepted asymmetry**: mobile keeps the full 10 MB; web is capped lower by its transport. The streaming rewrite is **deferred/future work** — and it is unconfirmed that it even bypasses the cap, so it needs a spike before being attempted, not a speculative rewrite now (YAGNI).
- **Backend is unchanged.** Same endpoint, same contract, same DTO. No domain, application, or API work. The client filter (`.xlsx`/`.pdf` + size) is defense in depth; the backend stays the validation authority (extension, size, structure).
- **Mobile sequencing.** ADR-026 must be recorded as the ADR-010 amendment before Track B implementation (task 33.1). It is already decided, so this is a sequencing gate, not a blocker.
- **`use-ingesta.ts` establishes the first web mutation convention** — design confirms the exact invalidation query keys and the mutation-hook shape before writing.

## What does NOT change (out of scope)

| Out of scope | Reason |
|--------------|--------|
| Mobile demo mode | ADR-026: demo is a web-only surface; mobile upload is authenticated-only. |
| Inline transaction/category editing (US-013, CA-02) | Not this sprint; ADR-026 explicitly keeps mobile write scoped to ingesta only. |
| Ingesta history/management — view/delete past uploads (US-018) | Deferred; not part of the capture surface. |
| Real byte-progress bar | Indeterminate spinner suffices for MVP (locked out in Sprint-8 + ADR-026). |
| Streaming-rewrite of the Vercel proxy to lift the 4.5 MB cap | Deferred/future work; unconfirmed it even helps — needs a spike first. |
| Column-level encryption (11.6 / CA-03) | Accepted risk, unaffected; this UI exposes no new PII. |
| Signup / registration | Still a later sprint. |

## Impact

**Apps touched:** `apps/web` (new upload route, first mutation hook, `<SubirCartola>`, result panel, error mapping, DTO types, demo nudge) and `apps/mobile` (document picker dep, `postIngesta`, `app/subir.tsx`, result + refresh). `apps/api` is **not** touched.

**Existing files touched (indicative — final shape in design/tasks):**
- `apps/web/api/proxy.test.ts` — add the POST/multipart contract test (currently GET-only).
- `apps/web/src/api/types.ts` — add `IngestaResponseDto`.
- `apps/web/src/api/client.ts` — extend for a mutation/POST path if needed.
- `apps/mobile/package.json` — add `expo-document-picker`.
- `apps/mobile/app/index.tsx` — entry point to the upload screen.

**New files (indicative):**
- Web: `apps/web/src/api/use-ingesta.ts`, `apps/web/src/components/SubirCartola.tsx` (+ specs), `apps/web/src/routes/_authenticated/subir.tsx`, any shadcn primitives via `npx shadcn@latest add`.
- Mobile: `apps/mobile/src/api/post-ingesta.ts`, `apps/mobile/app/subir.tsx`, upload state/view-model + components (+ jest-expo specs), a `.maestro/` flow for the picker.

**OpenSpec capabilities affected:** a new `client-ingesta-upload` capability (web + mobile upload surface). No existing spec's backend contract changes; `demo-trial-mode` is consumed only via the stable `MeDto.esDemo` field, not modified.

**ADR impact:** ADR-010 amended by ADR-026 (mobile gains ingesta-only write). No other ADR changes.

**Reused as reference (not modified):** Sprint-5 web proxy (`vite.config.ts` `configure`, `apps/web/api/[...path].ts`); web `api/client.ts` `ApiResult`/`ApiError` tag union; `_authenticated.tsx` layout + `DemoBanner`; mobile `api/client.ts`, `construirHeadersSesion()`, `session-store`, `Stack.Protected`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| **Vercel 4.5 MB cap vs backend 10 MB** — a 4.5–10 MB cartola succeeds via direct API / dev proxy but 413s in web prod. | LOCKED product decision: cap web client-side below 4.5 MB with explicit "archivo demasiado grande para esta conexión" messaging; mobile keeps 10 MB. Streaming rewrite deferred (and unconfirmed). Documented as accepted asymmetry. |
| **POST-through-proxy is zero-tested today** — only GET is covered. | Tarea 0 contract test (FormData arrives intact) is mandatory, not optional; it covers genuinely new ground. |
| **`use-ingesta.ts` is the first web `useMutation`** — no convention to copy. | Design establishes the mutation-hook convention and confirms exact invalidation query keys (`resumen`/`movimientos`/`resumen-anual`) before apply. |
| **RN `FormData` file-part quirks** — file part is `{uri, name, type}` (not a Blob) and `Content-Type` must NOT be set manually (RN sets the boundary). Easy to get subtly wrong. | Follow ADR-026's documented rule; validate on a real device via Maestro (ADR-017) since jest-expo cannot check the multipart wire format. |
| **Scope pressure from "mobile now writes"** | ADR-026 fixes the boundary: mobile gains ingesta only. Editing (US-013), history (US-018), demo-on-mobile stay out — cite the ADR to say no with grounds. |
| **Merge overlap with the Sprint-7 demo agent on the ingesta path** | Sprint 7 only *verifies* backend gates; this change builds UI and consumes only the stable `esDemo` field. Coordinate the merge so `<DemoBanner>` is not clobbered. |

## Next step

Proceed to `sdd-spec` and `sdd-design` (can run in parallel). Design must resolve: the first-`useMutation` convention + exact invalidation query keys, the client-side size threshold wiring (below 4.5 MB) and its messaging, and the RN `FormData` file-part shape — before tasks.
