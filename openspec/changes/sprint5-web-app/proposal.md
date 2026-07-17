# Proposal: Sprint 5 — Web App UI ("Grupo W")

Resume the deferred web UI in `apps/web`, consuming the backend already in `main`, so a user can open the 50/30/20 monthly resumen, read the semaforo, and drill into a bucket's transactions from a browser — without any API key ever reaching the browser bundle.

## Why

Two problems converge in this sprint.

1. **The web UI is stranded.** The backend for US-015 (50/30/20 resumen), US-016 (semaforo) and US-017 (bucket detail read side) already shipped to `main`, but the web frontend never consumed it — the Sprint 3 pivot to mobile deferred it. Today `apps/web` is a bare scaffold: `routes/index.tsx` still shows static "Sprint 1 cerrado" copy, there is no `src/api/`, no query hooks, no DTO types, and zero shadcn components installed. All the value sits behind HTTP endpoints nothing in `apps/web` calls.
2. **A SPA cannot custody a secret.** Every `/api/*` endpoint is behind the global `ApiKeyGuard` (fail-closed: wrong/missing `x-api-key` → 401). A browser SPA has no safe place to hold that key — anything bundled with a `VITE_` prefix is shipped to the client in plaintext. Mobile already made this compromise consciously (`EXPO_PUBLIC_API_KEY` is documented as "NOT real auth, casual-scraping deterrent only"). Web must not repeat that mistake: it needs a server-side layer that injects the header, in **both** dev and prod.

Success looks like: a user loads the web app in dev and in production (Vercel), sees the current month's income and 50/30/20 distribution with an accessible semaforo, clicks a bucket, and sees that bucket's transaction list — with money rendered exactly (BigInt string, never `Number`), the semaforo state read from the backend (never re-computed on the client), and no API key present anywhere in the shipped bundle in any environment.

## What changes

### Tarea 0-W — Server-side `x-api-key` injection (foundation, blocks W1/W2/W3)

The web app calls **same-origin** `/api/*` and a server-side proxy layer injects `x-api-key` from a Node-only (non-`VITE_`) environment variable. Two environments, symmetric mental model:

| Environment | Mechanism | Key source |
|-------------|-----------|------------|
| Dev | Extend the existing Vite proxy in `vite.config.ts` with a `configure` callback (`proxy.on('proxyReq', …)` that `setHeader('x-api-key', process.env.API_KEY)`). Runs in Node during `vite dev`, never bundled. | Bare `API_KEY` in `apps/web/.env.local` (no `VITE_` prefix) |
| Prod (Vercel) | A Vercel Edge/Serverless Function at `/api/*` that reads `process.env.API_KEY` from Vercel project env and proxies to the Render backend, injecting the header. | Vercel project env var (`sync:false`, dashboard-only) |

**LOCKED decisions (do not re-open):**
- Web deploy is **in scope for dev AND prod (Vercel)** — the Vercel function is part of this change, not a follow-up.
- **REJECTED: `VITE_API_KEY` in the bundle** — publicly readable in any built SPA. Same mistake mobile documented.
- **REJECTED: "Vercel rewrites only"** — a rewrite cannot inject a secret header, so the browser would still have to send `x-api-key` itself, putting the key right back in the bundle. Named here explicitly so it is not silently reconsidered later.
- No API key reaches the browser bundle in **any** environment.

Also introduces the repo's first `.env.example` (for `apps/web`), documenting the bare `API_KEY` var.

### Tarea 0-W CI hardening (new CI precedent — no prior L1.6 in this repo)

- Add `pnpm web test` to `.github/workflows/ci.yml` (today CI runs only `pnpm web typecheck` for web — untested-but-typed regressions slip through).
- Add a build-time secret-scan (grep) over the `apps/web` build output that fails the build if a `VITE_API_KEY` or bare API-key pattern appears in `apps/web/src/**` or the built `dist/` (task 0-W.3, the "mirror of L1.6"). **Note:** no such CI secret-scan exists in the repo today; this establishes the precedent rather than mirroring an existing one.

### Track W1 — US-015: month income + 50/30/20 distribution UI

