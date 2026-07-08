# AGENTS.md

Personal-finance app that ingests Chilean bank `.xlsx` files. pnpm monorepo: `apps/api` (NestJS + Clean Architecture) + `apps/web` (React 19 + Vite).

Read `CLAUDE.md` for full project context (architecture, ADRs, per-US status, bank-detection patterns). `DESIGN.md` covers design rationale. This file only lists what an agent would otherwise get wrong.

Process artifacts (Scrum) live in the Obsidian vault under `00 Metodología/` (path in `CLAUDE.md`): the canonical **Definition of Done** and **Definition of Ready**. Before marking a US done, check the DoD — its code-facing criteria are the ones below (correct layer, unit tests + `tsc` clean, no secrets/encryption via env, real-fixture verification for pipeline work, Conventional Commits).

## Commands (run from repo root)

Root shortcuts: `pnpm api <x>` → `pnpm --filter @moneydiary/api <x>`, same for `pnpm web`.

```bash
pnpm api test                      # jest (script wraps node --experimental-vm-modules; don't call `jest` directly)
pnpm api test -- -t "name"         # single test by name
pnpm api test -- path/to.spec.ts   # single file
pnpm api test:e2e                  # uses test/jest-e2e.json (separate config)
pnpm api exec tsc --noEmit         # backend typecheck (no `typecheck` script here)
pnpm api start:dev                 # NestJS watch on :3000
pnpm api cli -- ./test/fixtures/movimientos.xlsx   # run ingesta pipeline on a file
pnpm api exec prisma migrate dev   # migrations
pnpm api seed | seed:demo          # ts-node prisma/seed*.ts

pnpm web dev                       # Vite :5173, proxies /api → :3000
pnpm web typecheck                 # runs `tsr generate` then tsc -b — must regen routes first
pnpm web build                     # tsr generate && tsc -b && vite build

pnpm test | pnpm build | pnpm lint # all workspaces (-r)
```

No CI workflows exist in-repo yet (ADR-004 plans GitHub Actions). Verify locally with lint → typecheck → test before relying on green.

## Backend rules (apps/api)

- Clean Architecture dependency direction: `domain ← application ← infrastructure`. Never import the other way.
- Never throw in domain/application — return `Result<T,E>` (`src/shared/result.ts`).
- Naming: domain/application in **Spanish** (VOs, errors, use cases); NestJS infra (controllers, modules, adapters) in **English**. Files `kebab-case.ts`.
- New use case: build domain → application (ports + use case) → infrastructure, in that order.
- Excel: ExcelJS, `.xlsx` only (ADR-007, SheetJS banned for CVEs). Read cells via `cell.text`, NOT `String(cell.value)` (BCI uses richText).
- `@types/node` pinned to `^22` — do not bump to 24 (breaks ExcelJS types).

## Prisma

- Config in `apps/api/prisma.config.ts`; datasource uses `DIRECT_URL ?? DATABASE_URL`. Requires `apps/api/.env` (gitignored) with both URLs (Supabase pooler).
- Do NOT add `earlyAccess: true` — Prisma 7 stable types reject it.

## Frontend (apps/web)

- `src/routeTree.gen.ts` is generated (`tsr generate`) and gitignored. Run a `typecheck`/`build` script to create it before TS will pass.
- No shared domain package: frontend never imports `apps/api/src/domain`. HTTP DTO types are hand-written in `src/api/types.ts` (ADR-008, deliberate).
- shadcn/ui components are copied into `src/components/ui` via `npx shadcn@latest add <name>`, not installed as deps.

## Gotchas

- Security `.npmrc`: `minimum-release-age=10080` (7-day quarantine) + `audit-level=high`. Freshly published deps may be refused on install.
- `pnpm-workspace.yaml` pins `uuid >=11.1.1` override and lists `allowBuilds` for nestjs/prisma/unrs-resolver. Clean installs need `pnpm approve-builds`.
- pnpm isolated resolution: each `apps/*` must declare its direct deps explicitly. "Cannot find module X" that works in tests usually means X is transitive and must be added as a direct dep.
- Files named `... 2.ts` / `... 2.json` (e.g. `package 2.json`, `schema 2.prisma`) are iCloud sync duplicates — ignore and never edit them.
- Commits: Conventional Commits, no AI attribution.
