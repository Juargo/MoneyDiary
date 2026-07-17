# Exploration — Sprint 5 "Grupo W" (Web App UI)

> SDD phase: `explore` · Change: `sprint5-web-app` · Artifact store: hybrid
> Engram mirror: topic `sdd/sprint5-web-app/explore` (obs id 181). This file is the OpenSpec mirror, backfilled by the orchestrator because the explore sub-agent had no Write tool.

## Scope
Resume the deferred web UI in `apps/web`, consuming the backend already in `main`. Three tracks + one security pre-task:
- **Tarea 0-W** — server-side `x-api-key` injection (a SPA cannot custody a secret).
- **Track W1 (US-015)** — month income + 50/30/20 distribution UI (`GET /api/resumen`).
- **Track W2 (US-016)** — semaforo component reading backend-computed state.
- **Track W3 (US-017)** — bucket detail, full-stack (new endpoint + UI). Inline edit (CA-02) is OUT (depends on US-013).

## Current State
`apps/web` is a bare scaffold: `main.tsx` wires `QueryClient` + TanStack Router; `routes/__root.tsx`/`index.tsx` exist but `index.tsx` is stale placeholder content. **No `src/api/`, no `src/stores/`, no `src/components/ui/` exist yet.** Zustand is a declared dependency with zero usage; shadcn is configured (`components.json`) but nothing scaffolded. `vite.config.ts` has a bare pass-through proxy (`/api → localhost:3000`, no header injection). CI (`.github/workflows/ci.yml`) runs `pnpm web typecheck` but **never `pnpm web test`**, and has **no secret-scanning step** (no "L1.6" precedent exists in this repo). No `.env`/`.env.example` file exists anywhere in the repo.

## Backend contract (stable, BigInt-safe)
- `resumen.controller.ts` + `resumen-mes.dto.ts`: `totalIngreso`/`total` as **decimal strings**, `porcentajeBp` as safe number, `estadoSemaforo`/`estadoGlobal` as **lowercase wire strings already computed server-side** (`estado-semaforo.ts`). Web must NOT re-evaluate thresholds.
- `movimientos.controller.ts`: returns `bucketId` as the **physical id**, not the domain `Bucket` enum.

## Mobile reference to port (not reinvent)
- `apps/mobile/src/domain/formatear-monto.ts` — BigInt-only CLP formatting (never `parseFloat`).
- `apps/mobile/src/domain/resumen-view-model.ts` — pure DTO→view-model mapper.
- `SemaforoBadge.tsx` — accessible (non-color-only) badge with `aria`/`accessibilityLabel`.
- `ResumenScreen.tsx` — stubbed "Ver detalles ›" button confirms US-017 is unimplemented on both ends.

## US-017 backend gap
- **Reusable:** `prisma-movimientos-mes.repository.ts` (userId-isolation pattern, no bucket filter yet); `BUCKET_ID_TO_BUCKET` / `BUCKET_IDS` (physical-id ↔ domain-enum translation, `bucket-ids.ts` / `prisma-resumen-mes.repository.ts`).
- **Net-new:** use case `obtener-detalle-bucket.use-case.ts`, port, DTO, `GET /api/buckets/:bucket?periodo=YYYY-MM` controller + module, TanStack Router detail route. `:bucket` validated against the domain `Bucket` enum (400 with money scrub if invalid). userId isolation (RNF-SEC-006) + integration isolation test.

## Approaches — Tarea 0-W (key injection)
1. **Vite proxy `configure` (dev) + Vercel Edge/Serverless Function (prod)** — key never reaches the browser in either env; fits ADR-004. Cons: two code paths. Effort: Medium. **Recommended.**
2. **Vercel `rewrites` only** — architecturally disqualified: rewrites cannot inject a secret header, so the browser would still need to send the key, reproducing the `VITE_API_KEY` mistake. Explicitly reject in the proposal.
3. **Dedicated BFF proxy service** — most flexible, but new infra outside ADR-004. Effort: High.

For US-017 port design (decide in `sdd-design`): extend `IMovimientosMesReader` vs. a new narrow `IBucketDetalleReader` port — repo convention favors **narrow ports**.

## Testing
`apps/web` has Vitest + Testing Library (jsdom, ADR-016). Emphasis per ADR-015: money-exactness (CLP formatter over strings > `Number.MAX_SAFE_INTEGER`) and userId-isolation integration test for the new endpoint.

## Open questions / risks
- CI never runs `pnpm web test`; no CI secret-scan exists despite the "L1.6 mirror" framing — no such precedent found.
- US-017 port shape undecided (extend vs. new port).
- Could not confirm an existing cross-user isolation **test** for `/api/resumen` / `/api/movimientos` — verify in design before assuming one exists.
- No `.env.example` anywhere in the repo (including mobile) — Tarea 0-W introduces the first one.
- No Vercel project config found — prod deployment for `apps/web` may not exist yet; confirm scope.
- Zustand unused — confirm whether Sprint 5 needs it or state should live in TanStack Router search params.

## Ready for proposal
Yes — codebase state is fully mapped for all four sub-scopes (Tarea 0-W, W1, W2, W3).
