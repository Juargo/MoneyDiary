# US-044 — Mobile Configuración with parity (perfil + categorías)

Bring the shipped web Configuración surface to `apps/mobile`: a single Configuración screen with segmented `Perfil | Categorías` tabs, plus a pushed "edit category" screen, all consuming the SAME backend endpoints and reproducing the SAME error and warning behaviour the web already ships. No new backend, no new business rule, no duplicated domain logic (ADR-024).

Issue: [#278](https://github.com/Juargo/MoneyDiary/issues/278). Wireframes: M1 (Perfil), M2 (Categorías), M3 (Editar categoría), board `LYiabT1DD6UvDMnFXnBkn9`.

---

## 1. Intent

### The problem

The mobile app is where the user actually lives day to day: it already reads the monthly/annual 50/30/20 dashboard (US-050) and can upload a cartola (US-033/ADR-026). But the two things that make that dashboard *mean* something — **who you are** (nombre/email/password) and **how your money gets classified** (categorías y patrones) — are only editable on the web. A user who classifies from the phone has to open a laptop to add the pattern that would have fixed the classification, or to change a bucket that is skewing the semáforo they are looking at right now.

That is the concrete pain: **the catalog is the lever that changes the numbers on the dashboard, and the lever is on another device.** Every "Sin categoría" row the user sees on the phone is a task deferred to a desktop session that frequently never happens.

### Why now

- **The backend is already there, fully shipped.** US-040 (`PATCH /api/perfil`, `PATCH /api/perfil/password`), US-038/039 (`GET/POST/PATCH/DELETE /api/categorias` and `/api/patrones`) are deployed and session-scoped. Mobile already holds a Bearer session and already sends `x-api-key`. **There is no missing API and no new credential** — only a missing client surface.
- **The web reference implementation is finished and hardened.** `apps/web/src/components/configuracion/**` went through US-042/US-043/US-063 plus several judgment-day rounds. Parity here means *copying a settled design*, not inventing one: the copy tables, the impact-warning phrasing, the demo read-only rules and the error taxonomy are already frozen and tested.
- **US-050 just landed the dashboard shell**, so there is a natural, uncontested home for the entry point (a gear in the header) without inventing navigation chrome.

### What success looks like

A user on the phone can, without ever opening the web app: fix their nombre/email, change their password, create a categoría, move it to another bucket (understanding the consequence *before* confirming), add/edit/remove the patterns that auto-classify their transactions, and delete a categoría knowing exactly what happens to its transactions. And the app tells them the same things, in the same words, as the web does.

### Acceptance criteria → this proposal

| CA | Requirement | Where it is addressed |
|----|-------------|-----------------------|
| CA-01 | Configuración shows segmented `Perfil \| Categorías` tabs with back navigation (Expo Router), per M1–M3 | §4.1 Navigation |
| CA-02 | Profile edit (nombre/email/password) consumes the SAME US-040 endpoints with the SAME error behaviour | §4.3 Perfil, §4.5 Error parity |
| CA-03 | Categories admin has the SAME CRUD and the SAME deletion-in-use warning as web (US-038/039) | §4.4 Catálogo, §3 Parity surface |
| CA-04 | Presentation logic in client `src/domain`/`src/components`, no backend business-rule duplication (ADR-024) | §4.2 Data layer, §4.6 Domain boundary |
| CA-05 | New screens have jest-expo + RNTL tests (ADR-017) | §4.7 Test strategy |

---

## 2. Scope

### In scope

- **A Configuración screen** in `apps/mobile` with in-screen segmented tabs `Perfil | Categorías`, reachable from a **gear control in the dashboard header** via `router.push`, with native Expo Router back (binding decision 2).
- **A pushed "Editar categoría" screen** (M3), with its own back to the Categorías tab.
- **Perfil tab (M1):** `Nombre`, `Email`, `Cambiar password` (`Password actual` + `Password nueva`), `Guardar cambios`, and a **read-only Google status block** (binding decision 1).
- **Categorías tab (M2):** list grouped by bucket, per-row pattern count, `Nueva categoría` (nombre + bucket), row tap → edit, delete with the impact warning.
- **Editar categoría (M3):** `Nombre`, `Bucket (obligatorio)` with bucket-change impact confirmation, patterns list (`matchType` + `patron`, add/edit/remove), `Eliminar categoría` with impact confirmation, Guardar/Cancelar.
- **Mobile HTTP client extensions**: `perfil` and `categorias`/`patrones` clients following the existing never-throw `ApiResult<T>` discipline, plus the widening of `GET /api/auth/me`'s runtime guard (see §5, real blocking gap).
- **Presentation-only domain helpers** in `apps/mobile/src/domain`: bucket grouping, plural labels, impact-phrase builder, profile-save orchestration, closed error-copy tables.
- **jest-expo + RNTL tests** for every new screen/component, plain unit tests for every pure helper.

### Out of scope (explicit)

- **Google link/unlink from mobile** — issue out-of-scope, and ADR-035's mobile auth surface is `POST /api/auth/google/token` only. Mobile shows **status only** (`Vinculada` / `No vinculada`, with the account email when present) and **no `Desvincular` button**, despite wireframe M1 drawing one. *Binding decision 1 — the issue's out-of-scope wins over the wireframe.* Link/unlink CRUD from mobile is a future US.
- **Native login flow changes** (ADR-035) — untouched.
- **A bottom tab bar.** The entry point is a gear in the dashboard header, not a nav bar. Bottom tabs are backlog #394, deliberately deferred in US-050. *Binding decision 2.*
- **Any pattern operation the web UI does not expose.** In particular `prioridad` is never sent by the web (backend default 100 applies); mobile does not send it either. *Binding decision 3 — verified against `apps/web/src/api/categorias.ts` and `PatronFila.tsx`.*
- **A custom confirmation modal.** Deletion (and bucket change) confirm through the native `Alert.alert`, carrying the same semantics/copy as web's `ConfirmarImpactoDialog` ("sus transacciones pasan a Sin categoría"). *Binding decision 4.*
- **Any backend change.** No new endpoint, no schema/migration, no `openapi.json` change. If this change needs a backend edit, that is a signal the scope drifted.
- **Reclassifying transactions from mobile**, ingesta management, or any other write surface not listed above.
- **Demo-session creation on mobile** (`POST /api/auth/demo` is not in the mobile client and stays out).
- **Offline/optimistic writes, caching layers, TanStack Query on mobile.** Mobile has deliberately stayed on plain `fetch` + local state (design precedent, `app/index.tsx`); this change does not introduce a query library.

---

## 3. Parity surface (verified in web's code, not assumed)

This is the answer to binding decision 3 — *exactly* what web's shipped UI exposes today:

**Perfil** (`PerfilPanel` / `PerfilForm` / `use-guardar-perfil.ts`)

| Operation | Endpoint | Notes verified in code |
|---|---|---|
| Read identity | `GET /api/auth/me` | `{ userId, nombre, email: string \| null, esDemo, googleVinculado }` |
| Rename / change email | `PATCH /api/perfil` `{ nombre?, email?, passwordActual? }` | `passwordActual` is sent **only when email changes**; a nombre-only change must not send it |
| Change password | `PATCH /api/perfil/password` `{ passwordActual, passwordNueva }` | `204`; backend revokes **other** sessions, keeps the calling one |
| One submit = one *or two* calls | — | Profile call first; **a profile failure aborts and the password call never happens**; a password failure after a successful profile save is a *partial success*, messaged as such |
| Google | read-only on mobile | web additionally offers link/unlink — **excluded here** |

**Catálogo** (`CategoriasPanel` / `EditarCategoria` / `PatronesSection` / `PatronFila` / `api/categorias.ts`)

| Operation | Endpoint | Notes verified in code |
|---|---|---|
| List | `GET /api/categorias` | `{ categorias: [{ id, nombre, bucket, transaccionesCount, patrones: [{ id, categoriaId, patron, matchType, prioridad }] }] }`; open to demo sessions |
| Create categoría | `POST /api/categorias` `{ nombre, bucket }` | bucket ∈ `Necesidades \| Deseos \| Ahorro` on the wire |
| Rename / change bucket | `PATCH /api/categorias/:id` `{ nombre?, bucket? }` | a **dirty bucket** requires an impact confirmation before the call |
| Delete categoría | `DELETE /api/categorias/:id` | **always `204`**, in use or not; the warning is client-side, sourced from the already-loaded `transaccionesCount` — never a fresh fetch |
| Create patrón | `POST /api/patrones` `{ categoriaId, patron, matchType }` | `prioridad` **never sent** |
| Edit patrón | `PATCH /api/patrones/:id` `{ patron?, matchType? }` | commits per row, independent of the categoría's Guardar |
| Delete patrón | `DELETE /api/patrones/:id` | **no confirmation dialog** — a pattern touches no persisted transaction |

**Copy that must match** (both directions of the deletion warning are already frozen in `mensajes-catalogo.ts`):
- delete with transactions → «Vas a eliminar «X».» / «N transacciones quedan en Sin categoría, en todos los períodos.» / «Esta acción no se puede deshacer.»
- delete with zero transactions → same shell, «No tiene transacciones asociadas.»
- bucket change → ««X» pasa de A a B.» / «Esto mueve N transacciones en TODOS los períodos, incluidos los meses ya cerrados.» / «Tu resumen 50/30/20 va a cambiar para esos meses.»
- **The zero case softens the sentence, it never skips the confirmation.**

**Label note (resolved, not an open question):** the wire value is `Deseos`; both web *and* the shipped mobile app already display it as **`Gustos`** (`apps/mobile/src/theme/colors.ts::ETIQUETA_BUCKET`). Wireframe M2 draws the group as "Deseos"; parity + the already-shipped mobile map win — the screen renders `Gustos`.

---

## 4. Approach

### 4.1 Navigation (CA-01)

- `apps/mobile/app/configuracion.tsx` — **one screen, two in-screen tabs**. The tabs are local state, not routes (binding decision 2: tabs live inside the config screen). Back is the native Expo Router stack back from the dashboard.
- `apps/mobile/app/categoria/[id].tsx` — the M3 edit screen, `router.push`ed from a Categorías row, back returns to Configuración.
- Both registered inside `_layout.tsx`'s existing `<Stack.Protected guard={estado === 'authenticated'}>` block, alongside `index` and `subir`. No change to the session gate.
- The **gear** lives in `src/components/Header.tsx`, replacing/joining the current inert `☰` stub, as an accessible `Pressable` (`accessibilityRole="button"`, Spanish label) doing `router.push('/configuracion')`.

Rationale (`kiss`): the stack + local tab state is the smallest structure that satisfies M1–M3. Nested Expo Router layouts for two tabs would add a routing concept the app does not otherwise use.

### 4.2 Data layer

Follow the app's existing, deliberate pattern — **not** the web's TanStack Query architecture:

- Two new never-throwing modules mirroring `src/api/client.ts`'s discipline: `src/api/perfil.ts` and `src/api/categorias.ts`. Same `ApiResult<T>` / `ApiError` shape, same `construirHeadersSesion()` (reused verbatim, `dry`), same runtime shape guards, never a thrown exception across the boundary.
- **Reads are per-screen `fetch` + `useState` phases** (`loading | error | data`), exactly like `app/index.tsx`. After a successful mutation the screen re-fetches the catalog — the mobile equivalent of web's `['categorias']` invalidation, with no query library (`yagni`).
- Read guards keep `bucket` and `matchType` as **plain `string`** (the server is the authority — ADR-024, ADR-036/037: a bucket the client does not recognise must still list, not fail parsing). **Writes** use the closed literal unions, so a mis-capitalised value fails at compile time instead of as a runtime 400. This mirrors `apps/web/src/api/categorias.ts` exactly.
- The catalog re-fetch also **invalidates the dashboard**, but only when money actually moves: a **bucket change** is the sole mutation that re-buckets transactions (delete leaves `bucketId` untouched — `eliminar-categoria.use-case.ts`; create attaches to zero transactions; rename never touches buckets), so the existing `solicitarRecargaResumen()` pub/sub (`src/api/resumen-refresh.ts`, already used by `subir.tsx`) fires only after a successful bucket change (spec MCTG-07, design D-11). Without this, the user returns to a stale 50/30/20 after re-bucketing.

### 4.3 Perfil tab (CA-02)

- The two-call orchestration is lifted as a **pure function** in `src/domain` (mirroring web's `guardar()` in `use-guardar-perfil.ts`): draft + current identity → a modelled result union (`sin-cambios | falta-password-actual | perfil-fallo | password-fallo(+perfilGuardado) | ok(+passwordCambiada)`). Pure ⇒ unit-testable with no RNTL.
- "What counts as a change" is computed against the freshly-read identity, so a retry after a partial failure is idempotent.
- **Anti-enumeration is preserved**: the message for a wrong password and for an email that belongs to someone else stays byte-identical (PERF040-04). No server `message` string is ever rendered — copy is chosen from a closed client table keyed by `status + code`.
- Google block: status pill only (`Vinculada: {email}` / `Vinculada` / `No vinculada`), no action control (binding decision 1).

### 4.4 Categorías + Editar categoría (CA-03)

- List grouped by bucket in the canonical order `Necesidades → Deseos(Gustos) → Ahorro`, pattern count per row (`3 patrones` / `1 patrón` / `sin patrones`), hint line «Toca una categoría para editarla o eliminarla.»
- `Nueva categoría` opens an inline form (nombre + bucket) at the top of the list — web's shape, not a new route.
- Edit screen: identity fields (`Nombre`, `Bucket (obligatorio)`), patterns section, footer with `Guardar` / `Cancelar` / `Eliminar categoría`, and the «Sin patrones: solo asignación manual.» helper note **always rendered** (it is helper text, not a zero-state).
- **Confirmations use `Alert.alert`** (binding decision 4) with title + the frozen multi-line body + a destructive confirm. The phrase builder is a **pure function** in `src/domain` taking `{tipo, nombre, transaccionesCount, bucketAnterior?, bucketNuevo?}` — the exact split web uses, so it is testable without touching `Alert`.
- Pattern rows commit **independently** of the categoría's `Guardar` (web's frozen behaviour); `Cancelar` discards only the identity draft.

### 4.5 Error parity (CA-02/CA-03)

Both web copy tables are total over a **closed code union** (`PERFIL_RECHAZADO`, `NOMBRE_INVALIDO`, `EMAIL_INVALIDO`, `PASSWORD_INVALIDA`, `DEMO_SOLO_LECTURA`, … / `NOMBRE_DUPLICADO`, `PATRON_DUPLICADO`, `REGEX_INVALIDA`, `CATEGORIA_NO_ENCONTRADA`, …), keyed on the backend's `body.code`.

**Mobile's current `ApiError` cannot express this**: its `http` variant carries only `status`, no `code`. Reproducing "the SAME error behaviour" (CA-02, literal wording) therefore requires extending the mobile error type with the response `code` (additive: `{ tag: 'http'; status: number; code?: string }`, or a dedicated `server` variant). This is a **scope-affecting** consequence of CA-02 and is called out as Open Question 3.

Screens keep mobile's existing convention of routing an `unauthorized` result through the session gate rather than rendering a message.

### 4.6 Domain boundary (CA-04)

Everything new in `src/domain` is presentation-only and provably so:
- bucket grouping + display labels (already-existing `ETIQUETA_BUCKET`),
- plural label helpers,
- the impact-phrase builder (pure copy assembly from a count the server supplied),
- the profile-save sequencing (which HTTP call, in which order — an orchestration rule, not a business rule),
- the error-code → copy tables.

**Nothing** re-implements a backend rule: classification/dispute-resolution (`(prioridad, patron, id)`, ADR-036 D-08), bucket validity (ADR-037: a categoría is valid because it has a `bucketId` row, not because a client enum says so), name uniqueness, and the "transactions move to Sin categoría" effect all stay server-side. `transaccionesCount` is **read from the DTO already loaded**, never computed and never re-fetched for the warning.

### 4.7 Test strategy (CA-05)

- **Pure helpers** → plain jest unit tests (no renderer): grouping, plurals, impact phrases, save orchestration (including the abort-order guarantee and the partial-success branch), error tables (totality enforced by `tsc`).
- **Screens/components** → jest-expo + RNTL: tab switching, the four fetch phases, form submit paths, demo/disabled states, and the confirmation flows with `Alert.alert` spied (assert the *arguments* — title + lines + destructive confirm — not a rendered modal).
- **HTTP clients** → `fetch`-mocked tests per branch (401 / non-2xx with code / malformed 2xx / network throw), mirroring `client.spec.ts`'s existing style.
- Maestro stays manual and out of CI (ADR-017); a device pass over the two new screens is a manual verification step, not a gate.

---

## 5. Affected areas

| Area | Files (all under `apps/mobile/`) |
|---|---|
| Routes (NEW) | `app/configuracion.tsx`, `app/categoria/[id].tsx` |
| Routing wiring | `app/_layout.tsx` (two `Stack.Screen` entries) |
| Entry point | `src/components/Header.tsx` (gear → `router.push('/configuracion')`) |
| HTTP (NEW) | `src/api/perfil.ts`, `src/api/categorias.ts` |
| HTTP (EDIT) | `src/api/client.ts` — widen `esMeDto` (see below) and, per OQ-3, carry `code` on non-2xx |
| Domain (NEW) | `src/domain/` — `catalogo-constantes.ts`, `agrupar-categorias-por-bucket.ts`, `plural.ts`, `impacto-catalogo.ts`, `guardar-perfil.ts`, `mensajes-perfil.ts`, `mensajes-catalogo.ts` |
| Components (NEW) | `src/components/configuracion/**` — perfil panel/form, categorías panel/row/new-form, editar-categoría, patrón row, shared text/select fields |
| Cross-screen | `src/api/resumen-refresh.ts` (consumer only — fire after catalog mutations) |
| Tests | co-located `*.spec.ts(x)` for every file above |
| NOT touched | `apps/api/**`, `openapi.json`, `packages/api-client` schema, `apps/web/**`, Prisma/migrations, login/session flow |

**Blocking pre-existing gap found during investigation:** `esMeDto` in `src/api/client.ts` only validates `{ userId: string, email: string }`. It (a) **rejects any identity with `email: null`** as a parse failure, and (b) does not validate `nombre`, `esDemo` or `googleVinculado` — the three fields the Perfil tab is built on. Widening this guard is a **prerequisite task**, not an optional cleanup, and it is already tracked debt in `src/domain/resumen.types.ts`'s docblock.

---

## 6. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **ADR-026 write-scope conflict.** ADR-026's decision text is explicit: *"La app mobile gana una única capacidad de escritura… Toda otra escritura (editar transacciones, **categorías**, gestión de ingestas) queda fuera."* This US adds profile **and** catalog writes — it contradicts a decided ADR head-on. | An accepted architectural boundary is crossed silently; future readers see code that violates a live ADR. | **Must be resolved before apply** via an explicit ADR act (amendment to ADR-026 or a new superseding ADR). See OQ-1. Not a blocker to writing the spec, but a blocker to merging. |
| R2 | **Error-behaviour parity requires a client type change** (§4.5). Without `code`, mobile can only show a generic message where web shows a precise one — silently failing CA-02's "SAME error behaviour". | CA-02 not actually met, discovered late. | Decide in OQ-3; if deferred, CA-02 must be re-worded, not quietly reinterpreted. |
| R3 | **PR budget.** Two screens + inline create form + patterns editor + two HTTP modules + seven domain helpers + full test parity. Realistically **well over 400 changed lines** (web's equivalent shipped as ~5 chained PRs). | A single unreviewable PR. | **Chained PRs strongly recommended** (forecast: 4–5 slices — ① client+guard widening, ② navigation shell + Perfil, ③ Categorías list + create + delete, ④ Editar categoría + bucket confirm, ⑤ patterns). Confirm split at the `tasks` phase per the Review Workload Guard. |
| R4 | **Copy drift web ↔ mobile.** The warning/error strings are duplicated by hand across two workspaces with no shared package (ADR-008: no `packages/shared`, deliberate). A later web copy fix will not propagate. | Two clients say different things about the same destructive action. | Accept the duplication (it is the standing architectural choice), but pin every string in a mobile unit test so a *silent* divergence at least shows up as an intentional edit. Note the twin-map hazard already documented in `bucket-colors.ts`. |
| R5 | **`Alert.alert` cannot render rich multi-line emphasis** the way web's dialog does (bold, inline error, pending state). A failed confirm has nowhere inline to report. | Degraded error visibility on the destructive path. | Confirm dismisses the alert; the failure is rendered by the screen underneath in its own alert region. Assert this in RNTL. |
| R6 | **Password change revokes other sessions.** `PATCH /api/perfil/password` keeps the calling session and revokes the rest — a mobile password change silently logs the user out of the web. | Surprise logout elsewhere. | Reuse web's exact copy: «Cambios guardados. Se cerraron tus otras sesiones.» — behaviour parity includes telling the user. |
| R7 | **Demo sessions are unreachable from mobile today** (no `POST /api/auth/demo` in the mobile client), yet the backend still answers `403 DEMO_SOLO_LECTURA`. Building the full proactive demo read-only UI would be building for a state the app cannot enter. | Either dead UI (`yagni`) or an unhandled 403. | See OQ-4. Default recommendation: keep the **defensive** 403 → copy mapping (cheap, one table row), skip the **proactive** disabling UI until mobile can actually hold a demo session. |
| R8 | **Pattern commit idiom does not transfer.** Web commits a pattern row on blur/Enter — a desktop keyboard idiom. On mobile there is no Tab, and blur fires on any tap elsewhere. | Accidental writes or lost edits. | See OQ-5; recommendation is an explicit per-row confirm. |

---

## 7. Rollback

Purely additive on the client. Rollback = revert the commit(s):

- No backend, contract, schema or migration change → **nothing to roll back server-side**, and no data written by this change is unreachable afterwards (categorías/patrones created from mobile remain fully manageable from web).
- The only edit to shipped mobile code is the header gear plus the `esMeDto` widening; removing the gear makes the new routes unreachable even if the files remain, so a **partial rollback (hide the entry point)** is available as a hotfix without reverting the whole feature.
- Widening `esMeDto` is a strict relaxation of a runtime guard and is safe to keep independently.

---

## 8. Dependencies

| Dependency | State |
|---|---|
| US-040 — `PATCH /api/perfil`, `PATCH /api/perfil/password` | ✅ shipped, deployed |
| US-038/039 — `/api/categorias`, `/api/patrones` CRUD | ✅ shipped, deployed |
| US-050 — mobile dashboard + `Header` (gear host) | ✅ shipped (this worktree) |
| ADR-024 — rich backend / thin clients | governs CA-04 |
| ADR-026 — mobile write scope | ⚠️ **in conflict, see R1/OQ-1** |
| ADR-036/037 — per-user catalog, bucket identity as a row | governs the "server is the authority on bucket validity" rule |
| ADR-017 — jest-expo + RNTL | governs CA-05 |
| ADR-027 — lucide icon set (gear) | see OQ-2 |
| `@moneydiary/api-client` | already consumed by mobile; supplies `MeDto`. Catalog DTOs must be checked for presence there before hand-writing types |

---

## 9. Success criteria

1. From the dashboard, a gear opens Configuración; native back returns to the dashboard; the segmented tabs switch between Perfil and Categorías without a route change.
2. A nombre-only save issues exactly **one** request and does **not** require `Password actual`; an email change requires it; a profile failure means the password call is **never** issued.
3. Every error the user can trigger renders a **client-owned** string chosen by `status + code` — no server `message` ever reaches the screen, and wrong-password vs. email-taken are indistinguishable.
4. Deleting a categoría with N>0 transactions shows a confirmation whose text is semantically identical to web's, including "quedan en Sin categoría, en todos los períodos", sourced from the already-loaded `transaccionesCount`; the zero case softens the wording but **still confirms**.
5. Changing a bucket cannot be saved without the all-periods impact confirmation.
6. Pattern add/edit/remove commits per row, independently of the categoría's `Guardar`; `Cancelar` discards only the identity draft.
7. After any mutation that can move money between buckets, returning to the dashboard shows refreshed figures (no stale 50/30/20).
8. `pnpm --filter @moneydiary/mobile test` passes with new tests covering every screen and every pure helper; `tsc --noEmit` is clean.
9. No file under `apps/api/`, `openapi.json` or `apps/web/` is modified by this change.

---

## 10. Closed questions (decided at the proposal gate, 2026-08-17 — binding)

The four product decisions handed down earlier (read-only Google block, gear entry point + in-screen tabs, web-exact pattern CRUD depth, native `Alert.alert` confirmations) remain closed. The six questions raised by this proposal were resolved as follows:

**CQ-1 — ADR-026 breach recording:** a NEW ADR superseding ADR-026's scope rule (option b). The project's habit is one ADR per boundary change (ADR-010 → ADR-026 → this one). Drafted during the design phase, reviewed in the PR that implements it, merged with the first slice.

**CQ-2 — Gear icon:** install `lucide-react-native` per ADR-027 (a decided standard whose dependency was simply never installed; `react-native-svg` is already present). No text-glyph fallback.

**CQ-3 — `ApiError` + `code`:** IN SCOPE, first slice. Additive optional field (`{ tag: 'http'; status: number; code?: string }`) — without it CA-02 is met only in name.

**CQ-4 — Demo read-only UI:** defensive `403 DEMO_SOLO_LECTURA` → copy mapping ONLY. The proactive disabled-controls layer is unreachable code today (mobile cannot create a demo session) — deferred with the explicit trigger "when mobile gains demo login" (YAGNI).

**CQ-5 — Pattern-row commit gesture:** explicit per-row confirm control for both new and existing rows — one rule instead of web's two. "SAME CRUD" (CA-03) constrains the operations, not the keyboard gesture.

**CQ-6 — Spec placement:** NEW capability `mobile-configuracion`, requirement prefixes `MCFG-*` (perfil) / `MCTG-*` (catálogo) mirroring web's `WCFG-*`/`WCTG-*` for requirement-to-requirement parity traceability.