- Hand-written DTO types in `apps/web/src/api/types.ts` matching `ResumenMesDto` (`totalIngreso`/`total` as BigInt strings, `porcentajeBp` in basis points, `targets`, `estadoGlobal`). Web does **not** import from `apps/api/src/domain` (ADR-008).
- A TanStack Query hook (e.g. `useResumen`) calling same-origin `GET /api/resumen?periodo=YYYY-MM`, never the backend directly.
- Port the mobile patterns as framework-agnostic pure functions: `formatearMontoCLP` (BigInt-string CLP formatter, verbatim from `apps/mobile/src/domain/formatear-monto.ts`) and a `resumen` view-model mapper (money pre-formatted, `porcentajeBp: null` → sentinel, distribution computed) modeled on `apps/mobile/src/domain/resumen-view-model.ts`.
- Replace the stale `routes/index.tsx` placeholder with the real resumen screen. `sinIngreso` empty state handled explicitly.

### Track W2 — US-016: semaforo component

- Render the backend-computed `estadoGlobal` and per-bucket `estadoSemaforo`. **Web does NOT re-evaluate thresholds** — the domain thresholds live in `apps/api/src/domain/value-objects/estado-semaforo.ts` and are computed server-side; web only renders what the DTO carries. Same contract mobile honors.
- **Accessible, not color-only** (ADR-018): DOM equivalent of the mobile pattern — `role="img"` + `aria-label` (Spanish state word) or an `sr-only` label, plus a non-color signal (icon/face/text). `null` state renders a distinct "Sin datos" affordance, never coerced into verde/amarillo/rojo.

### Track W3 — US-017: bucket detail (full-stack, net-new both ends)

