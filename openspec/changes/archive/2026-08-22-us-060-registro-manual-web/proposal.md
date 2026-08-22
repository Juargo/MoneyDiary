# Proposal: US-060 — Web: formulario de ingreso manual

- **Change**: `us-060-registro-manual-web`
- **Issue**: [#294](https://github.com/Juargo/MoneyDiary/issues/294) · Milestone `Sprint-15` · `epic:gestion-datos`
- **Status**: Proposed (2026-08-22)
- **Requires new ADR**: No. This is a **frontend-only** change under ADR-003/008/011/024. It consumes the already-shipped US-058 backend contract (`openspec/specs/movimiento-manual/spec.md` — `POST /api/movimientos`) — no new endpoint, no schema, no backend code, no new dependency. ADR-024 governs: the client carries **zero** business logic. The Ingreso auto-classification, the Gasto cascade validation, the money math, and the persisted classification all live in the backend; the UI only collects the four fields (type-first) and renders confirmation.

## Intent

Let a user **record a single movement by hand in seconds** from the web — the cash purchase, the reimbursement, the movement a bank statement missed. The form is **type-first**, mirroring the backend product rule (MAN-02/MAN-03): the user picks **Ingreso** or **Gasto** first, and that choice drives what the form asks next. An **Ingreso** needs nothing more (the backend classifies it invisibly as `{bucket=Ingreso, categoriaId=null}`); a **Gasto** unfolds a bucket → categoría cascade drawn from the user's **own** catalog (ADR-036/037). On success the dashboard reflects the new movement immediately (query invalidation), and the form clears so the user can keep annotating.

## Why now

1. **The backend contract is already live and unused by web.** US-058 shipped `POST /api/movimientos` (discriminated union on `tipo`, strict Ingreso variant, Gasto cascade validated against the caller's catalog, 201 with 8 fields). The web has **no entry point** for it — no `postMovimientoManual`, no hook, no form. The reshape is purely additive on the client.
2. **"Import-only" is a real product gap.** Today the only way data enters the web is a bank-statement upload (`/subir`). Cash movements, reimbursements, and anything the statement missed cannot be recorded at all. Manual entry closes that gap and makes the 50/30/20 picture complete.
3. **The per-user catalog makes the Gasto cascade safe and cheap.** ADR-036/037 gave every user their own `Categoria` set with a fixed `(categoria, bucket)` binding; the web already fetches it via `useCategorias` and groups it with `agruparPorBucket`. The Gasto cascade reuses that machinery — no new client logic, no client-side classification.
4. **It completes the epic's client surface for manual entry.** US-058 (backend) is done; US-060 is the web client. Mobile manual entry is a separate later story.

## Scope

### In scope — acceptance criteria mapped to capabilities

| AC | Capability |
|----|------------|
| **CA-01** | **Registrar page with fecha / descripción / monto + a TYPE-FIRST selector.** A dedicated `/registrar` page renders the common fields plus a `tipo` selector (Ingreso / Gasto) that is the **first** decision and drives the rest of the form. `fecha` defaults to today (`<input type="date">`, `max=today`); `monto` is a positive-integer CLP input; `descripción` is a text field. |
| **CA-02** | **Ingreso ⇒ NO bucket/categoría selectors.** When `tipo=Ingreso`, the form shows only fecha / descripción / monto. No bucket, no categoría — the backend classifies it invisibly (MAN-02). The submitted body is the strict Ingreso variant `{ tipo, fecha, descripcion, monto }` with **no** stray `bucket`/`categoriaId`. |
| **CA-03** | **Gasto ⇒ bucket → categorías-of-that-bucket cascade over the user's own catalog.** When `tipo=Gasto`, a bucket select (`Necesidades` / `Deseos` / `Ahorro`) appears, then a categoría select filtered to that bucket's categories from the user's catalog (`useCategorias` + `agruparPorBucket`). Both `bucket` and `categoriaId` are required and go to the wire (MAN-03). |
| **CA-04** | **Success ⇒ UI confirms + dashboard reflects via query invalidation.** On 201, the form clears, shows an inline confirmation, and invalidates the dashboard queries so the resumen/percentages/semáforo update (MAN-05). A "Ir al dashboard" link is offered; navigation is **not** automatic. |
| **CA-05** | **API 400 ⇒ form shows an error WITHOUT losing input.** A rejected submit shows a fixed scrub-safe error message and **keeps every field's value** so the user can correct and retry. The form is never cleared on error. |
| **CA-06** | **a11y — associated labels + cascade focus management.** Every field has an associated `<label>` (`getByLabelText`-reachable); the tipo switch and the Gasto cascade manage focus and announce the newly-revealed selects; `eslint-plugin-jsx-a11y` is clean for the new files. |

### Binding product decisions (resolved 2026-08-22 — embedded, not open)

1. **Route** → a **NEW `/registrar` route** (thin-container pattern, deep-linkable, its own semantic home). **Not** a `/subir` tab, **not** a modal over the dashboard.
2. **Post-save UX** → on success the form **CLEARS**, shows an **inline confirmation**, and offers an **"Ir al dashboard"** link. **No auto-navigation** — the flow is optimized for fast multi-entry ("anotar en segundos"). Dashboard queries are invalidated regardless, so the dashboard is already correct when the user chooses to go there.
3. **Navigation** → a **new main-nav item "Registrar"** at the same level as "Subir cartola".
4. **Demo session** → the form is **proactively DISABLED** with the demo notice (the `NuevaCategoriaForm` precedent), so no futile write requests are sent for a demo (read-only) session.

### Non-goals (out of scope)

- **Any backend change.** US-060 consumes the shipped US-058 contract; zero server code, no schema, no `openapi.json` change (the operation is already published).
- **Mobile.** No mobile manual-entry UI. Mobile manual entry is a separate later story.
- **Edit / delete of movements.** This is single-movement **creation** only. Reclassifying, editing amounts/dates, or deleting existing movements are out of scope.
- **`/subir` restructuring.** The upload route is untouched except that the nav gains a sibling "Registrar" item; `/subir` keeps its name, its route tree, and its component. No tabs, no layout route, no split.
- **New dependencies.** The form is built from existing primitives (`CampoSelect`, `CampoTexto`, `useCategorias`, `agruparPorBucket`, TanStack Query/Router). No new npm package.
- **Client-side money math or client-side classification.** The client renders and collects; the backend classifies and computes (ADR-024).

## Approach (exploration Approach A — new `/registrar` route)

A new `/registrar` leaf route as a **thin container** (like `subir.tsx`, `index.tsx`, `buckets.$bucket.tsx`) renders a self-contained `RegistrarMovimientoForm`. The API layer adds one client fn + one guard + one hook, mirroring the `categorias.ts` pattern exactly. The nav gains one item.

### 1. Route + thin container (`apps/web/src/routes/_authenticated/registrar.tsx`)

- New leaf route under `_authenticated`. Reads `esDemo` from the authenticated route context (as `subir.tsx` does) and renders `<RegistrarMovimientoForm esDemo={esDemo} />`. No logic in the container.

### 2. Form component (`apps/web/src/components/RegistrarMovimientoForm.tsx` + test)

- **Type-first**: a `tipo` `CampoSelect` (Ingreso / Gasto) is the first control and drives conditional rendering. Common fields: `fecha` (`<input type="date">`, default today, `max=today`), `descripción` (`CampoTexto`), `monto` (positive-integer CLP input — decision pinned in design; exploration leans `type="text" inputMode="numeric"` for predictability, or `type="number" min="1" step="1"`; both send a raw integer string to the wire).
- **Ingreso branch**: nothing extra. Body = strict Ingreso variant.
- **Gasto branch**: a bucket `CampoSelect` then a categoría `CampoSelect` filtered to that bucket, sourced from `useCategorias` + `agruparPorBucket`, with a `CatalogoEstado`-style loading/error/listo handling (reused discriminated union). `srOnly` labels via `CampoSelect` where a compact layout needs them, but each control keeps an associated label (CA-06).
- **State per field** via `useState`, `FormEvent<HTMLFormElement>` submit handler, `mutation.mutate(...)` with `onSuccess`/`onError` at the call site (the `NuevaCategoriaForm` / `PerfilForm` pattern). Dual `aria-live`/`role="alert"` regions for confirmation and error; `role="note"` for the demo notice.
- **Demo-disabled**: when `esDemo`, the fields and submit are disabled and the demo notice is shown (the `NuevaCategoriaForm` precedent) — no request is attempted.

### 3. API layer (client fn + guard + hook + type, mirroring `categorias.ts`)

- **`postMovimientoManual(body)`** — new fn (new `apps/web/src/api/movimientos.ts`, mirroring `categorias.ts`): never-throw `ApiResult`, JSON body of the discriminated-union request, 400/401 handled per the fixed-message strategy below.
- **`esRegistrarMovimientoManualDto(body)`** — runtime guard for the **201 response** (`{ id, fecha, descripcion, cargo, abono, bucket, categoriaId, origen }`), so a malformed success response fails loudly at the boundary. (The `RegistrarMovimientoManualDto` response alias already exists in `@moneydiary/api-client`; a local request alias `RegistrarMovimientoManualInput` follows the `CategoriaInput`/`PatronInput` precedent.)
- **`useRegistrarMovimiento()`** — new `useMutation` hook (`apps/web/src/api/use-registrar-movimiento.ts`) that calls `postMovimientoManual` and, on `onSuccess`, invalidates **`['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingresos-mes']`** so the dashboard reflects the movement (CA-04, MAN-05). Following the `invalidarCatalogoYDashboard` precedent, all four keys are invalidated regardless of `tipo` (a Gasto over-invalidates `['ingresos-mes']` harmlessly — simpler than conditional invalidation; exploration R-08).

### 4. Navigation (one item)

- Add a **"Registrar"** main-nav item pointing to `/registrar`, at the same level as "Subir cartola" (decision 3). This is the only nav change.

### 5. ADR-024 boundary (non-negotiable)

The client contributes **no** business logic: the Ingreso auto-classification, the Gasto catalog/bucket validation, the money aggregation, and the origin marker all come from the backend. The UI only (a) collects the four type-first fields and (b) sends the correct discriminated-union variant.

## Binding technical constraints (from exploration risks — non-negotiable)

1. **tipo-switch MUST zero component state for `bucket` and `categoriaId`** (exploration R-02). The strict Ingreso variant returns **400 on any stray `bucket`/`categoriaId`**. Switching Gasto → Ingreso must **reset** the bucket/categoría state, not merely hide the selects, so the submitted Ingreso body never carries stray fields.
2. **`isSubmittingRef` double-submit guard is mandatory** (exploration R-03). This writes money; `mutation.isPending` alone has a stale-render gap between two synchronous clicks. Replicate the `useRef<boolean>` guard from `SubirCartola`.
3. **400 carries NO body** ⇒ **client-side pre-validation + one fixed fallback message** (exploration R-04). The backend sends no JSON on 400 and the client cannot distinguish `FECHA_FUTURA` / `MONTO_INVALIDO` / `CategoriaFueraDeCatalogoError` at the HTTP level. Therefore:
   - **Pre-validate client-side before the fetch**: `fecha ≤ today` (`esFechaValida` / `domain/fecha.ts`), `monto` is a positive integer string (`esMontoStringValido` / `domain/formatear-monto.ts`), `descripción` non-empty, and — for Gasto — both `bucket` and `categoriaId` present.
   - A 400 that still slips through shows **one fixed scrub-safe fallback** (e.g. "Datos inválidos. Revisá los campos y volvé a intentar.").
4. **Input is NEVER cleared on error** (CA-05). On any 400/pre-validation failure, every field keeps its value; only on 201 does the form clear (CA-04).
5. **Scoped a11y ESLint block for the new files** (exploration §6). Add a scoped ERROR block in `apps/web/eslint.config.js` covering the new route + component (`RegistrarMovimientoForm.tsx` and `registrar.tsx`, or a `src/components/registrar/` glob — design pins the exact scope) so `jsx-a11y` is enforced at error level for CA-06.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/routes/_authenticated/registrar.tsx` | **New** | Thin container; reads `esDemo`, renders `RegistrarMovimientoForm` |
| `apps/web/src/components/RegistrarMovimientoForm.tsx` | **New** | Type-first form: common fields + Ingreso/Gasto branch + demo-disabled + dual alert regions |
| `apps/web/src/components/RegistrarMovimientoForm.test.tsx` | **New** | Form tests (type switch zeroes cascade, 400 keeps input, success clears + invalidates, demo disabled) |
| `apps/web/src/api/movimientos.ts` | **New** | `postMovimientoManual` + `esRegistrarMovimientoManualDto` guard, mirroring `categorias.ts` |
| `apps/web/src/api/use-registrar-movimiento.ts` | **New** | `useRegistrarMovimiento` hook; invalidates the 4 dashboard query keys |
| `apps/web/src/api/types.ts` | **Modified** | Local request alias `RegistrarMovimientoManualInput`; re-export response type if missing |
| `apps/web/eslint.config.js` | **Modified** | New scoped a11y ERROR block for the new route/component |
| Nav component (main nav) | **Modified** | New "Registrar" item → `/registrar`, sibling of "Subir cartola" |
| `apps/web/src/test-utils/` | **New (optional)** | Possible `movimiento-fixtures.ts` factory for the hook/form tests |
| `apps/api/**`, `apps/mobile/**` | **Unchanged** | Backend contract already shipped (US-058); mobile out of scope |
| `apps/web/src/routes/_authenticated/subir.tsx`, `SubirCartola.tsx` | **Unchanged** | Upload flow untouched; only the nav gains a sibling item |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Stray `bucket`/`categoriaId` on an Ingreso** → strict variant 400 | Medium | High (blocks Ingreso) | tipo-switch **zeroes** bucket/categoría state (constraint 1), not just hides selects; the Ingreso body is the exact strict variant |
| **Double-submit duplicates money** | Medium | High (duplicate movement) | `isSubmittingRef` guard (constraint 2); disable submit while pending |
| **400 body-less** → cannot map the specific error | High | Medium | Client-side pre-validation catches the common cases (constraint 3); one fixed scrub-safe fallback for the rest |
| **Input lost on error** frustrates correction | Medium | Medium (CA-05) | Never clear on error; only clear on 201 (constraint 4) |
| **Gasto cascade needs the catalog before render** | Medium | Medium | Co-fetch `useCategorias`; the categoría select shows a loading state (`CatalogoEstado` `cargando`) until the catalog resolves |
| **Monto input is a new web pattern** (wheel/locale quirks) | Medium | Low | Design pins the input type; the value stays a raw integer string; `esMontoStringValido` validates before submit |
| **Over-invalidation of `['ingresos-mes']` on Gasto** | Low | Low | Accepted (invalidate all 4 keys regardless of tipo — simpler than conditional; exploration R-08) |
| **a11y for the type-driven conditional fields** | Medium | Medium (CA-06) | Associated labels on every control; focus/announce the revealed cascade; scoped `jsx-a11y` ERROR block (constraint 5) |

## Success criteria

| AC | Criterion |
|----|-----------|
| CA-01 | `/registrar` shows fecha (default today, max today) / descripción / monto plus a type-first Ingreso/Gasto selector that drives the rest of the form |
| CA-02 | With `tipo=Ingreso`, no bucket/categoría selectors appear and the submitted body is the strict variant `{ tipo, fecha, descripcion, monto }` (no stray fields) |
| CA-03 | With `tipo=Gasto`, a bucket select then a categoría select restricted to that bucket's categories from the user's own catalog; both go to the wire |
| CA-04 | On 201, the form clears, an inline confirmation shows, the 4 dashboard queries are invalidated, and an "Ir al dashboard" link is offered (no auto-navigation) |
| CA-05 | A 400 (or pre-validation failure) shows a fixed scrub-safe error and keeps every field's value |
| CA-06 | Every field has an associated label; the cascade manages focus/announcement; the new files pass `jsx-a11y` at error level |
| — | `pnpm web test` (vitest + Testing Library) green · `pnpm web typecheck` green · `jsx-a11y` clean; demo session shows the form disabled with the demo notice and sends no request |

## Open questions (non-blocking — resolve in design)

1. **Monto input type** — `type="number" min="1" step="1"` vs `type="text" inputMode="numeric"`. Both send a raw integer string; UX detail only.
2. **a11y scope shape** — file-list entries for `registrar.tsx` + `RegistrarMovimientoForm.tsx` vs a `src/components/registrar/` directory glob in `eslint.config.js`. Structure detail.
3. **Inline confirmation wording + placement** relative to the "Ir al dashboard" link. Copy detail; behavior (clear + confirm + no auto-nav) is fixed by decision 2.
4. **Which nav component** hosts the "Registrar" item and its icon (lucide, ADR-027). Structure detail; the item's existence and level are fixed by decision 3.

None blocks the spec or design phase.
