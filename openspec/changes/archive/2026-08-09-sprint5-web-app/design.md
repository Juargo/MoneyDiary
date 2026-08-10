# Design: Sprint 5 — Web App UI ("Grupo W")

> Phase: `sdd-design`. Input: `sdd/sprint5-web-app/proposal` (#183) + `explore.md`.
> Verified against real code (paths cited). Design in English; Spanish domain/application
> identifiers preserved verbatim (ADR-005). Pragmatic by SOLID/YAGNI/KISS project skills.

## Architecture approach

No new patterns. Reuse the two patterns already proven in the repo:

- **Backend (W3, net-new endpoint):** VO/error → port → use case → Prisma adapter → controller → module,
  exactly mirroring the `resumen` slice (`resumen.controller.ts` / `resumen.module.ts` /
  `prisma-resumen-mes.repository.ts`). Clean Architecture dependency rule `domain ← application ← infrastructure`.
- **Web (W1/W2/W3 UI):** mirror the `apps/mobile` layering — pure `src/domain/` functions +
  `src/api/` hand-written DTO types + same-origin fetch client + TanStack Query hooks + presentational
  components. Web NEVER imports from `apps/api/src/domain` (ADR-008); the HTTP DTO is the only contract.

The secret-injection boundary (Tarea 0-W) is a thin identical proxy in BOTH environments (Vite dev server,
Vercel prod function): receive same-origin `/api/*`, inject `x-api-key` from a Node-side env var, forward to
the NestJS backend. The key never reaches `import.meta.env` / the browser bundle.

---

## Open design question 1 — US-017 reader port shape

**DECISION: a NEW narrow port `IDetalleBucketReader`. Do NOT extend `IMovimientosMesReader`.**

Justification (SOLID ISP + YAGNI, grounded in real code):

- `apps/api/src/application/ports/movimientos-mes.port.ts` self-documents as a *narrow port* ("solo expone la
  consulta que necesita ObtenerMovimientosMesUseCase"). Its sole consumer, `ObtenerMovimientosMesUseCase`
  (`obtener-movimientos-mes.use-case.ts`), never filters by bucket. Adding an optional `bucket?` param would be a
  dead parameter for that consumer — YAGNI rule 3 ("borrar caminos muertos: parámetros que solo reciben el default").
- Precedent already in the repo: `IResumenMesReader` is a *separate* port from `IMovimientosMesReader` even though
  both query the same `Transaccion` table for the same month. The repo consistently splits reader ports by query
  role (SOLID ISP: "ports separados por rol"). A bucket-filtered detail read is a distinct role.
- KISS: the new port carries no `bucketId` field on its row (the bucket is the query input, known by the caller),
  so its shape is smaller than `MovimientoMesRow`.

### Port interface — `apps/api/src/application/ports/detalle-bucket.port.ts`

```ts
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { Bucket } from '../../domain/value-objects/bucket';

/** Proyección de una transacción para el detalle de un bucket (US-017).
 *  Sin `bucketId`: el bucket es el input de la consulta, no un campo de salida.
 *  Montos BigInt — la serialización a string ocurre solo en el DTO HTTP. */
export interface DetalleBucketRow {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly abono: bigint;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
}

/** Narrow reader port: solo la consulta que necesita ObtenerDetalleBucketUseCase. */
export interface IDetalleBucketReader {
  findByPeriodoYBucket(
    userId: string,
    periodo: PeriodoMes,
    bucket: Bucket,
  ): Promise<ReadonlyArray<DetalleBucketRow>>;
}

export const DETALLE_BUCKET_READER = 'IDetalleBucketReader';
```

The port speaks the **domain `Bucket` enum** — physical `bucketId` translation stays in infrastructure.

### Use case — `apps/api/src/application/use-cases/obtener-detalle-bucket.use-case.ts`

Thin coordinator (like `ObtenerMovimientosMesUseCase`). Validates the path `:bucket` against the `Bucket` enum
first, then the optional `periodo`. Returns `Result<T,E>`, never throws.

```ts
export interface ObtenerDetalleBucketResult {
  readonly periodo: string;
  readonly bucket: Bucket;
  readonly transacciones: ReadonlyArray<DetalleBucketRow>;
}

export class ObtenerDetalleBucketUseCase {
  constructor(private readonly reader: IDetalleBucketReader) {}

  async execute(input: {
    userId: string;
    bucket: string;             // raw path param
    periodo: string | undefined;
  }): Promise<Result<ObtenerDetalleBucketResult, BucketInvalidoError | PeriodoInvalidoError>> {
    // 1. Validate :bucket against the Bucket enum → BucketInvalidoError (scrubbed).
    // 2. Resolve periodo: undefined → PeriodoMes.actual(); else PeriodoMes.crear() → PeriodoInvalidoError.
    // 3. rows = await reader.findByPeriodoYBucket(userId, periodoVO, bucketVO)
    // 4. Result.ok({ periodo: periodoVO.valor, bucket, transacciones: rows })
  }
}
```

Bucket validation helper: `Object.values(Bucket).includes(raw as Bucket)` → on miss `Result.fail(new BucketInvalidoError(raw))`.

### Prisma impl — `apps/api/src/infrastructure/persistence/prisma-detalle-bucket.repository.ts`

Preserves the structural `account: { userId }` isolation clause and the half-open `[desde, hasta)` window,
identical to `prisma-movimientos-mes.repository.ts`. Adds the `bucketId` filter via `BUCKET_IDS` (single source
of truth in `bucket-ids.ts`).

**Correctness-critical detail — `SinCategoria` null-fold (must mirror `prisma-resumen-mes.repository.ts`):**
the resumen aggregation folds BOTH `bucketId = null` AND `bucketId = 'bucket-sincategoria'` into `SinCategoria`
(SC-03). The detail query MUST reproduce that fold, or the drill-down totals won't reconcile with the resumen card.

```ts
const where = {
  account: { userId },                              // USER ISOLATION — structural
  fecha: { gte: periodo.desde, lt: periodo.hasta }, // half-open [desde, hasta)
  ...(bucket === Bucket.SinCategoria
    ? { OR: [{ bucketId: null }, { bucketId: BUCKET_IDS[Bucket.SinCategoria] }] }
    : { bucketId: BUCKET_IDS[bucket] }),
};
// select id/fecha/descripcion/cargo/abono + account{banco,tipoCuenta,numeroCuenta}
// orderBy: [{ fecha: 'asc' }, { id: 'asc' }]  (deterministic, same as movimientos)
```

Constructor takes `PrismaService` directly (no NestJS decorators — clean arch).

### Composition-root wiring — `apps/api/src/infrastructure/http/detalle-bucket.module.ts`

Follows `resumen.module.ts` verbatim (useFactory, no PrismaModule import — it is `@Global`):

```ts
providers: [
  { provide: DETALLE_BUCKET_READER,
    useFactory: (prisma: PrismaService) => new PrismaDetalleBucketRepository(prisma),
    inject: [PrismaService] },
  { provide: ObtenerDetalleBucketUseCase,
    useFactory: (reader: IDetalleBucketReader) => new ObtenerDetalleBucketUseCase(reader),
    inject: [DETALLE_BUCKET_READER] },
  { provide: USER_ID_FIJO_TOKEN, useValue: USER_ID_FIJO },
],
controllers: [DetalleBucketController],
```

Register `DetalleBucketModule` in the root module alongside `ResumenModule`.

---

## Open design question 2 — Period state location

**DECISION: TanStack Router search params. Do NOT adopt Zustand.**

Justification (YAGNI):

- The period is URL-addressable, shareable, bookmarkable, back-button state — the URL is its natural home.
  Zustand is declared-but-unused (`stores/` scaffold); introducing it now to hold one string is speculative
  (YAGNI anti-pattern "plugin system with one plugin"). Zustand stays OUT of scope (per proposal).
- Single source of truth: both `useResumen(periodo)` and the detail route read the period from the URL, so no
  cross-component store synchronization is needed (KISS).

### Mechanics

- `routes/index.tsx` declares `validateSearch: (s): { periodo?: string } => ({ periodo: typeof s.periodo === 'string' ? s.periodo : undefined })`.
  It does NOT throw on a malformed value — the backend already returns a scrubbed 400, which the UI surfaces as an
  error state. Absent → hook omits the query param → backend resolves `PeriodoMes.actual()`.
- Period selector: a control that calls `navigate({ search: (prev) => ({ ...prev, periodo }) })`.
- `useResumen(periodo)`: reads `Route.useSearch().periodo`, passes it to the query key + fetch. Query key
  `['resumen', periodo ?? 'actual']`.
- Detail route `routes/buckets.$bucket.tsx`: `$bucket` from the path, `periodo` from its own `validateSearch`
  (same shape). Navigation from the resumen preserves the period:
  `<Link to="/buckets/$bucket" params={{ bucket }} search={{ periodo }}>`.

---

## Open design question 3 — Dev proxy `configure` hook + prod counterpart

**DECISION: `vite.config.ts` → `loadEnv(mode, cwd, '')` (empty prefix) + `server.proxy['/api'].configure`
setting `x-api-key` on `proxyReq`.** The empty prefix is what lets Vite read the **bare** `API_KEY` (no `VITE_`
prefix), which by design is NEVER exposed on `import.meta.env` and never bundled.

### Exact `apps/web/vite.config.ts` change

```ts
import { defineConfig, loadEnv } from 'vite'
// ...existing plugin imports...

export default defineConfig(({ mode }) => {
  // '' prefix → load ALL env vars incl. non-VITE_ ones (bare API_KEY).
  // Runs in the Vite Node process only; never reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [ /* unchanged */ ],
    resolve: { tsconfigPaths: true },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.API_KEY) proxyReq.setHeader('x-api-key', env.API_KEY)
            })
          },
        },
      },
    },
  }
})
```

- `.env.local` (gitignored by Vite default) holds `API_KEY=...`; `loadEnv` reads it. New `.env.example` documents
  `API_KEY=` with a comment: "bare name, NO VITE_ prefix — server-side only, never bundled".
- Browser requests hit same-origin `/api/*` with NO key; the Node proxy injects it. If `API_KEY` is unset the
  header is omitted → backend fail-closed 401, a loud, correct local signal.

### Prod counterpart (Vercel) — identical thin contract

Vercel Serverless Function `apps/web/api/[...path].ts` (catch-all): read `process.env.API_KEY` and
`process.env.API_BASE_URL` (= `https://moneydiary-api.onrender.com`) from Vercel env, forward method + path +
query, inject `x-api-key`, stream the response back. Same three responsibilities as the dev proxy: receive
same-origin `/api/*`, inject header from Node env, forward to Render. No caching of authenticated responses.
REJECTED "Vercel rewrites only" (a rewrite cannot inject a secret header). Exit criterion: prod request returns
200 from Render with no key in the browser bundle.

> Detailed function code is left to `sdd-tasks`; this phase locks the contract so both proxies stay a single
> identical thin shape.

---

## Open design question 4 — Isolation-test retroactive gap

**FINDING (verified, real files): cross-user isolation tests ALREADY EXIST for both existing endpoints.**

- `apps/api/test/movimientos-mes.int-spec.ts` — `AC-10 (user isolation): user B transactions in July NEVER appear
  in user A results` (repo-level, two seeded users, row-identity assertion `returnedIds.not.toContain(userBTx.id)`).
- `apps/api/test/resumen.e2e-spec.ts` — `SC-09: USER_ID_FIJO query only returns USER_ID_FIJO data, not other users`.

**DECISION: do NOT backfill — the gap does not exist.** Spending effort re-covering green paths would violate
YAGNI. The NEW bucket-detail endpoint gets its own isolation test regardless (ADR-015 mandate on `user_id`
isolation for every endpoint returning user data).

### New isolation test — `apps/api/test/detalle-bucket.int-spec.ts`

Follows the `movimientos-mes.int-spec.ts` two-user pattern (strongest — row-identity). Asserts:
1. **Isolation:** a user B transaction in the queried bucket/period NEVER appears in user A's result.
2. **Null-fold correctness:** a user A transaction with `bucketId = null` DOES appear when querying `SinCategoria`,
   and does NOT appear when querying any other bucket (guards the SC-03 fold mirrored from resumen).
Run under the existing `ALLOW_DESTRUCTIVE_DB=1` integration gate (`integration.setup.ts`), not in CI.

---

## Web architecture (W1/W2/W3 UI)

Mirror `apps/mobile` layering. Web MUST NOT import `apps/api/src/domain` (ADR-008).

### `apps/web/src/domain/` — pure functions (Vitest-tested, no React)

- `formatear-monto.ts` — **verbatim port** of `apps/mobile/src/domain/formatear-monto.ts` (BigInt + regex,
  never `Number`/`parseFloat`; rejects empty string). Load-bearing: totals can exceed `Number.MAX_SAFE_INTEGER`.
- `resumen-view-model.ts` — a **lean** port of the mobile mapper: DTO → display strings (per-bucket `total` via
  `formatearMontoCLP`, `porcentajeLabel` with the `null → '—'` sentinel `SIN_PORCENTAJE_LABEL` so `null` never
  renders as "0%", `estadoSemaforo` passthrough, `estadoGlobal` passthrough).
  **YAGNI scope call:** do NOT port `distribucion-gasto.ts` / the pie geometry unless the spec's web UI requires a
  pie chart. Mobile's view-model imports pie helpers; the web resumen UI (US-015/016) is a 50/30/20 breakdown +
  semaforo, not a pie. Port only what the web screens render. *(Flagged for spec alignment — see Risks.)*
- `detalle-bucket-view-model.ts` (optional/thin) — maps `DetalleBucketDto` transactions to display rows
  (`cargo`/`abono` via `formatearMontoCLP`, `fecha` to a short label). May be inlined in the component if trivial (KISS).

### `apps/web/src/api/` — HTTP layer

- `types.ts` — hand-written DTO types mirroring the backend contract EXACTLY (ADR-008/011): `ResumenMesDto`,
  `BucketResumenDto`, `DetalleBucketDto`, `DetalleBucketTransaccionDto`. Money as `string`, `porcentajeBp` as
  `number | null`, `estadoSemaforo`/`estadoGlobal` as `'verde'|'amarillo'|'rojo'|null`.
- `client.ts` — a minimal same-origin fetch client (`fetch('/api/resumen?...')`), NO key, NO base URL (the proxy /
  Vercel function injects the key and same-origin routing handles the host). Maps non-2xx to a typed error
  (surface 400 as "período inválido", 401 as "sin acceso", 5xx as generic). Mirrors mobile's minimal `fetchResumen`.
- Query hooks: `useResumen(periodo)`, `useDetalleBucket(bucket, periodo)` (TanStack Query, already a dependency).

### DTO contract mapping

`ResumenMesDto` (web mirrors verbatim from `apps/api/src/infrastructure/http/dto/resumen-mes.dto.ts`):

```ts
interface BucketResumenDto { bucket: string; total: string; porcentajeBp: number | null; estadoSemaforo: string | null }
interface ResumenMesDto {
  periodo: string; totalIngreso: string; sinIngreso: boolean;
  buckets: ReadonlyArray<BucketResumenDto>;
  targets: { Necesidades: number; Deseos: number; Ahorro: number };
  estadoGlobal: string | null;
}
```

Net-new bucket-detail DTO (backend `apps/api/src/infrastructure/http/dto/detalle-bucket.dto.ts`, flat list, money
as string, `fecha` as ISO-8601 UTC string via `tx.fecha.toISOString()` — the established convention in
`movimiento-mes.dto.ts` / `ingesta-response.dto.ts`):

```ts
interface DetalleBucketTransaccionDto {
  id: string; fecha: string; descripcion: string;
  cargo: string; abono: string;          // BigInt as decimal string
  banco: string; tipoCuenta: string; numeroCuenta: string;
}
interface DetalleBucketDto {
  periodo: string; bucket: string;        // echo the validated bucket
  transacciones: ReadonlyArray<DetalleBucketTransaccionDto>;
}
```

### Semaforo rendering (US-016)

DOM equivalent of `apps/mobile/src/components/SemaforoBadge.tsx`: a `<span role="img" aria-label={label}>` (or an
`sr-only` label) carrying a **non-color** signal (icon/emoji + Spanish state word) plus a tinted background. It
renders the wire `estadoSemaforo` / `estadoGlobal` and NEVER recomputes thresholds (those live in
`apps/api/src/domain/value-objects/estado-semaforo.ts`). `null → distinct "Sin datos"`, never coerced into one of
the three known colors (mirrors mobile's `SIN_DATOS` discipline). Not color-only (ADR-018).

### Routes

- `routes/index.tsx` — replace the stale scaffold (currently a static "Sprint 1 cerrado" placeholder). Renders the
  resumen: period selector, `totalIngreso`, 4 bucket rows with `SemaforoBadge`, `estadoGlobal`. `sinIngreso` →
  empty state ("Sin ingresos este período"), NOT "0%".
- `routes/buckets.$bucket.tsx` — new detail route: flat transaction list with exact CLP amounts. Real navigable
  `<Link>` from each resumen bucket (mobile only had a stubbed "Ver detalles ›"). Inline category-edit is OUT
  (depends on US-013) → disabled placeholder.

---

## Clean Architecture ordering for W3 (never infra-first)

1. **Domain:** `apps/api/src/domain/errors/bucket-invalido.error.ts` — new, mirrors `PeriodoInvalidoError`
   (scrubbed `message`, `rawValue` for server-side logging only, never reflected in HTTP).
2. **Application:** `detalle-bucket.port.ts` (`IDetalleBucketReader` + `DETALLE_BUCKET_READER` token) +
   `obtener-detalle-bucket.use-case.ts` (`Result<T,E>`, never throws).
3. **Infrastructure:** `prisma-detalle-bucket.repository.ts` (isolation + null-fold), `detalle-bucket.dto.ts`
   (mapper), `detalle-bucket.controller.ts` (`GET /api/buckets/:bucket?periodo=YYYY-MM`, translates
   `BucketInvalidoError`/`PeriodoInvalidoError` → scrubbed 400, unexpected → logged 500, mirroring
   `resumen.controller.ts`), `detalle-bucket.module.ts` (composition root).

Controller error translation must include the exhaustiveness `never` guard like `resumen.controller.ts`.

---

## Testing approach

**Web (Vitest + Testing Library, ADR-016/018):**
- `formatear-monto.ts` unit: amount `> Number.MAX_SAFE_INTEGER` (BigInt exactness), negative, zero, empty-string
  rejection.
- `resumen-view-model.ts` unit: `porcentajeBp: null → '—'` vs real `0 → '0%'`; semaforo passthrough.
- Component tests: semaforo for `verde`/`amarillo`/`rojo`/`null` (each an accessible, non-color-only label);
  `sinIngreso` empty state; bucket-detail flat list renders exact CLP.
- `@axe-core` / `vitest-axe` on the new resumen and detail screens (ADR-018, no serious/critical violations).

**Backend (ADR-015):**
- Use-case unit: valid bucket + valid/absent periodo (ok), invalid bucket (`BucketInvalidoError`), invalid periodo
  (`PeriodoInvalidoError`), empty result is success.
- `detalle-bucket.int-spec.ts`: cross-user isolation + SinCategoria null-fold (see Q4).
- `detalle-bucket.e2e-spec.ts`: 200 shape, invalid `:bucket` → scrubbed 400, invalid `periodo` → scrubbed 400.

---

## CI hardening design (`.github/workflows/ci.yml`)

Two additions after the existing "Typecheck web" step:

1. **Web unit tests:** `- name: Unit tests web` → `run: pnpm web test` (today only `pnpm web typecheck` runs;
   `pnpm api test` already runs — this brings web to parity).
2. **Secret-scan step (new precedent — no L1.6 exists):** scoped to `apps/web`, fail-closed. Runs after
   `pnpm web build`. Fails the job (exit 1) if either:
   - the token `VITE_API_KEY` appears anywhere under `apps/web/src/**` (would mean the key was wired to be
     bundled), or
   - the header literal `x-api-key` appears in the built bundle `apps/web/dist/**` (the header must only be set
     server-side in the Vite proxy / Vercel function, neither of which ships to `dist`).

   Shape (grep is preinstalled on `ubuntu-latest`; `!` inverts so a MATCH fails the job):

   ```yaml
   - name: Web secret-scan (fail on bundled API key)
     run: |
       ! grep -rEn 'VITE_API_KEY' apps/web/src
       ! grep -rEn 'x-api-key'    apps/web/dist
   ```

   Broad `gitleaks` (ADR-020/021) stays a separate future change; this step is the minimal scoped guard for the
   `apps/web` secret boundary.

---

## Risks / unresolved for `sdd-tasks`

- **[Correctness — HIGH] SinCategoria null-fold in the detail query** must mirror `prisma-resumen-mes.repository.ts`
  exactly (both `bucketId = null` and `'bucket-sincategoria'`), or drill-down totals won't reconcile with the
  resumen card. The int-spec's null-fold case guards this. Tasks must not drop it.
- **[Scope — spec dependency] Web view-model pie:** design ports only `formatearMontoCLP` + a lean view-model and
  defers `distribucion-gasto`/pie geometry (YAGNI). If the spec's US-015 UI requires the pie chart, tasks must add
  that port; flagged so tasks/spec reconcile before implementation.
- **[Ops — out-of-band] No Vercel project exists yet.** Creating it + setting `API_KEY`/`API_BASE_URL` env is in
  scope but not verifiable from the repo; "prod injects header → 200 from Render, no key in bundle" is the exit
  criterion and a manual gate.
- **[Sizing] shadcn has zero components installed.** Detail/resumen UI needs primitives (`card`, `table`/list,
  `badge`) via `npx shadcn@latest add`; this is scaffolding work that inflates task sizing (affects the 400-line
  budget / chained-PR forecast).
- **[Contract] `fecha` serialization LOCKED to `toISOString()`** (full ISO-8601 UTC) to match existing DTOs; web
  formats for display. Tasks should not invent a `YYYY-MM-DD`-only variant.
- **[Boundary] Two key-injection code paths** (dev Vite / prod Vercel) — keep the identical thin contract; a drift
  between them is the main security regression risk.
