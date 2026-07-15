# Proposal — sprint3-mvp-mobile: read-only mobile MVP into the store pipeline

Get a **read-only mobile MVP into the app-store pipeline**. A minimal Expo app shows monthly income + the 50/30/20 distribution + the semáforo, running on a real device against `apps/api` deployed on Render (protected by an API key), uploaded to TestFlight and Play closed testing. The goal is **entering the pipeline and learning the mobile/store domain first-hand** — not being publicly live.

This proposal covers the **software work** for that goal: **Track A** (deploy + access verification) and **Track B** (the Expo read-only app). Store-side procedures (Track C) are external ops on the real critical path and are referenced, not built here.

## Quick path (what this change delivers)

1. **Deploy** `apps/api` to Render and verify access control end-to-end with `curl` (A.3, A.4).
2. **Decide + document** the encryption-at-rest posture for this release (A.5) — accepted risk with a hard trigger, no new crypto code.
3. **Scaffold** a real Expo app in `apps/mobile` (Expo Router + NativeWind), add it to the pnpm workspace, and build **one** read-only screen that consumes `GET /api/resumen` and renders income + 50/30/20 + semáforo with loading/empty/error/data states.
4. **Test** it per ADR-017 (jest-expo unit + RNTL screen), reusing the existing Maestro `resumen-semaforo.yaml`.

## Why now / intent

