# Web App UI Specification — Delta (apps/web)

## Purpose

Adds the `Configuración` → `Perfil` page: a session-protected route that lets a logged-in user read
their identity, edit `nombre`/`email`, rotate their password, and link/unlink Google — consuming the
deployed `perfil-usuario` (`PERF040-*`) and `vinculacion-google` (`VINC041-*`) contracts. New
requirement family `WCFG-*`.

**WAC-02 reviewed, no delta needed.** WAC-02 textually scopes its guard list to
`apps/web/src/api/client.ts` and its "MUST NOT be edited" constraint to the api-client-package
migration's diff. `esMeDto` lives in `apps/web/src/api/auth.ts`, a different file with its own
pre-existing guard-hardening precedent (the fail-closed `esDemo ⇔ email` invariant already there).
WCFG-04 below adds the hardening; WAC-02 is left untouched.

## ADDED Requirements

### Requirement: WCFG-01 — Route is session-protected and reachable from two entry points (CA-01)

`/configuracion` MUST render only inside the `_authenticated` layout's existing session guard, with no
new guard code. It MUST be reachable both from the `Configuración` nav item (`NAV_ITEMS`, shared by
`Sidebar`/`BottomTabs`) and from an icon link in the sidebar footer (`aria-label="Configuración de la
cuenta"`, no user name rendered).

#### Scenario: Unauthenticated visit redirects to login

- GIVEN no active session
- WHEN the browser navigates to `/configuracion`
- THEN it redirects to `/login?redirect=/configuracion`

#### Scenario: Both entry points reach the page

- GIVEN an authenticated session
- WHEN the user activates the `Configuración` nav item, or the sidebar-footer icon link
- THEN both navigate to `/configuracion`

### Requirement: WCFG-02 — Perfil layout matches the verbatim visual contract (CA-02)

The page MUST render, in order: heading `Editar perfil`; a vertical section-tab list with `Perfil`
carrying `aria-current="page"` and a `Categorías` placeholder tab (inert, same treatment as
`NAV_ITEMS`' unfinished destinations); three divided blocks — `Nombre`/`Email`, `Cambiar password`
(`Password actual`/`Password nueva`), `Cuenta de Google` — followed by one right-aligned `Guardar
cambios` button. The Google block MUST render exactly one of two structurally symmetric states, driven
by `me.googleVinculado`.

#### Scenario: Linked state renders the green pill and Desvincular

- GIVEN `me.googleVinculado` is `true`
- WHEN the Cuenta de Google block renders
- THEN it shows the pill `Vinculada: {me.email}` and a `Desvincular` button, not `Vincular con Google`

#### Scenario: Not-linked state renders the neutral pill and Vincular

- GIVEN `me.googleVinculado` is `false`
- WHEN the Cuenta de Google block renders
- THEN it shows a neutral `No vinculada` pill and a `Vincular con Google` button, in the same layout
  position `Desvincular` would occupy

### Requirement: WCFG-03 — Identity is fetched once per visit and invalidated after mutation

`useMe()` (query key `['auth-me']`) MUST NOT issue a network request when the route guard's
`beforeLoad` has already primed the cache for the same visit. `GET /api/auth/me` MUST be requested
exactly once when landing on `/configuracion`. Every successful profile, password, link, or unlink
mutation MUST invalidate `['auth-me']`.

#### Scenario: Exactly one fetch on landing

- GIVEN an authenticated session
- WHEN the user navigates to `/configuracion`
- THEN `GET /api/auth/me` is called exactly once (by `beforeLoad`), not a second time by `useMe()`

#### Scenario: A successful save invalidates identity

- GIVEN the profile save succeeds
- WHEN the mutation resolves
- THEN `['auth-me']` is invalidated and any component reading `useMe()` re-renders with fresh data

### Requirement: WCFG-04 — `esMeDto` rejects a payload missing or mistyping `nombre`/`googleVinculado`

`apps/web/src/api/auth.ts`'s `esMeDto` guard MUST additionally validate that `nombre` is a `string` and
`googleVinculado` is a `boolean`, on top of its existing `userId`/`esDemo`/email-invariant checks, and
MUST return `{ tag: 'parse' }` (never a defaulted value) when either is missing or mistyped.

#### Scenario: Missing or mistyped required field is rejected

- GIVEN a `GET /api/auth/me` payload missing `nombre`, missing `googleVinculado`, or where either has
  the wrong type
- WHEN `esMeDto` validates it
- THEN it returns `false` and `fetchMe()` resolves to `{ tag: 'parse' }`

#### Scenario: A valid payload with both fields is accepted

- GIVEN a payload carrying valid `nombre: string` and `googleVinculado: boolean` alongside the existing
  fields
- WHEN `esMeDto` validates it
- THEN it returns `true`

#### Scenario: The hardening's app-wide consequence is fail-closed by design

- GIVEN the API ever stops sending `nombre` or `googleVinculado` on `/api/auth/me`
- WHEN `requireSession` calls `fetchMe` during any authenticated route's `beforeLoad`
- THEN the resulting `{ tag: 'parse' }` is treated as a non-ok result and every authenticated route
  redirects to `/login` — an accepted, documented risk, not a bug

### Requirement: WCFG-05 — `Guardar cambios` diffs the form and calls only what changed

One `Guardar cambios` control MUST send `PATCH /api/perfil` only if `nombre` and/or `email` changed
from `me`, and `PATCH /api/perfil/password` only if `Password nueva` is non-empty. If neither changed,
no request MUST be sent and `"No hay cambios para guardar."` MUST be shown.

#### Scenario: Only the password changed sends a single call

- GIVEN `Nombre`/`Email` are unchanged and `Password nueva` has a value
- WHEN `Guardar cambios` is activated
- THEN only `PATCH /api/perfil/password` is called

#### Scenario: Nothing changed makes no request

- GIVEN no field is dirty and `Password nueva` is empty
- WHEN `Guardar cambios` is activated
- THEN no request is sent and `"No hay cambios para guardar."` is shown

### Requirement: WCFG-06 — Profile call precedes the password call, and its failure aborts the sequence

WHEN both `nombre`/`email` and `Password nueva` changed, `PATCH /api/perfil` MUST be sent and MUST
resolve before `PATCH /api/perfil/password` is sent. `PATCH /api/perfil/password` MUST NOT be called if
`PATCH /api/perfil` fails, for any reason.

#### Scenario: Both changed — profile call precedes and gates the password call

- GIVEN `Email` changed and `Password nueva` has a value, both with a correct `Password actual`
- WHEN `Guardar cambios` is activated
- THEN `PATCH /api/perfil` is called and resolves before `PATCH /api/perfil/password` is called

#### Scenario: A taken email with a correct password aborts the password call and protects the account

- GIVEN `Email` is changed to an address already owned by another user, `Password nueva` also has a
  value, and `Password actual` is the user's own correct password
- WHEN `Guardar cambios` is activated
- THEN `PATCH /api/perfil` returns `403 PERFIL_RECHAZADO`
- AND `PATCH /api/perfil/password` is never called
- AND the user's password is not rotated and no other session is revoked (this is the case a reversed
  order or a missing abort would silently break)

