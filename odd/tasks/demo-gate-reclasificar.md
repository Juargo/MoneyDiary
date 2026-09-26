# Feature: demo-gate-reclasificar

**Locator:** `odd/tasks/demo-gate-reclasificar.md` · Engram mirror: `odd/demo-gate-reclasificar/tasks` (via `engram save` CLI)
**Branch:** `fix/demo-gate-reclasificar` (from `main` @ `9e4cbb49`)
**Issue:** #597

## Objective

`PATCH /api/transacciones/:id/categoria` must reject demo sessions with `403 DEMO_SOLO_LECTURA`, like every other write in the catalog/movements area, and the web must stop offering the reclassify control to a demo session.

## Problem / Why

Policy inconsistency, not a cross-tenant leak: each demo session owns its own `User` and data, and `userId` isolation holds. But the product rule is "a demo account is read-only for writes", and this route is the only neighbor that does not enforce it (issue #597).

## Scope

- API: `ReclasificarTransaccionUseCase` (fail-fast `Result.fail(<DemoSoloLectura error>)`), `transacciones.routes.ts` (pass `esDemo: esDemoDeSesion(req)`, map the new error to 403), OpenAPI doc for the route if other gated routes document their 403.
- Web: `ReclasificarCategoriaControl` disabled in demo with an explanatory note, following the `MENSAJE_DEMO_ELIMINAR` precedent.
- Out: other routes, mobile.

## Constraints

- Follow the existing pattern exactly: `movimientos.routes.ts:215`, `categorias.routes.ts`, `patrones.routes.ts`; helper `esDemoDeSesion` (fail-closed).
- Backend: domain/application never throw — `Result.fail`. Error unions are hand-written: `tsc` does not catch a missing variant when errors are structurally equal (known gotcha), so the route test must pin the 403 mapping.
- TDD: **enabled** (`~/.claude/CLAUDE.md`). API runner `pnpm api test` (vitest); web runner `npx vitest run` in `apps/web`, typecheck `npx tsc -b`.
- API CI checklist: test, `tsc`/build, lint, `env:example:check`, `openapi:check`.

## Tasks

- [x] **T1 — API demo gate** (route: delegated writer, together with T2): use case + route + OpenAPI; RED tests for the use case (demo → DemoSoloLectura, no repository write) and the route (demo session → 403 `DEMO_SOLO_LECTURA`; non-demo unchanged).
- [x] **T2 — Web control disabled in demo**: RED test that a demo session sees the control disabled with the note; non-demo unchanged.

## Acceptance criteria

- Demo session: PATCH returns 403 `DEMO_SOLO_LECTURA` and nothing is written; non-demo behavior unchanged.
- Web: demo session sees the control disabled with an explanation.
- API checks (test, build, lint, env:example:check, openapi:check) and web checks (tsc -b, vitest, eslint) green.

## Progress / evidence

- 2026-09-25: created.
- 2026-09-25: T1+T2 implemented (writer). New `ReclasificarDemoSoloLecturaError` (own class, mirrors siblings). RED→GREEN: error module missing → created; use case `esDemo=true` did not fail → fail-fast before `writer.reasignar` (asserted not called); route 6 failures (no `esDemo` in payload, 500 instead of 403) → `esDemoDeSesion(req)` + 403 `DEMO_SOLO_LECTURA` via `responderErrorTraducido`; web control `+` not disabled → `esDemo` prop disables select and `+`, shows `role="note"` `MENSAJE_DEMO_RECLASIFICAR`; caller wiring test first proved a false positive (catalog-loading disabled state) under mutation, rewritten, genuine RED → GREEN. Stale fixture fixed: `app.transacciones.spec.ts` session mock lacked `esDemo` (fail-closed middleware treated it as demo). OpenAPI 403 documented; `openapi.json` + `packages/api-client/src/types.gen.ts` regenerated. Writer: api vitest 2927/2927, build tsc 0, eslint clean, env:example:check + openapi:check OK; web tsc -b 0, vitest 2279/2279, eslint clean. Parent spot check: 3 api test files 22/22; openapi:check OK; web tsc -b 0.
- Out of scope, noted: mobile `mensajeDeErrorReclasificar` has no 403 `DEMO_SOLO_LECTURA` branch (falls to generic copy). Demo is not surfaced on mobile, so it is defensive only.

## Delivery

- Forecast ~150–300 authored lines → single PR, `Closes #597`.

## Next step

Commit, RDD assess, PR (`Closes #597`).
