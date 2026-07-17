# Web App UI Specification (apps/web)

## Purpose

Browser-facing behavior of `apps/web`: server-side API-key injection (no secret in the bundle), the US-015 resumen screen, US-016 semáforo rendering, and US-017 bucket-detail flat list, all consuming existing `apps/api` endpoints same-origin.

## Requirements

### Requirement: W0-01 — No API key in the shipped bundle, enforced by CI

The built bundle MUST NOT contain any `x-api-key` value, `VITE_API_KEY`, or bare `API_KEY` literal, in dev or prod. CI MUST run `pnpm web test` and fail the build if a key pattern appears under `apps/web/src/**` or `dist/`.

#### Scenario: CI fails on a leaked key pattern

- GIVEN a PR introduces `VITE_API_KEY` in `apps/web/src/api/client.ts`
- WHEN CI runs the secret-scan step
- THEN the CI job fails before merge

#### Scenario: Production build is free of key material

- GIVEN `apps/web` is built for production
- WHEN `dist/` is scanned for `VITE_API_KEY` or an `x-api-key` value
- THEN no match is found

### Requirement: W0-02 — Same-origin proxy injects the key server-side (dev + prod)

The web app MUST call same-origin `/api/*` only. A server-side layer (Vite `proxyReq` in dev; a Vercel function in prod) MUST inject `x-api-key` from a Node-only `API_KEY` env var and forward to Render.

#### Scenario: Dev proxy forwards with the injected header

- GIVEN `apps/web/.env.local` sets bare `API_KEY`
- WHEN the browser requests `GET /api/resumen?periodo=2026-07`
- THEN Vite forwards to Render with `x-api-key: <API_KEY>`, never exposed to the browser

#### Scenario: Prod function forwards with the injected header

- GIVEN Vercel env sets `API_KEY` (no `VITE_` prefix)
- WHEN the deployed function receives `GET /api/resumen`
- THEN it proxies to Render injecting `x-api-key` and relays the response unchanged

### Requirement: W0-03 — `.env.example` documents the bare key

`apps/web/.env.example` MUST list `API_KEY` (no `VITE_` prefix) as server-only.

#### Scenario: Example file has no VITE_ prefix on the key

- GIVEN `apps/web/.env.example`
- WHEN read
- THEN `API_KEY` is present and no `VITE_API_KEY` entry exists

### Requirement: W1-01 — Money renders exactly from the BigInt string

The resumen screen MUST format amounts via `formatearMontoCLP` on the raw string and MUST NOT use `Number()`/`parseFloat()`.

#### Scenario: Amount beyond safe-integer precision renders exactly

- GIVEN `totalIngreso: "9007199254740993"`
- WHEN the screen renders
- THEN every digit is shown exactly as received

### Requirement: W1-02 — Income and distribution visible without scrolling; three explicit non-data states

On a standard viewport, `totalIngreso` and all 4 bucket slices MUST be visible without scrolling. The screen MUST render exactly one of loading, error, or empty when data is unavailable.

#### Scenario: Data state shows all slices above the fold

- GIVEN the API returns `sinIngreso: false` with 4 buckets
- WHEN the screen renders
- THEN income and all 4 slices are visible without scrolling

#### Scenario: Empty state prompts loading a cartola

- GIVEN the API responds `sinIngreso: true`
- WHEN the screen renders
- THEN a message inviting cartola upload is shown, not a bare "0%"

### Requirement: W2-01 — Semáforo renders only backend-computed state

The web MUST render `estadoGlobal` and per-bucket `estadoSemaforo` verbatim and MUST NOT recompute thresholds client-side.

#### Scenario: Rojo renders as received

- GIVEN a bucket DTO with `estadoSemaforo: "rojo"`
- WHEN rendered
- THEN "rojo" is shown with no client-side threshold logic

### Requirement: W2-02 — Semáforo state is readable without relying on color; null is distinct

Each indicator MUST expose a non-color signal (`aria-label`/`sr-only` or icon). `null` MUST render a distinct "Sin datos" affordance, never coerced into verde/amarillo/rojo.

#### Scenario: Null bucket shows "Sin datos" accessibly

- GIVEN a bucket with `estadoSemaforo: null`
- WHEN rendered
- THEN a "Sin datos" label/icon is shown
- AND a screen reader announces it via `aria-label` or `sr-only` text

### Requirement: W3-01 — Bucket detail endpoint returns a flat, BigInt-safe, isolated list

`GET /api/buckets/:bucket?periodo=YYYY-MM` MUST return a flat per-transaction list (money as strings) restricted to the authenticated `userId`'s accounts.

#### Scenario: Valid bucket returns the flat list

- GIVEN transactions exist for `bucket=necesidades`, `periodo=2026-07`
- WHEN called with a valid key
- THEN the response is 200 with each amount as a decimal string

#### Scenario: User A cannot read User B's bucket detail

- GIVEN transactions exist for user B in `necesidades`
- WHEN user A's session requests that bucket/period
- THEN no user-B transaction appears in the response

### Requirement: W3-02 — Invalid `:bucket` returns a scrubbed 400

A `:bucket` outside the `Bucket` enum MUST return HTTP 400 without reflecting raw input or leaking monetary values.

#### Scenario: Unknown bucket segment is rejected

- GIVEN `:bucket = "invalido"`
- WHEN requested with `periodo=2026-07`
- THEN the response is 400 and the body reflects no raw monetary value

### Requirement: W3-03 — Detail UI shows exact CLP, a classify CTA, and a disabled edit placeholder

The screen MUST show each row's exact CLP amount, prioritize a classify CTA for `SinCategoria` rows, and render inline-edit controls as visibly disabled.

#### Scenario: SinCategoria row shows a classify CTA and disabled edit

- GIVEN a row has no assigned bucket
- WHEN rendered
- THEN a "classify" CTA is shown and any edit control on the row is disabled