### Requirement: WCFG-07 — Partial failure (profile saved, password failed) leaves a specified state

WHEN the profile call succeeds and the subsequent password call fails, the UI MUST show
`"Se guardaron tus datos, pero no se pudo cambiar la password."` followed by the specific password
error, MUST re-derive `Nombre`/`Email` from the refreshed `useMe()` (no longer dirty), and MUST retain
`Password actual`/`Password nueva` uncleared so the next submit sends only `PATCH /api/perfil/password`.

#### Scenario: Partial failure preserves password inputs and narrows the retry

- GIVEN the profile call succeeded and the password call then failed
- WHEN the failure state renders
- THEN `Nombre`/`Email` show the saved values, `Password actual`/`Password nueva` still hold what the
  user typed, and the next `Guardar cambios` click sends only `PATCH /api/perfil/password`

### Requirement: WCFG-08 — `Password actual` is the single authorisation input

`Password actual` MUST be required, and block submission client-side, whenever `Email` differs from
`me.email`. `Vincular con Google` and `Desvincular` MUST each open a `role="alertdialog"` confirmation
requesting `Password actual` before sending their request.

#### Scenario: Editing email without a password blocks submission

- GIVEN `Email` was changed and `Password actual` is empty
- WHEN the user activates `Guardar cambios`
- THEN no request is sent and the empty field is flagged

#### Scenario: Link and unlink dialogs require the password before confirming

- GIVEN either dialog is open
- WHEN the user attempts to confirm with `Password actual` empty
- THEN the confirm action is blocked until a value is entered

### Requirement: WCFG-09 — Error and success copy is a closed, verbatim table (CA-03)

| Outcome | Verbatim copy | Region |
|---|---|---|
| Saved, no password change | `Cambios guardados.` | `aria-live="polite"` |
| Saved, password changed | `Cambios guardados. Se cerraron tus otras sesiones.` | `aria-live="polite"` |
| Profile saved, password failed | `Se guardaron tus datos, pero no se pudo cambiar la password.` | `role="alert"` |
| `403 PERFIL_RECHAZADO` on profile | `No se pudieron guardar los cambios. Revisa tu password actual y el email.` | `role="alert"` |
| `403 PERFIL_RECHAZADO` on password | `No se pudo cambiar la password. Revisa tu password actual.` | `role="alert"` |
| `400` on `nombre` | `El nombre debe tener entre 1 y 80 caracteres.` | `role="alert"` |
| `400` on `passwordNueva` | `La password nueva no cumple los requisitos mínimos.` | `role="alert"` |
| `403 DEMO_SOLO_LECTURA` | `Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.` | `role="alert"` |
| `tag: 'network'` | `No se pudo conectar con el servidor.` | `role="alert"` |
| Any other non-2xx | `Ocurrió un error inesperado. Intenta nuevamente.` | `role="alert"` |
| `tag: 'unauthorized'` | (no message) `navigate({ to: '/login' })` | — |

