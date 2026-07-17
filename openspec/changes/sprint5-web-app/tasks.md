# Tasks: Sprint 5 — Web App UI ("Grupo W")

> Phase: `sdd-tasks`. Inputs: `sdd/sprint5-web-app/spec` (#186), `sdd/sprint5-web-app/design` (#188).
> Strict TDD is active for this project (backend: Vitest/SWC; web: Vitest + Testing Library, already
> installed in `apps/web/package.json` devDependencies). Every task that writes behavior is ordered
> test-first: **write failing test → implement → green**. Clean Architecture ordering for backend:
> domain → application → infrastructure, never infra-first.
>
> Work units follow `work-unit-commits`: one deliverable behavior per commit, tests travel with the
> code they verify. Chaining follows `chained-pr` — see the Review Workload Forecast at the end for
> the recommended slice boundary (decision owned by the orchestrator, not this doc).

---

## Work Unit 0-W — Foundation: server-side key injection + CI hardening

**Blocks W1, W2, W3.** No UI or backend feature work can safely land until same-origin `/api/*` calls
route through a proxy that injects `x-api-key` server-side, because otherwise dev work would either
call Render directly (exposing a key in fetch calls) or 401 against `ApiKeyGuard`.

- [x] **0-W.1** — Dev proxy: extend `apps/web/vite.config.ts` to inject `x-api-key` server-side.
  - Change `defineConfig({...})` → `defineConfig(({ mode }) => {...})`.
  - `const env = loadEnv(mode, process.cwd(), '')` (empty prefix — loads bare `API_KEY`, never
    `import.meta.env`).
  - `server.proxy['/api'].configure = (proxy) => proxy.on('proxyReq', (proxyReq) => { if (env.API_KEY) proxyReq.setHeader('x-api-key', env.API_KEY) })`.
  - Manual verification (no automated test for Vite config — Node-only, not covered by `vitest`):
    set `apps/web/.env.local` with a real `API_KEY`, run `pnpm web dev`, confirm `GET /api/resumen`
    proxies to `localhost:3000` with the header attached (network tab shows no key in the request
    initiated from the browser — only the proxied outbound request carries it).
  - File: `apps/web/vite.config.ts` (existing file, `configure` hook is new).

- [x] **0-W.2** — `apps/web/.env.example` (new file, first `.env.example` in the repo).
  - Document `API_KEY=` with a comment: bare name, NO `VITE_` prefix, server-side only, never bundled.
  - File: `apps/web/.env.example`.

- [x] **0-W.3** — Prod proxy: Vercel catch-all function.
  - `apps/web/api/[...path].ts` — reads `process.env.API_KEY` and `process.env.API_BASE_URL`
    (`https://moneydiary-api.onrender.com`), forwards method + path + query to Render, injects
    `x-api-key`, streams the response back unchanged. No caching of authenticated responses.
  - Add `vercel.json` only if required to route `/api/*` to the function (NOT a header-less rewrite —
    locked decision in proposal, rewrites cannot inject a secret header).
  - This task is not unit-testable in isolation (serverless runtime); the exit criterion is the manual
    prod check in `0-W.5`.
  - Files: `apps/web/api/[...path].ts`, `apps/web/vercel.json` (if needed).

- [x] **0-W.4** — CI hardening: `.github/workflows/ci.yml`.
  - Add `- name: Unit tests web` → `run: pnpm web test` immediately after the existing
    `- name: Typecheck web` step (today only typecheck runs for web).
  - Add `- name: Build web` → `run: pnpm web build` (needed so `dist/` exists for the scan below;
    no such step exists today).
  - Add `- name: Web secret-scan (fail on bundled API key)`:
    ```yaml
    run: |
      ! grep -rEn 'VITE_API_KEY' apps/web/src
      ! grep -rEn 'x-api-key'    apps/web/dist
    ```
  - Verify locally first: `pnpm web test`, `pnpm web build`, then run the two grep lines by hand to
    confirm they currently pass (no match) against the pre-W1/W2/W3 scaffold.
  - File: `.github/workflows/ci.yml` (existing file, `ci` job — after `Typecheck web`, before `landing`
    job).

- [~] **0-W.5** — Manual verification checklist (not a commit, a gate before starting W1/W2/W3 work
  or before closing the sprint for the prod half):
  - [x] Dev proxy config verified via `pnpm web typecheck` + `pnpm web test` + `pnpm web build` (all
    green) and the CI secret-scan grep lines run by hand (both pass clean on the built `dist/`, and
    were proven to fail on a deliberately planted `VITE_API_KEY`/`x-api-key` string). Full manual
    browser round-trip (`pnpm web dev` + `pnpm api start:dev`, live `/api/resumen` call) still needs a
    human with a real `.env.local` `API_KEY` — not run by this automated apply pass.
  - [ ] Prod (blocked — no Vercel project exists yet; deferred to the end of the sprint, tracked here
    so it isn't dropped): deployed Vercel URL returns 200 from `/api/resumen`, `dist/` has no
    `x-api-key`/`VITE_API_KEY` string (spot-check with the same grep used in CI).

**Work unit boundary:** 0-W.1 + 0-W.2 + 0-W.4 can land as one commit/PR (`apps/web` config + CI, no
runtime dependency on Vercel existing). 0-W.3 + the prod half of 0-W.5 can land as a second, smaller
commit once a Vercel project exists — do not block W1/W2/W3 dev work on Vercel project creation
(dev proxy alone unblocks local development).

---

## Work Unit W1 — US-015: month income + 50/30/20 distribution UI

**Depends on:** 0-W.1 (dev proxy) for local dev; not on 0-W.3 (prod).

### Domain (pure functions, Vitest, no React — test-first)

- [ ] **W1.1** — `apps/web/src/domain/formatear-monto.spec.ts` (write first): port the mobile test
  cases verbatim — amount `> Number.MAX_SAFE_INTEGER` renders exact digits, negative, zero, empty-string
  rejection. Reference: `apps/mobile/src/domain/formatear-monto.spec.ts`.
- [ ] **W1.2** — `apps/web/src/domain/formatear-monto.ts`: verbatim port of
  `apps/mobile/src/domain/formatear-monto.ts` (BigInt + regex, never `Number`/`parseFloat`). Make
  W1.1 pass.
- [ ] **W1.3** — `apps/web/src/domain/resumen-view-model.spec.ts` (write first): `porcentajeBp: null`
  → `'—'` (`SIN_PORCENTAJE_LABEL`) vs. real `0` → `'0%'`; `estadoSemaforo`/`estadoGlobal` passthrough
  (no recomputation); money fields pre-formatted via `formatearMontoCLP`. Reference:
  `apps/mobile/src/domain/resumen-view-model.spec.ts` — **port only the resumen/semaforo cases, not
  the pie/distribution cases** (YAGNI call from design; see Risks in design.md).
- [ ] **W1.4** — `apps/web/src/domain/resumen-view-model.ts`: lean port — DTO → display strings. Do
  **not** port `distribucion-gasto.ts` / `pie-geometry.ts` (no pie chart in W1/W2 scope per design).
  Make W1.3 pass.

### API layer

- [ ] **W1.5** — `apps/web/src/api/types.ts`: hand-written DTO types mirroring
  `apps/api/src/infrastructure/http/dto/resumen-mes.dto.ts` exactly — `ResumenMesDto`,
  `BucketResumenDto` (`bucket: string; total: string; porcentajeBp: number | null; estadoSemaforo: string | null`),
  `targets: { Necesidades: number; Deseos: number; Ahorro: number }`, `estadoGlobal: string | null`.
  Web does NOT import from `apps/api/src/domain` (ADR-008).
- [ ] **W1.6** — `apps/web/src/api/client.ts`: minimal same-origin fetch client, `fetch('/api/resumen?periodo=...')`,
  no key, no base URL. Maps non-2xx → typed error (400 → "período inválido", 401 → "sin acceso", 5xx →
  generic). Mirrors mobile's `fetchResumen` shape.
- [ ] **W1.7** — `apps/web/src/api/use-resumen.ts` (or co-located in `client.ts` if trivial — KISS
  call at implementation time): `useResumen(periodo)` TanStack Query hook. Reads
  `Route.useSearch().periodo` from the calling route; query key `['resumen', periodo ?? 'actual']`.

### Routes / period state

- [ ] **W1.8** — `apps/web/src/routes/index.tsx`: add
  `validateSearch: (s): { periodo?: string } => ({ periodo: typeof s.periodo === 'string' ? s.periodo : undefined })`.
  Does not throw on a malformed value (backend returns scrubbed 400, surfaced as the error state).

### Components (test-first, Testing Library)

- [ ] **W1.9** — shadcn scaffolding: `npx shadcn@latest add card badge` (zero components installed
  today — first-time cost). Only add primitives actually consumed by W1/W2 components (`card` for the
  resumen layout, `badge` for bucket rows); do not pre-install unused primitives (YAGNI).
- [ ] **W1.10** — `apps/web/src/components/states/{Loading,Error,Empty}.tsx` + specs (write specs
  first): DOM equivalents of `apps/mobile/src/components/states/*.tsx`. `Empty` copy invites cartola
  upload, not a bare "0%" (spec W1-02).
- [ ] **W1.11** — `apps/web/src/components/IngresoCard.tsx` + spec (write first): renders
  `totalIngreso` via the view-model's pre-formatted string. Test: amount beyond safe-integer precision
  renders every digit exactly (spec W1-01).
- [ ] **W1.12** — `apps/web/src/components/PeriodoSelector.tsx` + spec (write first): calls
  `navigate({ search: (prev) => ({ ...prev, periodo }) })`.
- [ ] **W1.13** — Replace `apps/web/src/routes/index.tsx` placeholder ("Sprint 1 cerrado" copy) with
  the real resumen screen: period selector, `IngresoCard`, 4 bucket rows, wires `useResumen`,
  Loading/Error/Empty states, `sinIngreso` → Empty (not "0%"). Component test (write first):
  income + all 4 slices visible without scrolling on a standard viewport (spec W1-02); exactly one of
  loading/error/empty renders when data is unavailable.

**Work unit boundary:** W1.1–W1.4 (domain, no UI) can land as its own commit. W1.5–W1.8 (API layer +
route search params) as a second. W1.9–W1.13 (components + screen) as a third — this is the largest
slice because of the shadcn scaffolding cost (0 components → first install) and the full resumen
screen wiring.

---

## Work Unit W2 — US-016: semaforo component

**Depends on:** W1.4 (`resumen-view-model.ts` passthrough), W1.9 (shadcn `badge` if used for styling).
Small enough to fold into the same PR/commit sequence as W1's component slice, but tracked separately
because it maps to its own spec requirements (W2-01/W2-02) and its own test file.

- [ ] **W2.1** — `apps/web/src/components/SemaforoBadge.spec.tsx` (write first): DOM equivalent of
  `apps/mobile/src/components/SemaforoBadge.spec.tsx` — cases for `verde`/`amarillo`/`rojo`/`null`.
  Assert: (a) the wire value is rendered verbatim with no client-side threshold math, (b) `null` shows
  a distinct "Sin datos" affordance never coerced into a known color, (c) a non-color signal exists
  (`aria-label` or `sr-only` text — not color alone, ADR-018).
- [ ] **W2.2** — `apps/web/src/components/SemaforoBadge.tsx`: DOM port of
  `apps/mobile/src/components/SemaforoBadge.tsx` — `<span role="img" aria-label={label}>` (or an
  `sr-only` label) + icon/emoji + Spanish state word + tinted background via the `ESTILOS`/`SIN_DATOS`
  map. Renders `estadoSemaforo`/`estadoGlobal` passthrough only — no import of
  `apps/api/src/domain/value-objects/estado-semaforo.ts` logic. Make W2.1 pass.
- [ ] **W2.3** — Wire `SemaforoBadge` into the W1.13 resumen screen (per-bucket rows + `estadoGlobal`
  summary). Extend the W1.13 screen test with a semaforo assertion, or add a small integration test in
  `ResumenScreen.spec.tsx` verifying the badge receives the DTO's `estadoSemaforo` unchanged.

**Work unit boundary:** W2.1+W2.2 (isolated component) is a clean standalone commit; W2.3 (wiring)
naturally travels with — or immediately after — W1.13's commit, since it wires into the same screen.

---

## Work Unit W3 — US-017: bucket detail (full-stack, net-new both ends)

**Backend first (Clean Architecture: domain → application → infrastructure), then web.** This is the
largest and highest-risk unit — flagged in design as containing a correctness-critical detail (the
`SinCategoria` null-fold) that must not be dropped.

### Backend — domain (test-first)

- [ ] **W3.1** — `apps/api/src/domain/errors/bucket-invalido.error.spec.ts` (write first): mirrors
  `periodo-invalido.error.ts` test shape — scrubbed `message` (never contains raw input),
  `rawValue` present for server-side logging only.
- [ ] **W3.2** — `apps/api/src/domain/errors/bucket-invalido.error.ts`: `BucketInvalidoError extends Error`,
  same shape as `PeriodoInvalidoError` (constructor takes raw string, sets scrubbed `message` + `rawValue`,
  `name = 'BucketInvalidoError'`). Make W3.1 pass.

### Backend — application (test-first)

- [ ] **W3.3** — `apps/api/src/application/ports/detalle-bucket.port.ts`: `DetalleBucketRow` interface
  (`id, fecha: Date, descripcion, cargo: bigint, abono: bigint, banco, tipoCuenta, numeroCuenta` — no
  `bucketId` field, per design's KISS call) + `IDetalleBucketReader.findByPeriodoYBucket(userId, periodo: PeriodoMes, bucket: Bucket)`
  + `export const DETALLE_BUCKET_READER = 'IDetalleBucketReader'`. Ports are interfaces — no test file
  (mirrors `movimientos-mes.port.ts`, which has none).
- [ ] **W3.4** — `apps/api/src/application/use-cases/obtener-detalle-bucket.use-case.spec.ts` (write
  first): cases — valid bucket + valid periodo (ok), valid bucket + absent periodo (resolves
  `PeriodoMes.actual()`), invalid bucket → `Result.fail(BucketInvalidoError)`, invalid periodo →
  `Result.fail(PeriodoInvalidoError)`, empty result array is still `Result.ok` (not an error). Mock
  `IDetalleBucketReader`.
- [ ] **W3.5** — `apps/api/src/application/use-cases/obtener-detalle-bucket.use-case.ts`:
  `ObtenerDetalleBucketUseCase` — validates `:bucket` against `Object.values(Bucket).includes(raw as Bucket)`
  first (miss → `Result.fail(new BucketInvalidoError(raw))`), then resolves `periodo` (undefined →
  `PeriodoMes.actual()`; present → `PeriodoMes.crear()` → `PeriodoInvalidoError` on failure), then
  calls `reader.findByPeriodoYBucket(...)`, returns `Result.ok({ periodo, bucket, transacciones })`.
  `Result<T,E>`, never throws. Make W3.4 pass.

### Backend — infrastructure (test-first)

- [ ] **W3.6** — `apps/api/src/infrastructure/persistence/prisma-detalle-bucket.repository.spec.ts`
  (write first): asserts the `where` clause shape — **the `SinCategoria` case MUST produce
  `OR: [{ bucketId: null }, { bucketId: BUCKET_IDS[Bucket.SinCategoria] }]`**, every other bucket
  produces `bucketId: BUCKET_IDS[bucket]`; `account: { userId }` always present; `fecha` half-open
  `[desde, hasta)`; `orderBy: [{ fecha: 'asc' }, { id: 'asc' }]`. This test is the guard for the
  design's flagged HIGH-risk correctness item — do not drop or weaken these assertions. Reference
  shape: `apps/api/src/infrastructure/persistence/prisma-resumen-mes.repository.spec.ts` (SinCategoria
  fold case) + `prisma-movimientos-mes.repository.ts` (isolation + window pattern).
- [ ] **W3.7** — `apps/api/src/infrastructure/persistence/prisma-detalle-bucket.repository.ts`:
  `PrismaDetalleBucketRepository implements IDetalleBucketReader`. Constructor takes `PrismaService`
  directly (no NestJS decorators). Uses `BUCKET_IDS` from `bucket-ids.ts` (existing single source of
  truth). Make W3.6 pass.
- [ ] **W3.8** — `apps/api/src/infrastructure/http/dto/detalle-bucket.dto.spec.ts` (write first):
  money fields serialize as decimal strings (`String(bigint)`, not `Number()`), `fecha` as full
  ISO-8601 UTC via `.toISOString()` (locked convention — do not invent a `YYYY-MM-DD`-only variant),
  `bucket` echoes the validated input.
- [ ] **W3.9** — `apps/api/src/infrastructure/http/dto/detalle-bucket.dto.ts`: `DetalleBucketTransaccionDto`
  (`id, fecha, descripcion, cargo, abono, banco, tipoCuenta, numeroCuenta`) + `DetalleBucketDto`
  (`periodo, bucket, transacciones`) + mapper function (mirrors `aResumenMesDto` /
  `movimiento-mes.dto.ts` shape). Make W3.8 pass.
- [ ] **W3.10** — `apps/api/src/infrastructure/http/detalle-bucket.controller.spec.ts` (write first,
  e2e-style unit or controller-level per existing `resumen.controller` test conventions): 200 shape
  for a valid `:bucket`, `BucketInvalidoError` → scrubbed 400 (raw `:bucket` value never reflected in
  body), `PeriodoInvalidoError` → scrubbed 400, unexpected error → logged + generic 500, exhaustiveness
  `never` guard present for future error types.
- [ ] **W3.11** — `apps/api/src/infrastructure/http/detalle-bucket.controller.ts`:
  `GET /api/buckets/:bucket?periodo=YYYY-MM` — mirrors `resumen.controller.ts` structure exactly
  (`@Controller('api/buckets')`, `@Get(':bucket')`, `@Inject(USER_ID_FIJO_TOKEN)`, try/catch around the
  use case call, `Result.isFail()` branch with `BucketInvalidoError`/`PeriodoInvalidoError` → 400,
  exhaustive `never` guard → 500). Make W3.10 pass.
- [ ] **W3.12** — `apps/api/src/infrastructure/http/detalle-bucket.module.ts`: composition root,
  mirrors `resumen.module.ts` verbatim shape (`useFactory` providers for `DETALLE_BUCKET_READER` →
  `PrismaDetalleBucketRepository`, `ObtenerDetalleBucketUseCase`, `USER_ID_FIJO_TOKEN` value provider;
  `controllers: [DetalleBucketController]`; no `PrismaModule` import — it's `@Global`).
- [ ] **W3.13** — Register `DetalleBucketModule` in the root app module alongside `ResumenModule`
  (find the existing root module import list — same place `ResumenModule`/`MovimientosModule` are
  registered).

### Backend — integration test (isolation + null-fold, ADR-015 mandate)

- [ ] **W3.14** — `apps/api/test/detalle-bucket.int-spec.ts`: two-user pattern from
  `apps/api/test/movimientos-mes.int-spec.ts` (AC-10). Assertions:
  1. **Isolation**: a user B transaction in the queried bucket/period never appears in user A's result
     (row-identity assertion, `returnedIds.not.toContain(userBTx.id)`).
  2. **Null-fold**: a user A transaction with `bucketId = null` appears when querying `SinCategoria`,
     and does NOT appear when querying any other bucket.
  Runs under the existing `ALLOW_DESTRUCTIVE_DB=1` gate via `integration.setup.ts` — not in CI (matches
  `movimientos-mes.int-spec.ts` precedent). Do NOT backfill isolation tests for `/api/resumen` or
  `/api/movimientos` — design confirmed both already have one (YAGNI, do not re-cover green paths).
- [ ] **W3.15** — `apps/api/test/detalle-bucket.e2e-spec.ts`: 200 shape end-to-end, invalid `:bucket`
  → scrubbed 400, invalid `periodo` → scrubbed 400. Mirrors `resumen.e2e-spec.ts` structure.

### Web — API layer + domain (test-first)

- [ ] **W3.16** — Extend `apps/web/src/api/types.ts`: `DetalleBucketTransaccionDto`, `DetalleBucketDto`
  (matches W3.9 backend DTO exactly).
- [ ] **W3.17** — `apps/web/src/domain/detalle-bucket-view-model.spec.ts` (write first, only if the
  mapping isn't trivial enough to inline in the component — KISS call made at implementation time):
  maps transactions to display rows (`cargo`/`abono` via `formatearMontoCLP`, `fecha` to a short
  label).
- [ ] **W3.18** — `apps/web/src/domain/detalle-bucket-view-model.ts` (or inlined in the component):
  make W3.17 pass if extracted.
- [ ] **W3.19** — `apps/web/src/api/use-detalle-bucket.ts`: `useDetalleBucket(bucket, periodo)`
  TanStack Query hook, same-origin `GET /api/buckets/:bucket?periodo=...`, same error-mapping
  discipline as `client.ts` (W1.6).

### Web — route + components (test-first)

- [ ] **W3.20** — `apps/web/src/routes/buckets.$bucket.tsx`: `$bucket` from the path, own
  `validateSearch: { periodo?: string }` (same shape as `routes/index.tsx`).
- [ ] **W3.21** — `apps/web/src/components/BucketDetailList.spec.tsx` (write first): flat list renders
  exact CLP amounts (spec W3-03); a `SinCategoria` row shows a "classify" CTA; any inline-edit control
  on a row renders visibly `disabled` (CA-02 placeholder, deferred — depends on US-013, do not wire
  real editing).
- [ ] **W3.22** — `apps/web/src/components/BucketDetailList.tsx`: flat transaction list component,
  wires `useDetalleBucket`, uses shadcn primitives from W1.9 (add `table` or list primitive via
  `npx shadcn@latest add table` if not already covered by `card`). Make W3.21 pass.
- [ ] **W3.23** — Wire `<Link to="/buckets/$bucket" params={{ bucket }} search={{ periodo }}>` from
  each W1.13 resumen bucket row (real navigable link — mobile only has a stubbed "Ver detalles ›").
  Extend the W1.13 screen test or add a small navigation-focused test asserting the link target.

**Work unit boundary:** backend (W3.1–W3.15) is one coherent full-stack-backend commit sequence and
the natural first slice of this unit — it is independently reviewable and testable without any web
code. Web (W3.16–W3.23) is a second, dependent slice. Given the size of W3 backend alone (domain +
application + infra + controller + module + wiring + 2 test files), see the Review Workload Forecast
below for whether W3 backend and W3 web need to be separate PRs.

---

## Review Workload Forecast

Rough estimate of changed lines per work unit (source + test, generous but not padded — based on
sibling-file sizes already in the repo: `resumen.controller.ts` ≈80 lines, `prisma-resumen-mes.repository.ts`
+ spec ≈150–200 lines combined, mobile `resumen-view-model.ts` + spec ≈120 lines combined).

| Work unit | Scope | Est. changed lines |
|---|---|---|
| 0-W | Vite proxy diff, `.env.example`, Vercel fn (new, ~40-60 lines), CI diff (~15 lines) | ~150–200 |
| W1 | domain (2 files + 2 specs, ported ≈small), api layer (types/client/hook), shadcn scaffolding (generated files, often 100+ lines each from `npx shadcn add`), states components + specs, IngresoCard + spec, PeriodoSelector + spec, resumen screen rewrite + spec | ~500–650 (shadcn-generated component files inflate this significantly — `card.tsx`/`badge.tsx` from shadcn are typically 30–80 lines EACH, non-negotiable boilerplate) |
| W2 | SemaforoBadge.tsx + spec, wiring into W1 screen | ~120–160 |
| W3 backend | domain error+spec, port, use-case+spec, Prisma repo+spec, DTO+spec, controller+spec, module, root wiring, int-spec, e2e-spec | ~600–750 (9 new files + 2 test files, mirrors resumen slice which itself is several hundred lines across its files) |
| W3 web | types extension, view-model+spec (maybe), query hook, route, BucketDetailList+spec, resumen-screen link wiring | ~250–350 |

**Total estimate: ~1,600–2,100 changed lines** across the whole change — far above a single 400-line
PR budget under any grouping.

- **400-line budget risk: High** — every work unit above except W2 alone already meets or exceeds 400
  lines on its own; W1 is inflated by first-time shadcn scaffolding (zero components installed today),
  W3 backend is a full new Clean-Architecture vertical slice plus two test files at ADR-015's
  isolation-test mandate.
- **Chained PRs recommended: Yes.**
- **Proposed slice boundary** (natural boundaries per the orchestrator's suggested split, refined by
  work-unit dependency order):
  1. **PR 1 — Tarea 0-W foundation**: 0-W.1, 0-W.2, 0-W.4 (dev proxy + `.env.example` + CI). ~150–200
     lines. 0-W.3 (Vercel fn) can either join this PR or become a thin follow-up once a Vercel project
     exists — recommend keeping it in PR 1 if the Vercel project can be created without blocking, since
     it's small and self-contained; otherwise split as PR 1b.
  2. **PR 2 — W1 + W2 (read UI)**: full resumen screen + semaforo, since W2 depends on W1's view-model
     and both wire into the same screen. Likely needs its OWN internal split given the ~650–800 line
     combined estimate — candidate sub-split: **domain+api layer** (W1.1–W1.8, ~250 lines) as PR 2a,
     **components+screen+semaforo** (W1.9–W1.13 + W2, ~450–550 lines, shadcn-heavy) as PR 2b.
  3. **PR 3 — W3 full-stack detail**: backend (W3.1–W3.15) and web (W3.16–W3.23) are large enough to
     warrant their own split too — **PR 3a backend** (~600–750 lines, independently testable/reviewable
     without any web code) then **PR 3b web** (~250–350 lines, depends on 3a's DTO shape being merged
     or at least stable).
- **Decision needed before apply: Yes** — per `delivery_strategy: ask-on-risk`, the orchestrator must
  ask whether to use the 5-slice chain above (0-W / 2a / 2b / 3a / 3b) or a coarser 3-slice chain
  (0-W / W1+W2 / W3), and which chain strategy (`stacked-to-main` vs `feature-branch-chain`) — W3b's
  hard dependency on W3a's DTO shape being stable is the strongest argument for
  `feature-branch-chain` if the team wants review isolation without risking a stale contract, or
  `stacked-to-main` if fast sequential merges are preferred (W3a can merge to main before W3b starts).

---

## Task-to-requirement traceability

| Requirement | Tasks |
|---|---|
| W0-01 (no key in bundle, CI-enforced) | 0-W.1, 0-W.2, 0-W.4 |
| W0-02 (same-origin proxy injects key, dev+prod) | 0-W.1, 0-W.3, 0-W.5 |
| W0-03 (`.env.example` documents bare key) | 0-W.2 |
| W1-01 (money renders exactly from BigInt string) | W1.1, W1.2, W1.11 |
| W1-02 (no-scroll + 3 explicit non-data states) | W1.10, W1.13 |
| W2-01 (semaforo renders only backend-computed state) | W2.1, W2.2 |
| W2-02 (semaforo readable without color; null distinct) | W2.1, W2.2 |
| W3-01 (flat, BigInt-safe, isolated bucket-detail list) | W3.3–W3.14, W3.16 |
| W3-02 (invalid `:bucket` → scrubbed 400) | W3.1, W3.2, W3.5, W3.10, W3.11, W3.15 |
| W3-03 (exact CLP, classify CTA, disabled edit placeholder) | W3.17, W3.18, W3.21, W3.22 |
