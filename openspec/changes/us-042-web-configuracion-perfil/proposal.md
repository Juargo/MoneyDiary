# Proposal: US-042 — Web Configuración page, Perfil section

- **Change**: `us-042-web-configuracion-perfil`
- **Issue**: [#276](https://github.com/Juargo/MoneyDiary/issues/276) · Milestone `Sprint-12`
- **Status**: Proposed (2026-08-13)
- **Consumes** (deployed, canonical, no API work here): `openspec/specs/perfil-usuario/spec.md`
  (`PERF040-01..09`) and `openspec/specs/vinculacion-google/spec.md` (`VINC041-01..11`)
- **Requires new ADR**: **No.** Every decision below is an application of ADR-018 (a11y by layers),
  ADR-024 (thin clients), ADR-008/016 (stack) and the shipped `web-app` conventions. Nothing deviates.
- **⚠️ Action items on issue #276** — see [§0](#0-what-the-wireframe-does-not-match):
  1. The wireframe's header (`Dashboard` · `Registrar` · `Historial`) **is not this app's nav**. It is
     read as illustrative chrome, not a rename order.
  2. The wireframe writes `Configuracion` / `Categorias` **unaccented**. Taken verbatim as instructed,
     but it will sit next to a nav item that reads `Configuración`. Confirm before `sdd-spec` freezes it.
  3. CA-01 says "avatar". No avatar or header exists in `apps/web` today. Resolved in
     [§1](#1-route-entry-point-and-session-protection) — confirm the choice.

## Intent

A MoneyDiary user can change nothing about their own account from the web app. `nombre`, `email`,
password and the Google link all exist in the API (US-040, US-041, deployed) and are reachable by
nobody: `/api/auth/me` is fetched once, in a route guard, and only `esDemo` survives it. The
"Configuración" nav item has been a dead placeholder since the shell shipped.

After this change a logged-in user can open `/configuracion`, see who they are, rename themselves,
change their email, rotate their password, and link or unlink Google — with one button, one honest
message per outcome, and no invented specificity the API does not authorise.

## Why now

1. **The API half is deployed and unused.** Two full requirement families (`PERF040-*`, `VINC041-*`)
   ship value only through this page. Every day it is not here is dead inventory.
2. **US-041 redirects here.** The Google callback already sends the browser to
   `/configuracion?google=vinculado|error`. That URL 404s today.
3. **There is a live type-safety hole.** `esMeDto` validates three fields and silently admits
   payloads missing `nombre` and `googleVinculado` — both **required** in the generated contract type.
   `vinculacion-google`'s Non-Goals assign the fix here by name ([§2](#2-identity-one-query-one-guard)).

## 0. What the wireframe does not match

The wireframe shows a full-width header with a logo, tabs `Dashboard` · `Registrar` · `Historial`, and
a user icon at the far right. **`apps/web` has no header.** `AppShell` is a binary responsive switch: a
fixed `w-64` `Sidebar` at `lg`+ and `BottomTabs` below it, both rendering the same `NAV_ITEMS`
(`Resumen` · `Subir nuevo archivo` · `Gestionar cartolas` · `Configuración` · `Ayuda`).

**Decision: the wireframe's header row is read as "the app's existing chrome", not as a spec.** Only
one binding requirement is taken from it — *there is an entry point to `/configuracion` that is not a
top-level tab*. Rebuilding the shell as a header-with-tabs is an app-wide redesign with a regression
surface across every route, for a change that owns one page. It is the same reasoning as binding
decision 6 (no new breakpoint tier), applied to the horizontal axis.

Everything **inside** the content area — the two-column split, the three blocks, the dividers, the
copy — is the visual contract and is implemented as drawn.

## Binding decisions

Settled with the user before this proposal. Recorded as decisions, not options.

| # | Decision | Rationale |
|---|----------|-----------|
| **1** | **One `Guardar cambios` button; it diffs the form and calls only what changed.** `PATCH /api/perfil` if `nombre`/`email` changed, `PATCH /api/perfil/password` if a new password was typed. No cross-endpoint transaction | Two buttons for one visual form is a lie about atomicity the user did not ask for. The diff also makes retry-after-partial-failure correct for free ([§3](#3-one-button-two-calls-one-honest-order)) |
| **2** | **The existing `Password actual` field is the authorisation input.** It becomes required when `email` is edited (PERF040-03). `Vincular`/`Desvincular` ask for it inside their confirmation dialog | One mental model for the whole page: *anything that changes how you get in costs your password* — US-041's decision 4, made visible. No second always-on password field |
| **3** | **Not-linked Google state is structurally symmetric**: a neutral `No vinculada` pill where the green one goes, a `Vincular con Google` button where `Desvincular` goes | The wireframe declared this gap. Symmetry means one layout, one set of tests, no second branch of markup |
| **4** | **Install `eslint-plugin-jsx-a11y`; rules at `error` scoped by path override to the new Configuración files only.** The rest of `apps/web` gets the plugin at `warn` | CA-05 currently has **no rule to satisfy** — the plugin is not installed (ADR-018 planned it, nothing wired it). Enabling it app-wide at `error` would make this change absorb the app's entire pre-existing a11y debt. Scoped `error` gates the new code; `warn` starts the burn-down without blocking. `pnpm web lint` is `eslint .` with no `--max-warnings`, so `warn` cannot break CI |
| **5** | **No new UI dependencies.** The form follows `LoginForm.tsx`; the confirmation dialog follows `EliminarIngestaControl.tsx`'s hand-rolled `role="alertdialog"`. CA-03's confirmation is local page state, not a toast library | Both patterns are shipped, tested and a11y-reviewed in this repo. A modal/toast library is a new dependency, a new bundle cost and a new review surface to render one dialog and one sentence (`yagni`, `kiss`) |
| **6** | **No new breakpoint tier.** The page's own grid is fluid (`max-width` + a fixed left column + a flexible panel), so it reproduces T1 at T1's width without touching `layout.ts` | `layout.ts`'s constants are coupled across `Sidebar`, `AppShell` and `BottomTabs`; a third tier is shell surgery. See [§7](#7-ca-04-without-a-new-tier) for why this satisfies CA-04's literal wording |

## Scope

### In scope

**A. Route** — `apps/web/src/routes/_authenticated/configuracion.tsx`, session-protected for free by
the `_authenticated` pathless layout, with `validateSearch` for `?google=` ([§5](#5-the-google-section)).

**B. Entry point** — `NAV_ITEMS`' `Configuración` placeholder becomes a real link, plus a user icon in
the sidebar footer ([§1](#1-route-entry-point-and-session-protection)).

**C. Identity** — new `useMe()` query on `['auth-me']`, primed by the route guard; `esMeDto` hardened
to validate `nombre` and `googleVinculado` ([§2](#2-identity-one-query-one-guard)).

**D. Perfil form** — `Nombre`, `Email`, `Password actual`, `Password nueva`, one `Guardar cambios`
button, sequential calls with an abort rule and a specified partial-failure state
([§3](#3-one-button-two-calls-one-honest-order)).

**E. Error and success copy** — one message per outcome, never more specific than the API allows
([§4](#4-error-mapping-verbatim-copy)).

**F. Google section** — linked/not-linked states, password-gated link and unlink dialogs, and the
`?google=vinculado|error` return contract ([§5](#5-the-google-section)).

**G. Demo sessions** — proactively disabled controls plus defensive `403 DEMO_SOLO_LECTURA` mapping
([§6](#6-demo-sessions)).

**H. a11y wiring** — `eslint-plugin-jsx-a11y` per decision 4.

**I. Tests + the two mandatory gates** ([§9](#9-tests-and-gates)).

### Non-goals (out of scope)

| Not doing | Why / owner |
|-----------|-------------|
| The **Categorías** section | **US-043**. The `Categorias` tab renders as an inert placeholder — same WDS-03 treatment `NAV_ITEMS` already uses for unfinished destinations |
| **Mobile** Configuración | **US-044**. Note that `apps/mobile`'s `MeDto` consumers have the **same** unvalidated-field gap; fixing it there is US-044's, not this change's |
| Any `apps/api` change | Both contracts are deployed and canonical. If this change wants an API change, that is a signal the proposal misread the spec |
| A header/top-bar redesign of `AppShell` | [§0](#0-what-the-wireframe-does-not-match) |
| A tablet tier in `layout.ts` | Binding decision 6 |
| Promoting `jsx-a11y` to `error` app-wide, and `vitest-axe`/`@axe-core` | Recorded follow-up (ADR-018 a11y-infra change). Naming it here is the trigger |
| Password **recovery/reset** and new-email verification | `perfil-usuario` Non-Goals — deferred at the API level, so there is nothing to render |
| A "confirm new password" field | The wireframe deliberately has two password inputs, not three. The API's domain validation plus the visible-value input is the shipped safeguard |

## Approach

### 1. Route, entry point and session protection

`routes/_authenticated/configuracion.tsx` — nesting under the pathless `_authenticated` layout **is**
the session protection (CA-01): `beforeLoad` already runs `requireSession(fetchMe, location.href)` and
throws a redirect to `/login` for anyone without a session. Zero new guard code.

**Entry point — both, and they are cheap.**

- `NAV_ITEMS`' `{ kind: 'placeholder', label: 'Configuración' }` becomes
  `{ kind: 'link', label: 'Configuración', to: '/configuracion', icon: Settings }`. One line, works in
  **both** `Sidebar` and `BottomTabs`, and deletes a dead control. `NavRoute` is
  `FileRouteTypes['to']`, so this only compiles once the route file exists — a typo is a `tsc` error,
  not a runtime dead link.
- The literal "avatar" of CA-01: a compact icon link in the **sidebar footer**, beside
  `ApiVersionBadge`. `AppShell` already accepts a `sidebarFooter` node supplied by
  `_authenticated.tsx`, so this is a prop change at one call site — **`Sidebar.tsx` and `AppShell.tsx`
  are not touched.** Icon + `aria-label="Configuración de la cuenta"`, **no user name**: a name
  rendered from route context would go stale the moment the user renames themselves on this very page.

### 2. Identity: one query, one guard

**The `esMeDto` gap.** `apps/web/src/api/auth.ts:77-90` validates `userId`, `esDemo` and the
`esDemo ⇔ email` cross-field invariant — and nothing else. `MeDto` resolves to the generated
`AuthMeResponse`, where `nombre: string` and `googleVinculado: boolean` are **required**. So today a
payload missing both passes the guard and downstream code reads `undefined` through a `string`/`boolean`
type. This page is the first consumer of both fields.

**Decision: harden the guard; a payload missing or mistyping either field is REJECTED** —
`{ tag: 'parse' }`, exactly like every other guard in `client.ts`. Not defaulted:

- `googleVinculado ?? false` would render `No vinculada` + `Vincular con Google` to a user who **is**
  linked — a false statement about their account's security posture, and a button that leads to a
  guaranteed `409`.
- `nombre ?? ''` would put an empty required input on screen and let `Guardar cambios` write a blank
  name over a good one.

**Known blast radius — verified, and `pnpm web test` alone will catch it here** (unlike the typecheck
class of breakage US-041 warned about, these are runtime stubs):

| File | Why it breaks | Fix |
|---|---|---|
| `src/test/redirect-after-login.test.tsx:38-42` | `/api/auth/me` stub returns `{userId, email, esDemo}` | add both fields |
| `src/test/demo-banner-layout.test.tsx:19-23` | `buildFetchStub`'s param type + payload | add both fields |
| `src/test/app-shell-layout.test.tsx:20` | same shape | add both fields |

`src/api/auth.test.ts` and `src/lib/require-session.test.ts` fixtures **already carry** both fields
(US-041 repaired them) — they are the proof the hardened guard is satisfiable.

**`useMe()` and the guard must not double-fetch.** Today `fetchMe()` runs once in `beforeLoad` and the
result is thrown away except for `esDemo`. Adding a `useQuery` naively means two `GET /api/auth/me` per
visit.

Decision:

- `apps/web/src/api/use-me.ts` exports `ME_QUERY_KEY = ['auth-me'] as const`, `meQueryOptions()` and
  `useMe()`. `queryFn` wraps `fetchMe` and throws `result.error`, so `mutation.error`/`query.error` is
  a typed `ApiError` — the `useEliminarIngesta` idiom.
- `_authenticated.tsx`'s `beforeLoad` **primes the cache** after `requireSession` resolves:
  `context.queryClient.setQueryData(ME_QUERY_KEY, me)`. The global `staleTime` is 30 s, so `useMe()`
  mounts against a fresh entry and issues **no** request. The guard keeps its single round trip.
- This requires `__root.tsx` to become
  `createRootRouteWithContext<{ queryClient: QueryClient }>()({ ... })` — `main.tsx:71` already passes
  `context: { queryClient }`, it is just untyped today. Three lines.
- `beforeLoad`'s return stays `{ esDemo: me.esDemo }`. **Unchanged on purpose**:
  `_authenticated/subir.tsx` reads it, and widening the context to carry the whole `me` would create
  two sources of truth for identity (route context and query cache) that drift the instant a mutation
  invalidates one of them.

*Rejected:* passing `me` from route context as `initialData` to `useMe()`. Avoids the `__root.tsx`
change, but reintroduces exactly that dual truth.

After any successful mutation: `queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })`. That is
CA-03's "invalidation", and it is the whole of it — no other cache holds identity.

### 3. One button, two calls, one honest order

**Order is forced, not chosen: `PATCH /api/perfil` first, `PATCH /api/perfil/password` second.**
A successful password change rotates the very credential the profile call needs — PERF040-03 requires
`passwordActual` whenever `email` is present. Password-first would make a correctly-filled form fail
its second call with `403 PERFIL_RECHAZADO`, indistinguishable from "you typed your password wrong".

**Abort on the first failure. A later call never runs after an earlier one failed.** If the profile
call fails, the cause is either a wrong `passwordActual` (the password call would fail identically —
one error is enough) or a taken email with a *correct* password, in which case firing the password call
would **succeed**: silently rotating the user's password and revoking their other sessions while the
page reports a failure. Unacceptable. One rule removes both cases.

**The partial-failure state, specified.** Profile succeeded, password failed:

| Aspect | Behaviour |
|---|---|
| Server state | `nombre`/`email` saved. Password unchanged. Other sessions **not** revoked |
| Cache | `['auth-me']` invalidated — the profile call succeeded, the identity really did change |
| `Nombre` / `Email` inputs | Re-derive from the refreshed `useMe()` — they are no longer dirty, because the server now agrees with them |
| `Password actual` / `Password nueva` | **Kept, not cleared.** The user corrects and resubmits. `passwordActual` is still valid — the password was not changed |
| Next submit | The diff sees `nombre`/`email` clean, so it sends **only** `PATCH /api/perfil/password`. Retry is idempotent by construction, with no retry state machine |
| Message | Two lines: the partial-success line, then the specific password error ([§4](#4-error-mapping-verbatim-copy)) |

The other partial ordering — password saved, profile not — **cannot occur**, because the profile call
runs first and a failure aborts the sequence. That is the second reason for the order.

**Submitting nothing** (no dirty field, no new password) makes no request and shows
`"No hay cambios para guardar."`

The button is `disabled` while any call is in flight (`LoginForm`'s `estado === 'submitting'` idiom),
which also prevents a double-submit from racing the password rotation against itself.

### 4. Error mapping (verbatim copy)

**Register:** neutral es-CL, matching the strings already shipped (`"Ocurrió un error inesperado.
Intenta nuevamente."`, `"Credenciales inválidas."`). No voseo — this page must not sound like a
different product from the rest of the app.

**The anti-enumeration constraint is a UI constraint.** PERF040-04 makes "wrong current password" and
"that email belongs to someone else" **byte-identical** responses. The UI therefore may not name a
cause. It names the two *inputs involved*, which is true in both cases and actionable in both:

| Outcome | Verbatim copy | Region |
|---|---|---|
| Everything saved, no password change | `Cambios guardados.` | `aria-live="polite"` |
| Everything saved, password changed | `Cambios guardados. Se cerraron tus otras sesiones.` | `aria-live="polite"` |
| Profile saved, password failed | `Se guardaron tus datos, pero no se pudo cambiar la password.` + the password error below | `role="alert"` |
| `403 PERFIL_RECHAZADO` on the profile call | `No se pudieron guardar los cambios. Revisa tu password actual y el email.` | `role="alert"` |
| `403 PERFIL_RECHAZADO` on the password call | `No se pudo cambiar la password. Revisa tu password actual.` | `role="alert"` |
| `400` on `nombre` | `El nombre debe tener entre 1 y 80 caracteres.` | `role="alert"` |
| `400` on `passwordNueva` | `La password nueva no cumple los requisitos mínimos.` | `role="alert"` |
| `403 DEMO_SOLO_LECTURA` | `Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.` | `role="alert"` |
| `403` on unlink, account has no password | `No puedes desvincular Google sin una password en tu cuenta.` | `role="alert"` |
| `tag: 'network'` | `No se pudo conectar con el servidor.` | `role="alert"` |
| Any other non-2xx | `Ocurrió un error inesperado. Intenta nuevamente.` | `role="alert"` |
| `tag: 'unauthorized'` (401) | no message — `navigate({ to: '/login' })` | — |

`400` is safely distinguishable from `403`: only the *cause within* a `403` is deliberately
indistinguishable. The `400` bodies carry a code, so the two validation messages above are earned, not
guessed. Nothing renders a server-supplied string; every message is a client constant selected by
status + code.

### 5. The Google section

**States.** Read from `me.googleVinculado`:

| Linked | Not linked |
|---|---|
| Green pill, check icon, `Vinculada: {me.email}` | Neutral pill, `No vinculada` |
| Button `Desvincular` | Button `Vincular con Google` |

The pill shows `me.email`, not a Google address — the API never exposes the Google identity
(VINC041-08), and the wireframe's sample happens to be an email. Design phase owns whether that label
should read the account email or drop the address entirely.

**Both buttons open the same dialog**, the `EliminarIngestaControl` pattern: `role="alertdialog"`,
focus moved to the confirm button, Escape cancels and restores focus, error inline via `role="alert"`,
confirm disabled while pending. It asks for `Password actual` (VINC041-01 / VINC041-07).

- **Link** — `POST /api/perfil/google/vincular { passwordActual }` → `200 { urlAutorizacion }` →
  `window.location.assign(urlAutorizacion)`. A script-driven top-level navigation, **not** the
  `<a href>` of `GoogleLoginButton.tsx`: the password gate forces a JSON POST first, and the
  destination is Google's own origin, where no Sec-Fetch guard of ours applies.
  **Edge case the wireframe does not show:** that navigation leaves the app and **discards unsaved form
  edits**. The dialog says so verbatim: `Vas a salir de MoneyDiary para autorizar en Google. Los cambios
  sin guardar se perderán.`
- **Unlink** — `POST /api/perfil/google/desvincular { passwordActual }` → `204` → close, invalidate
  `['auth-me']`, announce `Desvinculaste tu cuenta de Google.`

**The `?google=vinculado|error` return contract** (US-041 redirects here):

1. `validateSearch` narrows `google` to the literal union `'vinculado' | 'error'`; anything else is
   dropped to `undefined` — the `/login` `sanitizeRedirect` discipline. No parameter value is ever
   rendered; the value only *selects* a client constant.
2. The route component reads it **once into local state on mount**, then
   `navigate({ to: '/configuracion', search: {}, replace: true })` cleans the URL. Because the message
   lives in state, it survives the URL rewrite and does **not** reappear on refresh or back-button.
3. Copy: `vinculado` → `Vinculaste tu cuenta de Google.` · `error` →
   `No se pudo vincular tu cuenta de Google. Intenta nuevamente.`
4. **No manual refetch is needed.** The callback is a full-page load, so `beforeLoad` runs fresh and
   primes `['auth-me']` with the post-link identity ([§2](#2-identity-one-query-one-guard)). The
   priming decision pays for itself here.

### 6. Demo sessions

Every mutation on this page returns `403 DEMO_SOLO_LECTURA` for a demo session (PERF040-08,
VINC041-09). `esDemo` is already in route context — no extra call.

**Both layers ship.** Proactive: `Guardar cambios`, `Vincular con Google` and `Desvincular` are
rendered `disabled` with a `role="note"` explanation above them, so a demo user is never invited into
a guaranteed failure. Defensive: the `403 DEMO_SOLO_LECTURA` mapping in
[§4](#4-error-mapping-verbatim-copy) still exists — a disabled attribute is a UX affordance, not a
security control, and the message is the API's register-an-account guidance.

A demo account also has `email: null` (the invariant `esMeDto` already enforces): the `Email` input
renders `''`, and `nombre` is the generated `Demo-abc123`.

### 7. CA-04 without a new tier

CA-04 asks for "the tablet T1 variant". The measured delta between the two artboards is: **sidebar
width unchanged, sidebar font size unchanged, gutter 119px → 81px, panel 740px → 534px.** Nothing
appears, disappears, reflows or restructures.

That is not two designed states — it is **two samples of one continuum**: a fixed-width left column
plus a flexible content panel, measured at two viewport widths. So a fluid implementation
(`max-w-*` container + `grid` with a fixed first track and a flexible second) *reproduces* T1 at T1's
width, and every width between. Adding a `md:` tier to `layout.ts` would hard-code two points on a line
the browser already draws, at the cost of a third coupled constant across `Sidebar`, `AppShell` and
`BottomTabs` — the regression surface binding decision 6 refuses.

Two gaps the wireframe leaves, decided here:

- **Below the shell's `lg` breakpoint** the `Sidebar` is replaced by `BottomTabs`, so the page owns the
  full width. The page's own two columns **stack**: heading + tab list above the panel. The wireframe
  declares no mobile state; this is the minimum coherent one.
- **The active-tab indicator** the wireframe explicitly omits **ships anyway**: `Perfil` carries
  `aria-current="page"` plus a visual treatment. A tab list that does not say which panel is showing is
  an a11y defect, not a style choice — and it is the same information `NavItem` already conveys in the
  shell.

**Tokens, not palette.** `DCR-03`/`WPER-07`/`WMYP-08` bind the authenticated app to design tokens.
`Guardar cambios` → `primary`/`primary-foreground`. `Desvincular` → a neutral dark fill, explicitly
**not** `destructive` (it is reversible and the wireframe draws it neutral). The green pill has **no
semantic token today**; the closest verified AA pairing is `--color-ingreso` / `--color-ingreso-foreground`,
whose name means *income*. Design phase picks: alias that pair under a link-state name, or choose
another pairing — either way `DCR-06` (WCAG 2.2 AA) is the acceptance bar.

### 8. HTTP client surface

New `apps/web/src/api/perfil.ts`, same never-throw `ApiResult<T>` discipline as `client.ts`/`auth.ts`,
same `credentials: 'same-origin'`, all through the same-origin proxy (no base URL, no `x-api-key` in
the browser): `patchPerfil`, `patchPassword`, `postVincularGoogle`, `postDesvincularGoogle`. Each maps
`403` by its body `code` (`PERFIL_RECHAZADO` · `DEMO_SOLO_LECTURA` · `VINCULO_REQUIERE_PASSWORD`) into
a discriminated `ApiError` so [§4](#4-error-mapping-verbatim-copy)'s table is a total function, and
each guards its response body before returning it.

Mutations live in `use-guardar-perfil.ts` (the sequential orchestration of
[§3](#3-one-button-two-calls-one-honest-order)) and `use-google-vinculo.ts`.

### 9. Tests and gates

| Target | Coverage |
|---|---|
| `esMeDto` | Rejects a payload missing `nombre`; missing `googleVinculado`; each mistyped. Accepts the two valid fixtures. Existing cross-field cases keep passing |
| The three shell/integration stubs | Repaired and green — proof the hardened guard does not break the app |
| `useMe` + priming | Route-tree test asserting `/api/auth/me` is fetched **exactly once** when landing on `/configuracion` (the `demo-banner-layout.test.tsx` pattern, which already counts calls) |
| Sequential save | Profile-then-password order; abort-on-first-failure (password endpoint **never called** after a profile failure); partial-success message + preserved password fields; second submit sends only the password call; no-op submit makes no request |
| Error mapping | Each row of [§4](#4-error-mapping-verbatim-copy) — one test per outcome, asserting the **verbatim** string |
| `?google=` | Both values render their message; an unknown value renders none; the URL is cleaned; the message survives the cleaning |
| Google dialogs | Focus moves to confirm, Escape restores focus to the trigger, the leaving-the-app warning is present, `window.location.assign` called with the returned URL |
| Demo | Controls disabled, explanation present, and the `403` mapping still produces the right copy |
| a11y (CA-05) | Every input reachable by `getByLabelText` — RTL's label query **is** the label-association assertion. Plus `pnpm web lint` clean under the scoped `error` rules |

Mocking follows the repo: `vi.stubGlobal('fetch', …)`, a fresh `QueryClientProvider` per test via the
`crearWrapper` helper. No MSW.

**Mandatory gates — both, not one:**

```
pnpm web typecheck      # tsr generate && tsc -b — the ONLY typecheck
pnpm web test           # vitest run — does NOT typecheck
pnpm web lint           # eslint . — the new jsx-a11y scope
```

`pnpm web test` passing means nothing about types. US-040 shipped a CI break exactly this way, and
`VINC041-11` wrote the rule down. This change adds a **new route file**, so `tsr generate` must run
before `tsc` — which is precisely what `pnpm web typecheck` does and `pnpm web test` does not.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/**` | **Unchanged** | Both contracts deployed. Zero API files |
| `apps/mobile/**` | **Unchanged** | US-044 |
| `src/routes/_authenticated/configuracion.tsx` | **New** | Route + `validateSearch` |
| `src/components/configuracion/**` (+ tests) | **New** | Page, `PerfilForm`, `GoogleVinculoSection`, `ConfirmarPasswordDialog` |
| `src/api/perfil.ts` (+ test) | **New** | Four calls + guards + `403`-code mapping |
| `src/api/use-me.ts` (+ test) | **New** | `ME_QUERY_KEY`, `meQueryOptions`, `useMe` |
| `src/api/use-guardar-perfil.ts`, `use-google-vinculo.ts` (+ tests) | **New** | Sequential orchestration; link/unlink |
| `src/api/auth.ts` (+ test) | Modified | `esMeDto` hardening ([§2](#2-identity-one-query-one-guard)) |
| `src/routes/__root.tsx` | Modified | `createRootRouteWithContext<{ queryClient }>` |
| `src/routes/_authenticated.tsx` | Modified | Prime `['auth-me']`; sidebar footer gains the account link |
| `src/components/app-shell/nav-items.ts` (+ test) | Modified | Placeholder → link. **One line** |
| `src/components/app-shell/{AppShell,Sidebar,BottomTabs,layout}.ts(x)` | **Unchanged** | Decisions 6 and [§0](#0-what-the-wireframe-does-not-match) |
| `src/test/{redirect-after-login,demo-banner-layout,app-shell-layout}.test.tsx` | Modified | Stub payloads gain both fields |
| `apps/web/eslint.config.js`, `apps/web/package.json` | Modified | `eslint-plugin-jsx-a11y` + scoped override |
| `apps/web/api/proxy.ts` | **Verify, likely unchanged** | `POST`/`DELETE` are proven in prod; **`PATCH` is not** — see Risks |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Hardening `esMeDto` locks the whole app out.** `requireSession` maps *any* non-ok result — including `parse` — to a redirect to `/login`. If the API ever stops sending either field, users cannot reach any authenticated route | Low | **High** | Both fields are required in the CI drift-gated contract and deployed. Fail-closed is still the right posture (the alternative is `undefined` typed as `string`). **Recorded in the rollback plan**: an API rollback past US-040/041 requires reverting this hardening *first* |
| **`PATCH` not forwarded by the Vercel proxy.** `DELETE`/`POST` are proven in production; `PATCH` has no precedent in this app | Medium | High | A first-slice pre-flight: exercise `PATCH /api/perfil` through the proxy in preview before building on it. Cheap to check, expensive to discover after the UI is written |
| **The wireframe's header is read as a rename order**, triggering an app-shell redesign | Medium | High | [§0](#0-what-the-wireframe-does-not-match) states the reading explicitly and lists it as an issue action item |
| **Sequential save leaves a state nobody specified** | Medium | Medium | [§3](#3-one-button-two-calls-one-honest-order) specifies exactly one reachable partial state and proves the other is unreachable. Both are test rows |
| **The UI invents specificity the API forbids** (naming "email taken") | Medium | Medium | [§4](#4-error-mapping-verbatim-copy) is a closed table of client constants; tests assert verbatim strings. No server string is ever rendered |
| **Scoped `error` a11y rules quietly stop applying** when files move out of the override glob | Medium | Low | Glob the directory (`src/components/configuracion/**`), not individual files; the follow-up promotes it app-wide |
| **`Configuracion`/`Categorias` unaccented ship next to `Configuración`** | High | Low | Issue action item 2. Verbatim as instructed, flagged for confirmation before `sdd-spec` |
| **Green pill has no semantic token**, so a raw palette class sneaks in and breaks `DCR-03` | Medium | Low | Named in [§7](#7-ca-04-without-a-new-tier); `DCR-06` (AA) is the acceptance bar |
| **Unsaved edits lost on the Google redirect** | Medium | Low | The dialog says so, verbatim, before the user confirms |

## Success criteria

- [ ] **CA-01** — the sidebar-footer account icon **and** the `Configuración` nav item both navigate to
      `/configuracion`; an unauthenticated visit redirects to `/login` with `?redirect=/configuracion`
- [ ] **CA-02** — the content panel matches the wireframe: two columns, `Editar perfil`, three blocks
      with dividers, `Guardar cambios` right-aligned; copy verbatim
- [ ] **CA-03** — a successful save shows its confirmation and invalidates `['auth-me']`; every failure
      shows exactly one message from [§4](#4-error-mapping-verbatim-copy) and nothing more specific
- [ ] **CA-04** — at T1's width the page renders the T1 proportions, with **no** new constant in
      `layout.ts` and no change to `AppShell`/`Sidebar`/`BottomTabs`
- [ ] **CA-05** — every input is reachable via `getByLabelText`; `pnpm web lint` is clean with jsx-a11y
      at `error` over `src/components/configuracion/**` and the route file
- [ ] `esMeDto` rejects a `MeDto` missing or mistyping `nombre`/`googleVinculado`; the three repaired
      stubs are green
- [ ] Landing on `/configuracion` fetches `/api/auth/me` **exactly once**
- [ ] `PATCH /api/perfil/password` is never called after a failed `PATCH /api/perfil`
- [ ] `?google=vinculado|error` renders its message once and leaves a clean URL
- [ ] A demo session sees disabled controls and, if forced, the demo copy
- [ ] Zero files changed under `apps/api/` and `apps/mobile/`
- [ ] `pnpm web typecheck`, `pnpm web test` and `pnpm web lint` all green

## Delivery forecast

**Chained PRs recommended: Yes** · **400-line budget risk: High** · **Decision needed before apply: Yes**

Seven logically distinct pieces, ~10 new source files plus their specs, plus three repaired stubs. Even
split in two, each slice plausibly lands near the budget once tests are counted. `sdd-tasks` owns the
binding forecast.

| PR | Content | Why it stands alone |
|----|---------|---------------------|
| **#1 — Page and profile** | `__root` context typing; `use-me` + priming; `esMeDto` hardening + stub repairs; route + `validateSearch`; nav flip + footer link; jsx-a11y wiring; `perfil.ts` (profile + password); the form and the sequential save | Ships CA-01, CA-02's first two blocks, CA-03 and CA-05 end to end. The identity/guard change gets a review of its own, with the app-wide lockout risk in front of the reviewer |
| **#2 — Google and layout** | Linked/not-linked section; link + unlink dialogs; `?google=` handling; the fluid T1 grid and the stacked sub-`lg` layout | Ships CA-02's third block and CA-04. Depends on #1 only for the page shell it plugs into |

## Rollback plan

1. **No migration, no server state, no data transformation.** `git revert` + redeploy: the route
   disappears, `Configuración` returns to a placeholder, `esMeDto` returns to three checks.
2. **Profile edits and Google links already made survive the revert** and keep working — they are
   ordinary API state written by deployed, unreverted endpoints.
3. **Ordering constraint (the one real trap):** if `apps/api` is ever rolled back past US-040/US-041,
   revert the `esMeDto` hardening **first or together** — a hardened guard against a contract that no
   longer sends `nombre`/`googleVinculado` bounces every authenticated route to `/login`.
4. **One transient edge:** a user mid-OAuth at revert time returns to `/configuracion?google=…` and
   gets a 404 instead of a confirmation. Their link was still written server-side; the next login shows
   the correct state. No corruption, no retry needed.

## Capabilities

### New capabilities

None.

### Modified capabilities

- `web-app`: a new `WCFG-*` requirement family for the Configuración route, its entry points, the
  Perfil form and its sequential-save contract, the error/copy table, the Google section and the
  `?google=` return contract, the demo behaviour, and the CA-04 fluid layout. Follows the file's
  existing per-feature prefix convention (`WCAT-*`, `WPER-*`, `WMYP-*`, `DCR-*`, `WAC-*`).
  **`WAC-02` ("Runtime Guards and Error Handling Are Unchanged") must be re-read by `sdd-spec`** — the
  `esMeDto` hardening is precisely a runtime-guard change and may need a delta there.

`perfil-usuario`, `vinculacion-google`, `user-authentication`, `api-client` and every backend
capability are **consumed, not modified**. If a spec delta appears against any of them, the proposal
was misread.

## Open questions (non-blocking — resolve in design)

1. **Does the `Vinculada:` pill show the account email or no address at all?** The API never exposes
   the Google address; showing `me.email` is truthful but arguably implies the Google account matches.
   Leaning: show it, matching the wireframe.
2. **Which token pairing carries the green pill** ([§7](#7-ca-04-without-a-new-tier)). Leaning: alias
   the AA-verified `ingreso` pair under a link-state name rather than inventing a colour.
3. **Does `Guardar cambios` need the leaving-the-app warning too?** It does not navigate away — but a
   user who fills the form and then clicks `Vincular con Google` loses it. Leaning: the dialog warning
   ([§5](#5-the-google-section)) is enough; a blocking `beforeunload` is worse than the problem.
4. **Does the password-change success line need to mention revoked sessions** at all
   (`"Se cerraron tus otras sesiones."`)? Leaning: yes — it is a real, surprising consequence
   (PERF040-06) and silence about it generates support questions.
5. **`Categorias` placeholder affordance** — `aria-disabled` inert text (the `NAV_ITEMS` precedent) or a
   visible "Próximamente" hint. Leaning: match `NAV_ITEMS`, and let US-043 flip it in one line.