No row MUST render a server-supplied string or a message more specific than this table, even when the
underlying `403 PERFIL_RECHAZADO` cause is a wrong password vs. a taken email.

#### Scenario: A taken email and a wrong password render the identical generic copy

- GIVEN two separate `403 PERFIL_RECHAZADO` responses, one caused by a taken email and one by a wrong
  `passwordActual`
- WHEN each is mapped to UI copy
- THEN both render the exact same string from this table, with no cause named

#### Scenario: Demo session shows the register-guidance copy

- GIVEN a demo session forces a mutation to run
- WHEN `403 DEMO_SOLO_LECTURA` returns
- THEN the exact demo copy row above is shown

### Requirement: WCFG-10 — The `?google=` return contract is validated, single-surfaced, and cleans the URL

`validateSearch` MUST narrow `google` to the literal union `'vinculado' | 'error'`, dropping any other
value to `undefined`. On mount the route MUST read it once into local state, then
`navigate({ to: '/configuracion', search: {}, replace: true })`. The rendered message MUST survive that
URL rewrite and MUST NOT reappear on refresh or back navigation. No refetch beyond the one already
primed by `beforeLoad` is required.

#### Scenario: `vinculado` and `error` each render their own message once

- GIVEN the route is loaded with `?google=vinculado`
- WHEN the page mounts
- THEN `Vinculaste tu cuenta de Google.` renders once and the URL becomes `/configuracion`
- GIVEN `?google=error` instead
- THEN `No se pudo vincular tu cuenta de Google. Intenta nuevamente.` renders once

#### Scenario: An unknown value renders nothing, and the message does not reappear on refresh

- GIVEN `?google=unknown-value`
- WHEN the page mounts
- THEN no Google-return message renders
- GIVEN a valid value already rendered its message and cleaned the URL
- WHEN the page is refreshed or the user navigates back
- THEN the message does not reappear

### Requirement: WCFG-11 — CA-04 fluid layout reproduces T1 without a new breakpoint tier

The page's own grid MUST be fluid (a fixed-width first column plus a flexible panel) and MUST reproduce
T1's measured proportions at T1's viewport width without adding any constant to `layout.ts` or changing
`AppShell`/`Sidebar`/`BottomTabs`. Below the shell's `lg` breakpoint the page's two columns MUST stack
(heading + tab list above the panel).

#### Scenario: T1 width reproduces the measured proportions

- GIVEN the viewport is at T1's width
- WHEN the page renders
- THEN the sidebar width/font are unchanged and the page's own gutter/panel measurements match T1,
  with no new entry in `layout.ts`

#### Scenario: Below `lg` the columns stack

- GIVEN the viewport is below the shell's `lg` breakpoint
- WHEN the page renders
- THEN the heading and tab list appear above the panel instead of beside it

### Requirement: WCFG-12 — Configuración inputs satisfy CA-05 a11y and the scoped lint gate

`eslint-plugin-jsx-a11y` MUST be installed and enabled at `error` severity via a path override scoped to
`src/components/configuracion/**` and the route file (`warn` elsewhere). Every form input on the page
MUST have an associated `<label>` reachable via `getByLabelText`.

#### Scenario: Every input is reachable by its label

- GIVEN the rendered Perfil form
- WHEN each input is queried by `getByLabelText` with its verbatim label (`Nombre`, `Email`, `Password
  actual`, `Password nueva`)
- THEN each query resolves to exactly one input

#### Scenario: The scoped lint gate is clean

- GIVEN the new files under `src/components/configuracion/**` and the route file
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

### Requirement: WCFG-13 — Both mandatory gates must be green

`pnpm web typecheck` and `pnpm web test` MUST both pass. A green `pnpm web test` alone MUST NOT be
treated as sufficient, since it does not perform type-checking and cannot catch a `tsr generate`/`tsc`
failure from the new route file.

#### Scenario: Both gates pass before the change is considered done

- GIVEN the implementation is complete
- WHEN `pnpm web typecheck` and `pnpm web test` are run
- THEN both exit successfully

## Non-Goals

| Excluded | Reason |
|---|---|
| The `Categorías` section's real content | US-043; the tab renders inert |
| Mobile Configuración | US-044 |
| Any `apps/api` change | Both contracts already deployed |
| A header/top-bar redesign of `AppShell` | Wireframe header is illustrative chrome, not a spec |
| A new breakpoint tier in `layout.ts` | WCFG-11 reproduces T1 fluidly instead |
| Promoting `jsx-a11y` to `error` app-wide, `vitest-axe`/`@axe-core` | Recorded follow-up, not this change |
| Password recovery/reset, new-email verification | Deferred at the API level (`perfil-usuario` Non-Goals) |
| A "confirm new password" field | Wireframe has two password inputs, not three |