**Backend (starts at domain/application, never infra-first — Clean Architecture):**
- New use case `apps/api/src/application/use-cases/obtener-detalle-bucket.use-case.ts` returning `Result<T,E>`, never throwing.
- A new narrow reader port (shape is an open design question — see below) + its Prisma implementation. The `account: { userId }` isolation clause (RNF-SEC-006) from `prisma-movimientos-mes.repository.ts` must be preserved; add a `bucketId` filter resolved via the existing `BUCKET_ID_TO_BUCKET` map / `bucket-ids.ts`.
- New endpoint `GET /api/buckets/:bucket?periodo=YYYY-MM` + module (composition-root pattern from `resumen.module.ts`). `:bucket` validated against the `Bucket` enum → invalid returns a scrubbed **400** (money-scrub discipline mirroring `PeriodoInvalidoError`, raw input never reflected).
- BigInt-safe DTO (money as `String(bigint)`, mirroring existing DTOs).
- Integration test asserting **cross-user isolation** (a user cannot read another user's bucket detail).

**Product decision — LOCKED: US-017 detail is a FLAT transaction list (MVP).** Per-transaction breakdown only. **Merchant grouping is OUT/deferred.**

**Frontend:**
- New TanStack Router file-based route (e.g. `routes/buckets.$bucket.tsx`) + query hook, rendering the flat transaction list with exact CLP money.
- The bucket affordance (mobile has a stubbed "Ver detalles ›" for US-017) becomes a real navigable link on web.

## What does NOT change (out of scope)

| Out of scope | Reason |
|--------------|--------|
| Inline category editing (CA-02 of US-017) | Depends on US-013, not this sprint. Leave a **disabled placeholder** in the detail UI. |
| Merchant grouping in bucket detail | Deferred; MVP is a flat per-transaction list (locked). |
| Real user authentication / login | Web stays mono-user behind the proxy, exactly like mobile. |
| Web UI for ingesta (uploading cartolas) | Not part of this sprint. |
| Zustand adoption | Prefer TanStack Router search params for the period selector; whether zustand is introduced at all is a **design-phase decision**, not mandated here. |
| Backfilling mobile's missing `.env.example` | Pre-existing gap; may be a tracked follow-up, not required by Sprint 5. |

## Impact

**Existing files touched:**
- `apps/web/vite.config.ts` — add `configure` header-injection to the existing `/api` proxy.
- `apps/web/src/routes/index.tsx` — replace stale placeholder with the resumen screen.
- `.github/workflows/ci.yml` — add `pnpm web test` + build-time secret-scan step.

**New files (indicative — final shape in design/tasks):**
- Web: `apps/web/.env.example`, `apps/web/src/api/types.ts`, `apps/web/src/api/*` (query hooks/client), `apps/web/src/domain/formatear-monto.ts` (+ spec), `apps/web/src/domain/resumen-view-model.ts` (+ spec), semaforo + resumen components, shadcn primitives via `npx shadcn@latest add`, `apps/web/src/routes/buckets.$bucket.tsx`.
- Web deploy: a Vercel Edge/Serverless Function for `/api/*` (+ any `vercel.json` needed for the function, NOT a header-less rewrite).
- Backend: `apps/api/src/application/use-cases/obtener-detalle-bucket.use-case.ts`, new reader port under `application/ports/`, its Prisma impl under `infrastructure/persistence/`, a bucket-detail DTO + controller + module under `infrastructure/http/`, a new domain error for invalid `:bucket`, and an integration isolation test under `apps/api/test/`.

**Reused as reference (not modified):** mobile `formatear-monto.ts`, `resumen-view-model.ts`, `SemaforoBadge.tsx`, `api/client.ts`; backend `prisma-movimientos-mes.repository.ts`, `prisma-resumen-mes.repository.ts` (`BUCKET_ID_TO_BUCKET`), `bucket-ids.ts`, `movimientos-mes.port.ts` (narrow-port shape), `periodo-invalido.error.ts` (scrub pattern), `constants.ts` (`USER_ID_FIJO_TOKEN`).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| **Two code paths for key injection** (Vite proxy in dev, Vercel function in prod) — different mechanisms, easy to diverge. | Keep both as thin same-origin proxies with identical contract (`/api/*` → inject `x-api-key` → Render). Document both in `.env.example` + runbook. Verify the prod path before closing the sprint. |
| **No Vercel web project exists yet** — ADR-004 names Vercel but no `vercel.json`/project config was found. Prod-side injection depends on it. | Creating the Vercel deployment is explicitly in scope for Tarea 0-W. Treat "prod verified" (function injects header, 200 from Render) as a sprint exit criterion. |
| **US-017 scope creep** (grouping, editing) | Already mitigated by locked decisions: flat-list MVP + disabled placeholder for editing. Do not expand. |
| **Unconfirmed existing isolation test** — no cross-user integration test located for `/api/resumen` or `/api/movimientos` in exploration. | Design phase confirms whether one exists under `apps/api/test/`. Either way, the new bucket-detail endpoint gets its own isolation test (RNF-SEC-006). |
| **No `.env.example` precedent** in the repo (not even mobile). | Tarea 0-W introduces the first one for `apps/web`, documenting the bare `API_KEY` var and the "no `VITE_` prefix" rule. |
| **No CI secret-scan precedent** ("L1.6" does not exist in this repo). | Establish it new (task 0-W.3), scoped to `apps/web` build output; broader gitleaks per ADR-020/021 stays a separate future change. |
| **shadcn has zero installed components** | Scaffolding via `npx shadcn@latest add` is planned work, not a blocker; affects task sizing in the tasks phase. |

## Open questions for design

1. **US-017 reader port shape.** Extend `IMovimientosMesReader.findByPeriodo` with an optional bucket filter (fewer new files, but couples two concerns) vs. a dedicated new narrow `IBucketDetalleReader` port (cleaner separation, matches the one-method-per-need convention, more files). Repo convention favors narrow ports — surface, decide in design.
2. **Period-state location.** TanStack Router search params (URL-idiomatic, no new state lib) vs. a Zustand store (currently a declared-but-unused dependency). Lean toward search params; confirm in design whether any client state genuinely needs zustand.
3. **Dev proxy `configure` exact hook** — confirm the `http-proxy` `proxyReq` event signature and `.env.local` loading path in `vite.config.ts` (Node context) during design/apply.
4. **Isolation-test retroactive gap** — whether to backfill isolation tests for the existing two controllers or only cover the new endpoint.

## Next step

Proceed to `sdd-spec` and `sdd-design` (can run in parallel). Design must resolve the four open questions above before tasks.