- **Business pivot to the mobile pipeline.** Sprint 3 was re-scoped (PO decision, 2026-07-13) away from finishing the web visualization UI (US-015/016/017) toward getting *something* into the store pipeline. The store clocks (Play closed-testing 14-day/12-tester window, Apple financial-app review scrutiny) are external and long; the sooner we enter, the sooner we learn.
- **Learn the store domain by doing it.** The team has never shipped through TestFlight/Play. A tiny, honest, read-only slice is the cheapest way to exercise the full pipeline (EAS build → store upload → closed testing → real-device run against a real deployed API) and surface unknowns early.
- **The contract is ready.** `GET /api/resumen?periodo=YYYY-MM` is stable on `main` (backend for US-015/016 already merged, PRs #22/#23). It returns aggregated bucket totals + percentages + semáforo state — **zero PII** — which makes it the ideal first endpoint to expose externally.

## In scope

### Track A — deploy + access (A.1/A.2 already DONE on main)

| Item | Work |
|------|------|
| **A.3** | Deploy `apps/api` to Render via the existing `render.yaml` Blueprint; load the 3 `sync:false` secrets (`DATABASE_URL`, `DIRECT_URL`, `API_KEY`) in the dashboard. Ops/dashboard step — no code. |
| **A.4** | `curl` e2e verification: health `/` → **200** (public), `/api/resumen` **without** key → **401**, `/api/resumen` **with** `x-api-key` → **200** + JSON. Runbook already scripts this. |
| **A.5** | **Decide + document** encryption-at-rest posture (see "Encryption debt" below). Documentation only. |
| Doc fix | Correct the **stale docstring** in `resumen.controller.ts` ("Intentionally unauthenticated for MVP mono-user phase") — `ApiKeyGuard` is a global `APP_GUARD`, so the endpoint IS protected. Trivial doc change, no behavior change. |

### Track B — Expo read-only app (`apps/mobile`)

| Item | Work |
|------|------|
| Workspace | Remove `!apps/mobile` from `pnpm-workspace.yaml`; pin Expo SDK / RN / expo-router / nativewind to concrete stable versions (verify current stable via Context7/official docs at scaffold time). |
| Scaffold | Real Expo Router app: thin `app/_layout.tsx` + single `app/index.tsx`. Add `app.json`/`app.config.ts`, NativeWind config, babel plugin, env handling. |
| Structure | Clean-ish split mirroring the seeded layout: `src/domain/` (pure functions), `src/api/` (HTTP client), `src/components/` (presentational RN). |
| HTTP client | **Minimal hand-written** fetch wrapper → `GET /api/resumen`; base URL + key from `EXPO_PUBLIC_*`; maps 401/network/parse failures to a typed error state. |
| Screen | **Exactly one** "momento semáforo" screen: income + 50/30/20 per-bucket totals/percentages + global semáforo, with **loading / empty (`sinIngreso`) / error / data** states. Copy + testIDs satisfy the Maestro contract (`"Distribución 50/30/20"`, bucket names, `testID: "semaforo-global"`). |
| CLP formatting | New **BigInt-string-safe** money formatter (`formatearMontoCLP(montoStr: string)`) — operates on `BigInt(montoStr)` / string digits, **never** `parseFloat`/`Number()` (ADR-015 money discipline). Render `null` `porcentajeBp` / `sinIngreso` distinctly from `0%`. |
| Tests | jest-expo **domain unit** (CLP-from-string edge cases, resumen→view-model mapping, null/`sinIngreso` rendering) + **RNTL** screen-state tests; reuse Maestro `resumen-semaforo.yaml` (manual/local — needs a device + dev build, not CI-gated this sprint). |
| Cleanup | The leftover `apps/mobile/.maestro/login.yaml` is a **dead flow** (no user login — the key is baked at build time). Remove/ignore it; `resumen-semaforo.yaml` must not depend on it. |

## Non-goals (explicit)

- **Per-install / per-user auth or token exchange.** Out of scope — materially bigger effort. This MVP uses a single static key (see below). Future work.
- **Real column encryption (task 11.6 / `NoOpCryptoService`).** Not advanced this sprint — `/api/resumen` carries zero PII, so advancing it would not reduce this release's exposure. Documented as accepted risk with a trigger.
- **Formal `@moneydiary/api-client` (ADR-011/012).** No `openapi.json` exists; building it now is high-effort scope creep. The minimal client is deliberate, tracked debt.
- **File ingestion / any write path on mobile.** Read-only only.
- **Multi-screen navigation / login/home shell.** One screen. Expo Router `_layout.tsx` exists only as the required root wrapper.
- **Web visualization UI (US-015/016/017).** Deferred — this is the Sprint 3 re-scope's whole point.
- **Track C (store procedures).** External ops, not code. Referenced as the real critical path (start in parallel now), not built here.

## Approach

- **App shape:** single-screen Expo Router (`app/_layout.tsx` root wrapper + `app/index.tsx`). View states are internal component state, not routes. Matches the flat Maestro flow and the "deliberately minimal" sprint intent.
- **HTTP:** hand-written fetch wrapper in `src/api/`, one endpoint, typed error mapping. Logged as debt against the eventual `@moneydiary/api-client`.
- **Config injection:** `EXPO_PUBLIC_API_BASE_URL` (non-secret, safe to embed) + `EXPO_PUBLIC_API_KEY`.
  - **This key is a deterrent, not real auth.** Any value the client must send on **every** request is inlined into the compiled binary and is trivially extractable from a downloadable TestFlight/Play build. **There is no safer option under the current single-static-key design** — an EAS "secret"-visibility var cannot both reach client fetch code and stay absent from the binary. Using `EXPO_PUBLIC_API_KEY` is the honest representation of the actual posture; pretending EAS secrets hide it would be false security theater. It stops casual/automated scraping (the threat A.1 closed: "deployed with no auth at all"), not a targeted attacker. Per-install token exchange is the real fix, and it is out of scope.
- **Money:** CLP formatting operates on the BigInt-serialized string via `BigInt(...)`/string digits — never `parseFloat`/`Number()` (ADR-015). `null` percentage and `sinIngreso` render distinctly from `0%`.
- **Testing (ADR-017):** jest-expo unit + RNTL screen states + Maestro E2E reusing `resumen-semaforo.yaml`. Note ADR-017's `@testing-library/jest-native` reference is deprecated (scaffold already uses `@testing-library/react-native/extend-expect`); flag the ADR doc fix for design/tasks.
- **Deploy:** follow `docs/mobile-launch-runbook.md` A.3/A.4 — Render Blueprint → load 3 secrets → deploy → curl matrix (200 public / 401 no-key / 200 with-key).

### Encryption debt (A.5) — accepted risk with trigger

Task 11.6 (`NoOpCryptoService`, identity) stays as-is this sprint. **Rationale:** `/api/resumen` — the only mobile-consumed endpoint — surfaces only bucket enum names, BigInt totals, basis-point percentages, and semáforo enum states. No transaction descriptions, no titular name/RUT, no PII. This release introduces **API** exposure (already addressed by A.1–A.4), not new DB exposure (Supabase has been used since Sprint 2).

**Accepted-risk record must state:** who signed off, when, and the **hard trigger** — *"11.6 MUST be resolved before any endpoint returning transaction descriptions / titular name / RUT is exposed beyond localhost."* This keeps the debt time-bound, not indefinite.

## First slice / delivery boundary

This change touches **deploy + auth surface** and will likely **exceed the 400-line budget** (a full Expo scaffold: pinned deps, `app/` tree, NativeWind config, HTTP client, screen, formatter, and their tests). Delivery strategy is **`ask-on-risk`** — recommend the orchestrator plan **chained PRs**:

1. **PR 1 — Track A:** deploy + curl verification + stale-docstring fix (small, low-risk, unblocks real-device testing).
2. **PR 2 — Track B scaffold:** workspace inclusion + pinned Expo scaffold + NativeWind + env plumbing (no feature logic).
3. **PR 3 — Track B feature:** HTTP client + CLP formatter + screen + states + tests + Maestro cleanup.

`tasks` phase should confirm the split and flag `size:exception` only if kept as a single PR.

## Risks

| Risk | Note |
|------|------|
| **Store-pipeline clocks are the real critical path** | Play closed-testing 14-day/12-tester window + Apple financial-app review (24h–7d) are external and don't start until Track C begins. **Start C.1/C.2 in parallel now**, not after B is "done." |
| **API key in the binary** | Structural, not a bug. Any client-embedded static key is recoverable. Must be documented as a casual-scraping deterrent, never oversold as access control in later phases. |
| **BigInt-string CLP formatting** | The seeded `formatearMontoCLP(pesos: number)` is incompatible with the DTO's string contract; must be reimplemented BigInt-safe, not patched via `parseFloat`. |
| **Encryption accepted-risk drift** | 11.6 must carry an explicit trigger + sign-off, or it ages silently. |
| **Unpinned mobile deps** (`"*"`, loose ranges) | Must be pinned to concrete stable Expo SDK/RN versions at scaffold time (verify current stable via Context7/official docs). |
| **Stale-doc drift** | Already found once (`resumen.controller.ts`). Double-check comments/ADRs against actual code in design/tasks before trusting them. |
| **ADR-017 deprecated matcher** | `@testing-library/jest-native` reference is outdated; low-risk doc fix for design/tasks. |

## Open questions

None blocking. The three exploration open items are resolved by PO decisions baked in above:
1. `EXPO_PUBLIC_API_KEY` "deterrent, not real auth" framing — **confirmed**.
2. A.5 documented-risk-with-trigger for 11.6 (do not advance now) — **confirmed**.
3. Single-screen scope; `login.yaml` is a dead flow to remove — **confirmed**.

## Next step

Run `sdd-spec` and `sdd-design` (parallel) against this proposal.
